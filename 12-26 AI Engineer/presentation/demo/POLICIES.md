# Policies

One policy set for every agent. Each policy is an intent plus the live query
that proves it. A policy holds only if a query run now says so.

The resource names below come from the StackQL provider docs. Treat the SQL as
a starting point and confirm columns with `describe_method` before running it.

| ID     | Policy                                                                 |
| ------ | ---------------------------------------------------------------------- |
| POL-01 | Converged: every resource in `STACK.md` exists and matches its intent. |
| POL-02 | Owned: the stack has a live, accountable owner group.                  |
| POL-03 | Tagged: every AWS resource carries the five required tags.             |
| POL-04 | Private: storage is never public and is encrypted at rest.             |
| POL-05 | No dangling DNS: every stack record points at a live stack resource.   |
| POL-06 | Fronted: origins are reached through the proxy, not directly.          |
| POL-07 | Recoverable: stored data can be rolled back.                           |
| POL-08 | No strays: nothing claims this stack that `STACK.md` does not list.    |
| POL-09 | In region: stack resources exist only in the intended region.          |

## How to prove each policy

### POL-01 Converged

Query each resource in `STACK.md` and compare every listed property. A missing
resource or a differing property is a FAIL that names the property.

### POL-02 Owned

- A group named as the owner exists in `entra_id.groups.groups` with
  `securityEnabled` true.
- `entra_id.groups.members` (by `group_id`) joined to `entra_id.users.users`
  returns at least one member.
- Every member has `accountEnabled` true and a `userType` that is not `Guest`.
- The bucket's `Owner` tag and the DNS record's comment name that same group.

### POL-03 Tagged

The bucket's `tags` hold `Stack`, `Environment`, `Owner`, `CostCentre` and
`ManagedBy`, with the values in `STACK.md`.

### POL-04 Private

```sql
SELECT bucket_name,
  json_extract(public_access_block_configuration, '$.BlockPublicAcls') AS block_public_acls,
  json_extract(public_access_block_configuration, '$.RestrictPublicBuckets') AS restrict_public_buckets,
  json_extract(bucket_encryption, '$.ServerSideEncryptionConfiguration[0].ServerSideEncryptionByDefault.SSEAlgorithm') AS sse_algorithm
FROM awscc.s3.buckets
WHERE region = 'us-east-1'
AND Identifier = 'stackql-agentic-demo-origin';
```

All four public access block settings are true and an encryption algorithm is
set.

### POL-05 No dangling DNS

Read the stack record from `cloudflare.dns.zones_dns_records` (find `zone_id`
in `cloudflare.zones.zones` by name). Take the bucket name from the record's
target and confirm that bucket exists in `awscc.s3.buckets`. A record whose
target bucket does not exist is a takeover risk and a FAIL.

### POL-06 Fronted

The stack record has `proxied` true.

### POL-07 Recoverable

`json_extract(versioning_configuration, '$.Status')` on the bucket is
`Enabled`.

### POL-08 No strays

- Buckets: any name in `awscc.s3.buckets_list_only` starting
  `stackql-agentic-demo` that `STACK.md` does not list.
- DNS: any record in the zone whose name or comment mentions `agentic-demo`
  that `STACK.md` does not list.
- Groups: any group whose display name contains `agentic-demo` that `STACK.md`
  does not list.

A stray is reported, never changed.

### POL-09 In region

The bucket is in the region named in `STACK.md`.

## Repairs

A `delete_safe` agent may repair a FAIL on POL-01, POL-03, POL-04, POL-06 and
POL-07 by setting the property back to its intended value. For the bucket that
is an `UPDATE awscc.s3.buckets SET PatchDocument = '<RFC 6902 JSON>'` scoped by
`region` and `Identifier`. Every other FAIL is a proposal for a human.

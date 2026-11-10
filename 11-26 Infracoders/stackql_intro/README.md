# StackQL primer: cloud providers as tables

Nine statements for `stackql shell` across three providers (AWS, Cloudflare, GitHub): selects against live APIs, joins across providers, group by aggregates and window functions.

## what is deployed

A small `stackql-deploy` stack in `stack/` gives the statements something to read.

| Resource | Provider | Detail |
| --- | --- | --- |
| `web_server` | aws | one `t4g.nano` in ap-southeast-2: default VPC, default security group (no inbound), no key pair |
| `app`, `deploy`, `registry` | cloudflare | A records in `stackql.xyz` pointing at the instance; each record's comment names the GitHub repository that owns the hostname |
| `legacy` | cloudflare | an A record pointing at 203.0.113.10, an address nothing runs on |

GitHub is read only: the public repositories of the `stackql` organisation.

Running cost is about one US cent an hour (instance, public IPv4 address, 8 GB volume).

## setup

```bash
cd "11-26 Infracoders/stackql_intro"
cp .env.example .env     # once: AWS keys, Cloudflare token and zone, GitHub user and token
source .env
```

## provision

Once, about 30 seconds. Running it again changes nothing.

```bash
source .env
stackql-deploy build stack intro
```

## the primer

```bash
source .env
stackql shell
```

The statements below are also in `shell.iql`. One at a time.

### 1. providers

Lists the providers pulled into this directory.

```sql
SHOW PROVIDERS;
```

Each provider is a versioned interface document from the StackQL registry.

### 2. methods

Lists the API methods behind one resource.

```sql
SHOW METHODS IN cloudflare.dns.zones_dns_records;
```

`list` is a SELECT and `create` is an INSERT: SQL verbs map to provider API calls.

### 3. one provider

Reads the EC2 instances in Sydney.

```sql
SELECT instance_type, architecture, private_ip_address, launch_time
FROM aws.ec2.instances
WHERE region = 'ap-southeast-2';
```

Rows come from the live API at query time; nothing is stored.

### 4. a second provider

Reads the A records in a Cloudflare zone, in the same language.

```sql
SELECT name, type, content, ttl
FROM cloudflare.dns.zones_dns_records
WHERE zone_id = '30850494d46bca19a6b11b842bdac9ff'
  AND type = 'A';
```

Three hostnames share one address and `legacy` points somewhere else (`azure-demo` is an older record in the same zone).

### 5. two providers, one join

Joins the DNS records to the EC2 network interfaces on the address.

```sql
SELECT d.name AS hostname, d.content AS ip, n.instance_id, n.availability_zone
FROM cloudflare.dns.zones_dns_records d
INNER JOIN (
  SELECT json_extract(association, '$.publicIp')  AS public_ip,
         json_extract(attachment, '$.instanceId') AS instance_id,
         availability_zone
  FROM aws.ec2.network_interfaces
  WHERE region = 'ap-southeast-2'
) n ON d.content = n.public_ip
WHERE d.zone_id = '30850494d46bca19a6b11b842bdac9ff'
  AND d.type = 'A';
```

Three hostnames resolve to one instance: Cloudflare and AWS in one statement.

### 6. three providers

Adds GitHub: each record's comment names the repository that owns the hostname.

```sql
SELECT d.name AS hostname, d.content AS ip, n.instance_id, g.name AS repo, g.pushed_at AS last_push
FROM cloudflare.dns.zones_dns_records d
LEFT JOIN (
  SELECT json_extract(association, '$.publicIp')  AS public_ip,
         json_extract(attachment, '$.instanceId') AS instance_id
  FROM aws.ec2.network_interfaces
  WHERE region = 'ap-southeast-2'
) n ON d.content = n.public_ip
INNER JOIN github.repos.repos g ON d.comment = g.name
WHERE d.zone_id = '30850494d46bca19a6b11b842bdac9ff'
  AND d.type = 'A'
  AND g.org = 'stackql';
```

`legacy` has no instance behind it, and its repository was last pushed in February 2025.

### 7. group by

Counts the organisation's repositories and stars by language.

```sql
SELECT language, COUNT(*) AS repos, SUM(stargazers_count) AS stars
FROM github.repos.repos
WHERE org = 'stackql'
GROUP BY language
HAVING SUM(stargazers_count) > 0
ORDER BY stars DESC
LIMIT 6;
```

An aggregate over an API, computed by the engine.

### 8. group by across regions

Counts instances by type across four regions.

```sql
SELECT region, instance_type, COUNT(*) AS instances
FROM aws.ec2.instances
WHERE region IN ('ap-southeast-2', 'us-west-2', 'us-east-1', 'eu-central-1')
GROUP BY region, instance_type;
```

`region IN (...)` fans one statement out across regions; a region with no instances returns no rows.

### 9. window functions

Ranks repositories within their language and keeps a running total of stars.

```sql
SELECT name, language, stargazers_count AS stars,
       RANK() OVER (PARTITION BY language ORDER BY stargazers_count DESC) AS rank_in_language,
       SUM(stargazers_count) OVER (ORDER BY stargazers_count DESC) AS running_stars
FROM github.repos.repos
WHERE org = 'stackql'
ORDER BY stargazers_count DESC
LIMIT 8;
```

Window functions over live API data.

## remove

After the demo. Deletes the four records and terminates the instance; nothing else in the zone or the account is touched.

```bash
source .env
stackql-deploy teardown stack intro
```

## notes

- The zone id in statements 4 to 6 is the `stackql.xyz` zone. With another zone in `.env`, change it here and in `shell.iql`.
- Statements 5 and 6 read instance ids and public addresses from `aws.ec2.network_interfaces`, because `aws.ec2.instances` in provider `v26.08.00444` returns null for `instance_id`, `state` and `public_ip_address`.
- Provisioned, removed and provisioned again on 10 November 2026 with stackql v1.0.888 and stackql-deploy 2.4.0. Each statement returns in 1 to 8 seconds.

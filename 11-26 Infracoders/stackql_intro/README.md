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

Reads the A records in a Cloudflare zone, found by name, in the same language.

```sql
SELECT d.name, d.type, d.content, d.ttl
FROM cloudflare.zones.zones z
INNER JOIN cloudflare.dns.zones_dns_records d ON d.zone_id = z.id
WHERE z.name = 'stackql.xyz'
  AND d.type = 'A';
```

Three hostnames share one address and `legacy` points somewhere else (`azure-demo` is an older record in the same zone).

### 5. two providers, one join

Joins the DNS records to the EC2 network interfaces on the address.

```sql
SELECT d.name AS hostname, d.content AS ip, n.instance_id, n.availability_zone
FROM cloudflare.zones.zones z
INNER JOIN cloudflare.dns.zones_dns_records d ON d.zone_id = z.id
INNER JOIN (
  SELECT json_extract(association, '$.publicIp')  AS public_ip,
         json_extract(attachment, '$.instanceId') AS instance_id,
         availability_zone
  FROM aws.ec2.network_interfaces
  WHERE region = 'ap-southeast-2'
) n ON d.content = n.public_ip
WHERE z.name = 'stackql.xyz'
  AND d.type = 'A';
```

Three hostnames resolve to one instance: Cloudflare and AWS in one statement.

### 6. three providers

Adds GitHub: each record's comment names the repository that owns the hostname.

```sql
WITH dns AS (
  SELECT d.name, d.content, d.comment
  FROM cloudflare.zones.zones z
  INNER JOIN cloudflare.dns.zones_dns_records d ON d.zone_id = z.id
  WHERE z.name = 'stackql.xyz'
    AND d.type = 'A'
),
eni AS (
  SELECT json_extract(association, '$.publicIp')  AS public_ip,
         json_extract(attachment, '$.instanceId') AS instance_id
  FROM aws.ec2.network_interfaces
  WHERE region = 'ap-southeast-2'
)
SELECT dns.name AS hostname, dns.content AS ip, eni.instance_id, g.name AS repo, g.pushed_at AS last_push
FROM dns
LEFT JOIN eni ON dns.content = eni.public_ip
INNER JOIN github.repos.repos g ON dns.comment = g.name
WHERE g.org = 'stackql';
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

Reads the last 14 days of traffic to a repository, one row per day, with the change on the day before, a 7-day moving average and a running total.

```sql
WITH daily AS (
  SELECT substr(json_extract(d.value, '$.timestamp'), 1, 10) AS day,
         json_extract(d.value, '$.count')   AS views,
         json_extract(d.value, '$.uniques') AS visitors
  FROM github.repos.view_traffic t, json_each(t.views) d
  WHERE t.owner = 'stackql'
    AND t.repo = 'stackql'
)
SELECT day, views, visitors,
       views - LAG(views) OVER (ORDER BY day) AS change,
       ROUND(AVG(views) OVER (ORDER BY day ROWS BETWEEN 6 PRECEDING AND CURRENT ROW)) AS avg_7d,
       SUM(views) OVER (ORDER BY day) AS running_total
FROM daily
ORDER BY day;
```

The API returns the days as one JSON array; `json_each` turns it into rows, and the window functions run over them.

## remove

After the demo. Deletes the four records and terminates the instance; nothing else in the zone or the account is touched.

```bash
source .env
stackql-deploy teardown stack intro
```

## notes

- Statements 4 to 6 find the zone by name, so no zone id is written in them. With another zone in `.env`, change `stackql.xyz` here and in `shell.iql`.
- Statement 6 puts the zone lookup in a `WITH` clause: a zone-by-name join and a `LEFT JOIN` cannot share one flat statement.
- Statements 5 and 6 read instance ids and public addresses from `aws.ec2.network_interfaces`, because `aws.ec2.instances` in provider `v26.08.00444` returns null for `instance_id`, `state` and `public_ip_address`.
- Statement 9 needs a GitHub token with push access to the repository; GitHub only shows traffic to people who can push.
- Provisioned, removed and provisioned again on 10 November 2026 with stackql v1.0.888 and stackql-deploy 2.4.0. Each statement returns in 1 to 8 seconds.

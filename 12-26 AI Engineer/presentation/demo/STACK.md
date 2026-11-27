# Stack intent: agentic-demo

This file is the desired state. It is intent, not a template. There is no state
file: the live provider APIs are the only record of what exists.

## Identity

| Key          | Value                    |
| ------------ | ------------------------ |
| Stack        | `agentic-demo`           |
| Environment  | `demo`                   |
| Owner group  | `sg-agentic-demo-owners` |
| Cost centre  | `devrel`                 |
| AWS region   | `us-east-1`              |
| DNS zone     | `stackql.xyz`            |

## Resources

Create in this order, so that nothing ever points at something that does not
exist yet.

### 1. Owner group (Entra ID, provider `entra_id`)

- A security group with display name `sg-agentic-demo-owners`.
- Security enabled, not mail enabled, mail nickname `sg-agentic-demo-owners`.
- Description: `Owners of stack agentic-demo`.
- Membership is managed by humans. Agents never add or remove members.

### 2. Origin bucket (AWS, provider `awscc`)

- An S3 bucket named `stackql-agentic-demo-origin` in `us-east-1`.
- Tags: `Stack=agentic-demo`, `Environment=demo`,
  `Owner=sg-agentic-demo-owners`, `CostCentre=devrel`,
  `ManagedBy=stackql-agents`.
- Versioning enabled.
- Public access block: all four settings true.
- Default encryption: SSE-S3 (`AES256`).

### 3. Edge record (Cloudflare, provider `cloudflare`)

- In zone `stackql.xyz`, one CNAME record named `agentic-demo.stackql.xyz`.
- Target: `stackql-agentic-demo-origin.s3.us-east-1.amazonaws.com`.
- Proxied: true. TTL: automatic.
- Comment: `stack=agentic-demo owner=sg-agentic-demo-owners`.

## Scope

The three resources above are the whole stack. Every other group, bucket and
DNS record in these accounts is out of scope, including every other record in
`stackql.xyz`.

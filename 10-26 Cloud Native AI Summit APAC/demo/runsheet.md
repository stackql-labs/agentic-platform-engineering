# Runsheet

Terminal 1 is Git Bash (the shell scripts), Terminal 2 is PowerShell (the agent).

## Prerequisites

**Terminal 1 (Git Bash, leave it running):**

```bash
cd "/c/LocalGitRepos/stackql/demo-repos/agentic-platform-engineering/10-26 Cloud Native AI Summit APAC/demo"
scripts/proxy.sh
```

**Terminal 2 (PowerShell):**

```powershell
cd "C:\LocalGitRepos\stackql\demo-repos\agentic-platform-engineering\10-26 Cloud Native AI Summit APAC\demo\agent"
kubectl --context=kind-platform-demo -n shop get deploy,pods
# should show web 4/4 and one checkout pod in ImagePullBackOff.
```

If it does not, open a new Git Bash window (not Terminal 1, the proxy is in the foreground there) and reset:

```bash
cd "/c/LocalGitRepos/stackql/demo-repos/agentic-platform-engineering/10-26 Cloud Native AI Summit APAC/demo"
scripts/restore.sh && scripts/drift.sh && sleep 30
```

## StackQL Background

**StackQL** is a SQL interface to cloud and SaaS APIs: 

- providers are versioned interface documents pulled from a registry
- every query is a live API call
- there is no state file 

The **StackQL MCP server** puts that surface in front of an agent as a small, fixed set of tools:

- **universal**: same query shape across every provider, control plane and data plane alike
- **self-describing**: the agent discovers the one contract it needs, not a tool per API
- **gated**: the server mode decides whether a write runs, not the prompt
- **audited**: every statement is an event

An agent can work across clouds without a tool per endpoint or an SDK per cloud, and its tokens go on the decision rather than the plumbing.

### Quick demo, Terminal 2 (PowerShell):

```powershell
stackql shell
```

```sql
-- What is running, versus declared web x2 and checkout x1
SELECT json_extract(metadata, '$.name') AS deployment,
       json_extract(spec, '$.replicas') AS want,
       coalesce(json_extract(status, '$.readyReplicas'), 0) AS ready,
       coalesce(json_extract(status, '$.unavailableReplicas'), 0) AS unavailable,
       json_extract(spec, '$.template.spec.containers[0].image') AS image
FROM k8s.apps.deployments
WHERE namespace = 'shop' AND cluster_addr = 'localhost:8001' AND protocol = 'http';
```

web wants 4 replicas against a declared 2 and is fully ready; checkout is on an image tag that is not the declared one and has a replica it cannot make available.

```sql
--The pods, one row per container
SELECT json_extract(metadata, '$.name') AS pod,
       json_extract(status, '$.phase') AS phase,
       json_extract(cs.value, '$.ready') AS ready,
       json_extract(cs.value, '$.restartCount') AS restarts,
       coalesce(json_extract(cs.value, '$.state.waiting.reason'), 'Running') AS state
FROM k8s.core.pods, json_each(json_extract(status, '$.containerStatuses')) AS cs
WHERE namespace = 'shop' AND cluster_addr = 'localhost:8001' AND protocol = 'http';
```

Every web pod and the old checkout pod are Running; the new checkout pod is Pending in `ErrImagePull`.

```sql
--What the cluster itself says went wrong
SELECT reason, json_extract(involved_object, '$.name') AS object, count, last_timestamp, message
FROM k8s.core.events
WHERE namespace = 'shop' AND cluster_addr = 'localhost:8001' AND protocol = 'http' AND type = 'Warning'
ORDER BY count DESC;
```

The only Warning in the namespace is `ImagePullBackOff` on the new checkout pod.  

Same query shape, different provider:

```sql
--does the hotfix tag exist upstream
SELECT tag_name, published_at
FROM github.repos.releases
WHERE owner = 'hashicorp' AND repo = 'http-echo'
ORDER BY published_at DESC LIMIT 5;
```

Upstream's newest release is `v1.0.0`; there is no `1.0.1-hotfix`, so the tag never existed.  

You can join data across different providers as well:

```sql
-- each checkout pod's image tag, matched to the upstream GitHub release
SELECT p.pod, p.state, p.image, r.tag_name AS upstream_release
FROM (
  SELECT json_extract(metadata, '$.name') AS pod,
         coalesce(json_extract(status, '$.containerStatuses[0].state.waiting.reason'), 'Running') AS state,
         json_extract(spec, '$.containers[0].image') AS image
  FROM k8s.core.pods
  WHERE namespace = 'shop' AND cluster_addr = 'localhost:8001' AND protocol = 'http'
    AND json_extract(metadata, '$.labels.app') = 'checkout'
) p
LEFT JOIN (
  SELECT tag_name FROM github.repos.releases
  WHERE owner = 'hashicorp' AND repo = 'http-echo'
) r ON ltrim(r.tag_name, 'v') LIKE substr(p.image, instr(p.image, ':') + 1) || '%';
```

The running pod's tag matches `v1.0.0` upstream, the stuck pod's hotfix tag matches nothing, and that null is the diagnosis in one query across two providers.  

and perform analytic queries:

```sql
-- each deployment's share of the namespace, with a window function over a CTE
WITH live AS (
  SELECT json_extract(metadata, '$.name') AS deployment,
         CAST(json_extract(spec, '$.replicas') AS REAL) AS want,
         CAST(coalesce(json_extract(status, '$.readyReplicas'), 0) AS REAL) AS ready
  FROM k8s.apps.deployments
  WHERE namespace = 'shop' AND cluster_addr = 'localhost:8001' AND protocol = 'http'
)
SELECT deployment, want, ready,
       sum(want) OVER () AS namespace_replicas,
       round(100.0 * want / sum(want) OVER (), 1) AS pct_of_namespace,
       rank() OVER (ORDER BY want DESC) AS size_rank
FROM live;
```

web holds 4 of the namespace's 5 replicas, checkout 1, ranked by size: a window function over a CTE, against a live API, no warehouse in between.  

## Overview

This is a scheduled platform agent that...

- reads the live state of a Kubernetes namespace through StackQL
- compares it with what the deployment manifest declares; and
- decides for each difference whether to remediate, escalate or accept

Whether the proposed write actually runs is decided by the platform using the StackQL MCP server's mode, set in code and not changeable by the model.

| File | Point at |
| --- | --- |
| [stack/stackql_manifest.yml](stack/stackql_manifest.yml#L71-L76) | The desired state (no state file). |
| [agent/prompts/intent.md](agent/prompts/intent.md#L18-L35) | The briefing, in prose "decide, do not just detect", one write at most. |
| [agent/src/agent.ts](agent/src/agent.ts#L77-L82) | The platform sets the server mode in code (`read_only` or `safe`, never `full_access`). |
| [agent/src/agent.ts](agent/src/agent.ts#L270-L301) | The StackQL MCP server is the only tool surface; the approval handler is wired here. |
| [agent/src/agent.ts](agent/src/agent.ts#L376-L390) | The loop. |

## Run

**Terminal 2 (PowerShell, in `demo/agent`):** 

The agent runs in `read_only` mode: it reads deployments, pods, events and GitHub releases, proposes one `UPDATE` that the server refuses, and reports web = escalate, checkout = remediate.

```powershell
npm run agent
```

The agent's proposed `UPDATE`, replayed against a server in `safe` mode: the approval box appears, type `y`, and the checkout image is restored.

```powershell
$env:STACKQL_MCP_MODE='safe'; npm run probe
```

The audit sink from the run: a row per tool call with the tool, the mode, the decision and the statement. Never the rows returned.

```powershell
npm run audit
```

[OPTIONAL] Converge web back to 2 replicas with the same build that created the estate. The statecheck fails, the update runs. Needs a Git Bash window in the demo folder (not Terminal 1, the proxy is in the foreground there).

```bash
scripts/restore.sh
```

## Summary

- the agent queried reality before it acted;
  - and every decision was grounded in what the API returned
- it worked two providers, Kubernetes and GitHub, through one query shape;
  - with no SDK and no tool per API
- it proposed a fix for the outage only;
  - escalated the scale-up instead of reverting it
- whether that write ran was decided by a policy gate the platform owns;
  - not by the model
- every statement it ran is already an audit event

## Full reset

```bash
cd "/c/LocalGitRepos/stackql/demo-repos/agentic-platform-engineering/10-26 Cloud Native AI Summit APAC/demo"
scripts/restore.sh && scripts/drift.sh && sleep 30
```

## Troubleshooting

- No network or no cluster: `npm run replay` (banner says replay; say so).
- Node NotReady after a Docker restart (`kubectl --context=kind-platform-demo get nodes`): the kubelet is pointed at a stale IP. Fix in 10 s:

  ```bash
  IP=$(docker inspect platform-demo-control-plane --format '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}')
  MSYS_NO_PATHCONV=1 docker exec platform-demo-control-plane sed -i "s#https://172\.19\.0\.[0-9]*:6443#https://$IP:6443#" /etc/kubernetes/kubelet.conf
  MSYS_NO_PATHCONV=1 docker exec platform-demo-control-plane systemctl restart kubelet
  ```

  Last resort: `scripts/teardown.sh && scripts/setup.sh`, then proxy, build, drift (about 4 min).
- Step 2 declines without asking: not a real terminal. Use a plain Git Bash window.

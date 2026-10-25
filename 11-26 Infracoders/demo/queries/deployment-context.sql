-- Read-only StackQL MCP query for the explicitly configured local proxy.
-- Replace no values: this query is intentionally fixed to the demo target.
SELECT json_extract(metadata, '$.name') AS deployment,
       json_extract(metadata, '$.labels.purpose') AS purpose,
       json_extract(metadata, '$.resourceVersion') AS resource_version,
       CAST(json_extract(spec, '$.replicas') AS INTEGER) AS desired_replicas,
       CAST(coalesce(json_extract(status, '$.readyReplicas'), 0) AS INTEGER) AS ready_replicas,
       json_extract(spec, '$.template.spec.containers[0].image') AS image
FROM k8s.apps.deployments
WHERE namespace = 'agent-context-demo'
  AND cluster_addr = '127.0.0.1:8002'
  AND protocol = 'http'
  AND json_extract(metadata, '$.labels.purpose') = 'infracoders-demo';

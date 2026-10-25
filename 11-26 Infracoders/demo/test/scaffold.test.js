import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const fixture = JSON.parse(
  readFileSync(new URL('../fixtures/deployment-context.json', import.meta.url), 'utf8'),
);
const query = readFileSync(new URL('../queries/deployment-context.sql', import.meta.url), 'utf8');
const manifest = readFileSync(new URL('../stack/stackql_manifest.yml', import.meta.url), 'utf8');
const deployScript = readFileSync(new URL('../run-deploy.ps1', import.meta.url), 'utf8');

test('fixture is visibly synthetic and scoped to the demo namespace', () => {
  assert.match(fixture.label, /^FIXTURE REPLAY/);
  assert.equal(fixture.cluster, 'infracoders-demo');
  assert.equal(fixture.namespace, 'agent-context-demo');
  assert.equal(fixture.purpose, 'infracoders-demo');
});

test('MCP query is a bounded read against the fixed local demo target', () => {
  assert.match(query, /^\s*--[\s\S]*?\bSELECT\b/i);
  assert.doesNotMatch(query, /\b(?:INSERT|UPDATE|DELETE|CREATE|DROP)\b/i);
  assert.match(query, /namespace = 'agent-context-demo'/);
  assert.match(query, /cluster_addr = '127\.0\.0\.1:8002'/);
  assert.match(query, /purpose.*infracoders-demo/);
});

test('deployment manifest and wrapper are fixed-target and dry-run by default', () => {
  assert.match(manifest, /k8s::v26\.08\.00453/);
  assert.match(manifest, /K8S_NAMESPACE/);
  assert.match(manifest, /infracoders-demo/);
  assert.match(manifest, /context-demo/);
  assert.match(deployScript, /ENABLE_INFRACODERS_DEMO/);
  assert.match(deployScript, /agent-context-demo/);
  assert.match(deployScript, /if \(-not \$Apply\)/);
  assert.match(deployScript, /--dry-run/);
  assert.match(deployScript, /APPLY \$expectedNamespace/);
});

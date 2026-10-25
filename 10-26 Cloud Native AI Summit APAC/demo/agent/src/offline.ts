import { pathToFileURL } from 'node:url';

import { requireExactFlag } from './cli.js';
import {
  createFixture,
  dispatchTool,
  evidenceId,
  executeApprovedRepair,
  issueApproval,
  planImageRepair,
} from './safety.js';

function main(): void {
  const args = process.argv.slice(2);
  requireExactFlag(args, '--offline', 'Usage: npm run smoke (offline fixture only; unknown flags are rejected)');

  const state = createFixture();
  const inventory = dispatchTool('get_inventory', { namespace: 'shop' }, state);
  if (!inventory.allowed) throw new Error('Offline inventory check failed.');
  const denied = dispatchTool('run_sql', { sql: 'UPDATE anything' }, state);
  if (denied.allowed) throw new Error('Unknown tool was unexpectedly allowed.');

  const plan = planImageRepair(state, state.approvedDesiredState.image);
  const approval = issueApproval(plan, 'fixture-test-operator', Date.now(), 60, 'offline-smoke');
  const repair = executeApprovedRepair(state, plan, approval, 'safe', Date.now());
  if (repair.status !== 'verified') throw new Error(`Offline fixture verification failed: ${repair.reason}`);

  console.log('OFFLINE FIXTURE SMOKE - no network, key, cluster, or background process used');
  console.log(`inventory evidence: ${evidenceId(createFixture())}`);
  console.log(`unknown tool: ${JSON.stringify(denied.result)}`);
  console.log(`fixture repair: ${JSON.stringify(repair)}`);
  console.log(`fixture audit (ephemeral): ${JSON.stringify(state.audit)}`);
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    main();
  } catch (error: unknown) {
    console.error(error instanceof Error ? error.message : 'Unknown offline smoke failure');
    process.exitCode = 1;
  }
}

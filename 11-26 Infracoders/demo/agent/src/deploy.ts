/**
 * stackql-deploy, as the gate runs it: a fixed command line per action, the cell's own
 * declaration file, no arguments from the model beyond the cell's name (which the policy
 * has already matched against the declaration). The output is streamed, so the room sees
 * the exists and statecheck queries decide what happens.
 */
import { spawn } from 'node:child_process';

import type { Cell } from './cells.js';

export type DeployAction = 'test' | 'build';
export type DeployResult = {
  command: string;
  ok: boolean;
  exitCode: number | null;
  /** resources the run created or updated */
  changed: string[];
  /** resources that are not what the declaration says (after any update) */
  failed: string[];
  /** the lines worth keeping, without timestamps */
  lines: string[];
  seconds: number;
};

const strip = (s: string) => s.replace(/\x1b\[[0-9;]*m/g, '');

/** the command line for an action on a cell, relative to the demo root */
export const commandLine = (action: DeployAction, cell: Cell): string[] => [action, 'stack', cell.name, '--env-file', `cells/${cell.name}.env`];

/** a line of stackql-deploy output without its timestamp and level, or undefined for the noise */
export function keep(raw: string): string | undefined {
  const line = strip(raw).trimEnd();
  const m = line.match(/^\[[^\]]+ (INFO|WARN|ERROR) stackql_deploy\] (.*)$/);
  if (!m) return undefined; // frames, query text, the pgwire banner
  const msg = m[2].trim();
  return /exists$|does not exist|desired state|^creating \[|^updating \[|^test (passed|failed)|^deployment completed/.test(msg) ? msg : undefined;
}

/** what a run did, from the lines it printed */
export function summarise(lines: string[], exitCode: number | null): Pick<DeployResult, 'ok' | 'changed' | 'failed'> {
  const changed = new Set<string>();
  const state = new Map<string, boolean>(); // resource -> in the desired state, as last reported
  for (const l of lines) {
    const did = l.match(/^(?:creating|updating) \[([^\]]+)\]/);
    if (did) changed.add(did[1]);
    const is = l.match(/^\[([^\]]+)\] is (not )?in the desired state/);
    if (is) state.set(is[1], !is[2]);
    const failedTest = l.match(/^test failed for ([\w-]+)/);
    if (failedTest) state.set(failedTest[1], false);
  }
  const failed = [...state].filter(([, good]) => !good).map(([name]) => name);
  return { ok: exitCode === 0 && failed.length === 0, changed: [...changed], failed };
}

export function stackqlDeploy(
  action: DeployAction,
  cell: Cell,
  opts: { cwd: string; bin: string; env?: Record<string, string>; onLine?: (line: string) => void },
): Promise<DeployResult> {
  const args = commandLine(action, cell);
  const started = Date.now();
  const lines: string[] = [];
  return new Promise((resolve, reject) => {
    const child = spawn(opts.bin, args, { cwd: opts.cwd, env: opts.env ?? process.env, windowsHide: true });
    let rest = '';
    const take = (chunk: Buffer) => {
      const parts = (rest + chunk.toString()).split(/\r?\n/);
      rest = parts.pop() ?? '';
      for (const raw of parts) {
        const line = keep(raw);
        if (line === undefined) continue;
        lines.push(line);
        opts.onLine?.(line);
      }
    };
    child.stdout.on('data', take);
    child.stderr.on('data', take);
    child.on('error', (error) => reject(new Error(`could not run ${opts.bin}: ${error.message}`)));
    child.on('close', (exitCode) => {
      resolve({ command: `stackql-deploy ${args.join(' ')}`, exitCode, lines, seconds: (Date.now() - started) / 1000, ...summarise(lines, exitCode) });
    });
  });
}

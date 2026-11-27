/**
 * The policy gate: the platform's rules for a change, checked in code before anything
 * runs and before a human is asked. Pure: a request and the declaration in, a verdict
 * out. The model never sees this file and cannot change what it decides.
 *
 * The agent has no SQL write path at all. The gate takes three requests, each a fixed
 * stackql-deploy command against the reviewed stack. The model is given the last two;
 * `test` is the gate's own check, and yours from the terminal (npm run gate -- test syd):
 *
 *   test      check a cell against its declaration      read-only
 *   converge  assert a cell's declaration as it stands  puts back what drifted
 *   promote   move a cell to the candidate release       one line of declaration, then assert
 *
 * Rules for a promotion, in order:
 *   scope           the cell is one the declaration names
 *   candidate       the release is the rollout's candidate, not one the model chose
 *   no-op           the cell is not already declared at the candidate
 *   wave order      every earlier wave is already declared at the candidate
 *   one wave        a run promotes one wave; the next waits for the next run
 *   verification    every earlier-wave cell has passed a check made by the gate itself,
 *                   recently; the model saying a cell is healthy does not count
 *
 * The last rule is the point: the gate queries before it lets a mutation through.
 */
import type { Cell, Rollout } from './cells.js';

export type Action = 'test' | 'converge' | 'promote';
export type Request = { action: Action; cell: string; release?: string };

/** a check the gate made itself: a stackql-deploy test or build of a cell at a release */
export type Verification = { cell: string; release: string; passed: boolean; at: number };

export type GateState = {
  cells: Cell[];
  rollout: Rollout;
  /** checks made by the gate in this run, newest last */
  verified: Verification[];
  /** the wave this run has already promoted into, if any */
  promotedWave?: number;
  now: number;
  /** how long one of the gate's own checks stays good for */
  freshnessMs: number;
};

export type Verdict =
  | { ok: true; cell: Cell; verify: Cell[] } // verify: earlier-wave cells the gate must check before it proceeds
  | { ok: false; rule: string; reason: string };

const no = (rule: string, reason: string): Verdict => ({ ok: false, rule, reason });

/** the newest check of a cell at a release, if it passed and is still fresh */
export function freshPass(state: GateState, cell: Cell, release: string): boolean {
  const last = [...state.verified].reverse().find((v) => v.cell === cell.name);
  return Boolean(last && last.passed && last.release === release && state.now - last.at <= state.freshnessMs);
}

export function check(request: Request, state: GateState): Verdict {
  const cell = state.cells.find((c) => c.name === request.cell);
  if (!cell) return no('scope', `${JSON.stringify(request.cell)} is not a declared cell (${state.cells.map((c) => c.name).join(', ')})`);
  if (request.action === 'test' || request.action === 'converge') return { ok: true, cell, verify: [] };
  if (request.action !== 'promote') return no('action', `${JSON.stringify(request.action)} is not something this gate does`);

  const { candidate } = state.rollout;
  if (request.release !== candidate) {
    return no('candidate', `${JSON.stringify(request.release ?? '')} is not the candidate release; the rollout in flight is ${candidate}`);
  }
  if (cell.release === candidate) return no('no-op', `${cell.name} is already declared at ${candidate}; converge it instead`);

  const earlier = state.cells.filter((c) => c.wave < cell.wave);
  const behind = earlier.filter((c) => c.release !== candidate);
  if (behind.length > 0) {
    const list = behind.map((c) => `${c.name} (wave ${c.wave}) is declared at ${c.release}`).join('; ');
    return no('wave order', `wave ${cell.wave} cannot go before the waves in front of it: ${list}`);
  }
  if (state.promotedWave !== undefined && state.promotedWave !== cell.wave) {
    return no('one wave', `this run already promoted wave ${state.promotedWave}; wave ${cell.wave} waits for the next run`);
  }
  return { ok: true, cell, verify: earlier.filter((c) => !freshPass(state, c, candidate)) };
}

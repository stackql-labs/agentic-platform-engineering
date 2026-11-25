/**
 * The policy gate: the rules for a write, checked in code before a statement can reach the
 * server. Pure: a statement and what the system knows in, a verdict out. The model never
 * sees this file, and nothing the model reads can change what it decides.
 *
 * Four checks, in order. Each can say no on its own, and the first no ends it:
 *
 *   never        one statement, and it does not delete, drop or truncate
 *   one door     the only write is: UPDATE aws.dynamodb.tables SET DeletionProtectionEnabled
 *                = true, for this table in this region
 *   look first   the table was read, by this run, recently (query before mutation). If the
 *                end state already holds there is nothing to do and nothing is sent
 *   a person     a named person approved this exact statement, recently, and it is unused
 *
 * Three outcomes stop a write, and they are different on purpose:
 *
 *   refused   never allowed, or not allowed like this. Nobody is asked.
 *   held      allowed, but not without a person. Filed for approval, and the agent stops.
 *   noop      the end state already holds. Nothing to send.
 */
import { createHash } from 'node:crypto';

export type Outcome = 'refused' | 'held' | 'noop' | 'allowed';

/** the four checks, by the name they have on screen */
export const CHECKS = ['never', 'one door', 'look first', 'a person'] as const;
export type CheckName = (typeof CHECKS)[number];

/** how one check came out: it passed, it said no, it is waiting for a person, or it was not reached */
export type Check = { name: CheckName; state: 'ok' | 'no' | 'waiting' | 'not-reached'; note: string };

export type Verdict = { outcome: Outcome; rule: string; reason: string; checks: Check[] };

/** what the system saw the last time anybody read the table */
export type Look = { at: number; protectionOn: boolean };

/** a named person's yes, bound to one statement and one window of time */
export type Approval = { approver: string; statementId: string; approvedAt: number; expiresAt: number; used?: boolean };

export type Context = {
  region: string;
  table: string;
  now: number;
  freshnessMs: number;
  look?: Look;
  approval?: Approval;
};

/** a statement the way it is compared and hashed: one line, single spaces, no trailing semicolon */
export const normalise = (sql: string): string => sql.replace(/\s+/g, ' ').replace(/;\s*$/, '').trim();

/** the statement's identity: what an approval is bound to */
export const statementId = (sql: string): string => createHash('sha256').update(normalise(sql)).digest('hex').slice(0, 12);

const literal = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export function check(sql: string, ctx: Context): Verdict {
  const s = normalise(sql);
  const passed: Check[] = [];
  const ok = (name: CheckName, note: string) => passed.push({ name, state: 'ok', note });
  /** end here: this check said no (or is waiting), and the ones after it were not reached */
  const stop = (outcome: Outcome, name: CheckName, rule: string, reason: string): Verdict => {
    const state = outcome === 'held' ? 'waiting' : outcome === 'noop' ? 'ok' : 'no';
    const rest = CHECKS.slice(CHECKS.indexOf(name) + 1).map((n): Check => ({ name: n, state: 'not-reached', note: outcome === 'noop' ? 'not needed' : 'not reached' }));
    return { outcome, rule, reason, checks: [...passed, { name, state, note: reason }, ...rest] };
  };

  // never
  if (s.includes(';') || s.includes('--') || s.includes('/*')) {
    return stop('refused', 'never', 'one-statement', 'one statement at a time, with no chaining and no comments');
  }
  if (/\b(DELETE|DROP|TRUNCATE)\b/i.test(s)) {
    return stop('refused', 'never', 'never-delete', 'an agent never deletes here. Nobody is asked');
  }
  ok('never', 'one statement, and it does not delete');

  // one door
  const update = s.match(/^UPDATE\s+(\S+)\s+SET\s+(.+?)\s+WHERE\s+(.+)$/i);
  if (!update || update[1].toLowerCase() !== 'aws.dynamodb.tables') {
    return stop('refused', 'one door', 'one-door', 'the only write is an UPDATE of aws.dynamodb.tables');
  }
  const [, , set, where] = update;
  const assignment = set.match(/^(?:data__)?DeletionProtectionEnabled\s*=\s*(\S+)$/i);
  if (!assignment) {
    return stop('refused', 'one door', 'one-door', 'the only setting that may be changed is DeletionProtectionEnabled');
  }
  if (assignment[1].toLowerCase() !== 'true') {
    return stop('refused', 'one door', 'end-state', 'the only end state allowed is deletion protection on');
  }
  const conditions = where.split(/\s+AND\s+/i);
  const region = new RegExp(`^region\\s*=\\s*'${literal(ctx.region)}'$`, 'i');
  const table = new RegExp(`^(?:data__)?(?:TableName|table_name)\\s*=\\s*'${literal(ctx.table)}'$`, 'i');
  if (conditions.length !== 2 || !conditions.some((c) => region.test(c)) || !conditions.some((c) => table.test(c))) {
    return stop('refused', 'one door', 'this-table-only', `only ${ctx.table} in ${ctx.region}`);
  }
  ok('one door', `${ctx.table}, this one setting, on`);

  // look first
  if (!ctx.look || ctx.now - ctx.look.at > ctx.freshnessMs) {
    return stop('refused', 'look first', 'look-first', 'no fresh read of this table. Read its current state, then propose');
  }
  if (ctx.look.protectionOn) {
    return stop('noop', 'look first', 'already-so', 'deletion protection is already on. Nothing to do, nothing sent');
  }
  ok('look first', `read ${Math.max(0, Math.round((ctx.now - ctx.look.at) / 1000))} s ago: deletion protection is off`);

  // a person
  const a = ctx.approval;
  if (!a) {
    return stop('held', 'a person', 'needs-a-person', 'nobody has approved this statement. The write path is off without a named person');
  }
  if (a.statementId !== statementId(s)) {
    return stop('held', 'a person', 'needs-a-person', 'the approval on file is for a different statement');
  }
  if (a.used) {
    return stop('held', 'a person', 'needs-a-person', 'that approval has already been used');
  }
  if (ctx.now >= a.expiresAt) {
    return stop('held', 'a person', 'needs-a-person', 'the approval has expired');
  }
  const reason = `approved by ${a.approver}, this statement only`;
  ok('a person', reason);
  return { outcome: 'allowed', rule: 'approved', reason, checks: passed };
}

/**
 * The server asks before it runs a write (MCP elicitation, safe mode). This is the answer:
 * yes only when the statement it is asking about is the approved one. The statement is
 * read from the server's own message, so the approval cannot be spent on anything else.
 */
export function answersFor(message: string, approval: Approval | undefined, now: number): boolean {
  if (!approval || approval.used || now >= approval.expiresAt) return false;
  const asked = message.match(/SQL:\s*([\s\S]+)$/);
  return Boolean(asked) && statementId(asked![1]) === approval.statementId;
}

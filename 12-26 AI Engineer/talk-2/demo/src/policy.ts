/**
 * The policy gate: the rules for a write, checked in code before a statement can reach the
 * server. Pure: a statement and what the system knows in, a verdict out. The model never
 * sees this file and cannot change what it decides.
 *
 * The rules, in the order they are checked:
 *
 *   one-statement     one statement, no chaining, no comments
 *   never-delete      nothing an agent proposes may delete or drop
 *   one-door          the only write is: UPDATE aws.dynamodb.tables SET DeletionProtectionEnabled
 *   end-state         the only end state it may assert is protection ON
 *   this-table-only   this region and this table, nothing else
 *   look-first        the table was read, by this run, recently (query before mutation)
 *   already-so        the end state already holds: nothing to do, nothing is sent
 *   needs-a-person    the write path is off unless a named person approved this exact statement
 *
 * Three outcomes that stop a write, and they are different on purpose:
 *
 *   refused   never allowed, or not allowed like this. Nobody is asked.
 *   held      allowed, but not without a person. Filed for approval, and the agent stops.
 *   noop      the end state already holds. Nothing to send.
 */
import { createHash } from 'node:crypto';

export type Outcome = 'refused' | 'held' | 'noop' | 'allowed';
export type Verdict = { outcome: Outcome; rule: string; reason: string };

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

const verdict = (outcome: Outcome, rule: string, reason: string): Verdict => ({ outcome, rule, reason });

/** a statement the way it is compared and hashed: one line, single spaces, no trailing semicolon */
export const normalise = (sql: string): string => sql.replace(/\s+/g, ' ').replace(/;\s*$/, '').trim();

/** the statement's identity: what an approval is bound to */
export const statementId = (sql: string): string => createHash('sha256').update(normalise(sql)).digest('hex').slice(0, 12);

const literal = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export function check(sql: string, ctx: Context): Verdict {
  const s = normalise(sql);

  if (s.includes(';') || s.includes('--') || s.includes('/*')) {
    return verdict('refused', 'one-statement', 'one statement at a time, with no chaining and no comments');
  }
  if (/\b(DELETE|DROP|TRUNCATE)\b/i.test(s)) {
    return verdict('refused', 'never-delete', 'an agent never deletes here. Nobody is asked');
  }

  const update = s.match(/^UPDATE\s+(\S+)\s+SET\s+(.+?)\s+WHERE\s+(.+)$/i);
  if (!update || update[1].toLowerCase() !== 'aws.dynamodb.tables') {
    return verdict('refused', 'one-door', 'the only write is an UPDATE of aws.dynamodb.tables');
  }
  const [, , set, where] = update;

  const assignment = set.match(/^(?:data__)?DeletionProtectionEnabled\s*=\s*(\S+)$/i);
  if (!assignment) {
    return verdict('refused', 'one-door', 'the only setting that may be changed is DeletionProtectionEnabled');
  }
  if (assignment[1].toLowerCase() !== 'true') {
    return verdict('refused', 'end-state', 'the only end state allowed is deletion protection on');
  }

  const conditions = where.split(/\s+AND\s+/i);
  const region = new RegExp(`^region\\s*=\\s*'${literal(ctx.region)}'$`, 'i');
  const table = new RegExp(`^(?:data__)?(?:TableName|table_name)\\s*=\\s*'${literal(ctx.table)}'$`, 'i');
  if (conditions.length !== 2 || !conditions.some((c) => region.test(c)) || !conditions.some((c) => table.test(c))) {
    return verdict('refused', 'this-table-only', `only ${ctx.table} in ${ctx.region}`);
  }

  if (!ctx.look || ctx.now - ctx.look.at > ctx.freshnessMs) {
    return verdict('refused', 'look-first', 'no fresh read of this table. Read its current state, then propose');
  }
  if (ctx.look.protectionOn) {
    return verdict('noop', 'already-so', 'deletion protection is already on. Nothing to do, nothing sent');
  }

  const a = ctx.approval;
  if (!a) {
    return verdict('held', 'needs-a-person', 'the write path is off. This statement needs a named person to approve it');
  }
  if (a.statementId !== statementId(s)) {
    return verdict('held', 'needs-a-person', 'the approval on file is for a different statement');
  }
  if (a.used) {
    return verdict('held', 'needs-a-person', 'that approval has already been used');
  }
  if (ctx.now >= a.expiresAt) {
    return verdict('held', 'needs-a-person', 'the approval has expired');
  }
  return verdict('allowed', 'approved', `approved by ${a.approver}, this statement only`);
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

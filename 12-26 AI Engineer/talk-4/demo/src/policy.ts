import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

export const desired = Object.freeze(JSON.parse(readFileSync(new URL('../declaration.json', import.meta.url), 'utf8')) as {
  ref: string; description: string; path: string; threshold: number; period: number; enabled: boolean;
});
if (desired.threshold !== 100 || desired.period !== 10 || desired.enabled !== true || desired.path !== '/talk4-check' || desired.ref !== 'talk4_demo_rate_limit') {
  throw new Error('The declaration is outside this demo policy.');
}

export type Rule = { target: string; id: string; revision: string; threshold: number; period: number; enabled: boolean; updated: string };
export type Declaration = { revision: string; committed: string; threshold: number };
export type Traffic = { status: number; requests: number }[];
export type Evidence = { rule?: Rule; declaration?: Declaration; traffic?: Traffic; firstRead?: number };
export type Plan = Readonly<{ rule: Rule; declaration: Declaration; issued: number; id: string }>;
export type Proposal = { target: string; threshold: number };
export type Estate = {
  target: string;
  rule(): Promise<Rule>;
  declaration(): Promise<Declaration>;
  traffic(): Promise<Traffic>;
  probe(): Promise<Traffic>;
  block(rule: Rule): Promise<void>;
  write(rule: Rule): Promise<void>;
  close(): Promise<void>;
};

export function current(rule: Rule) {
  return rule.threshold === desired.threshold && rule.enabled && rule.period === desired.period;
}

export function planFor(proposal: Proposal, evidence: Evidence, target: string, now = Date.now()): Plan {
  const { rule, declaration, traffic, firstRead } = evidence;
  if (!rule || !declaration || !traffic || firstRead === undefined) throw new Error('Read the rule, traffic and declaration before proposing.');
  if (now < firstRead || now - firstRead > 300_000) throw new Error('Evidence expired. Investigate again.');
  if (proposal.target !== target || rule.target !== target || proposal.threshold !== desired.threshold || declaration.threshold !== desired.threshold) throw new Error('Target or threshold outside the approved declaration.');
  if (current(rule) || rule.threshold !== 5 || rule.period !== desired.period || !rule.enabled) throw new Error('Only the staged 5 to 100 repair is allowed.');
  if (!(Date.parse(rule.updated) > Date.parse(declaration.committed))) throw new Error('Cannot establish that the live change followed the declaration.');
  if (!traffic.some(row => row.status === 429 && row.requests > 0)) throw new Error('No observed rate-limited traffic. Escalate.');
  const id = createHash('sha256').update(JSON.stringify([rule, declaration, firstRead, desired])).digest('hex').slice(0, 12);
  return Object.freeze({ rule: Object.freeze({ ...rule }), declaration: Object.freeze({ ...declaration }), issued: firstRead, id });
}

export async function recover(estate: Estate, plan: Plan, approve: (plan: Plan) => Promise<boolean>, say: (line: string) => void) {
  if (!await approve(plan)) { say('DECLINED   No write sent.'); return false; }
  const [rule, declaration] = await Promise.all([estate.rule(), estate.declaration()]);
  if (rule.target !== estate.target || rule.id !== plan.rule.id) throw new Error('Target changed. Investigate again.');
  if (JSON.stringify(declaration) !== JSON.stringify(plan.declaration)) throw new Error('Declaration changed. Investigate again.');
  if (current(rule)) { say('NO WRITE   Another operator already restored the setting.'); return true; }
  if (JSON.stringify(rule) !== JSON.stringify(plan.rule) || Date.now() - plan.issued > 300_000) throw new Error('Approval is stale. Investigate again.');
  say('RECHECK    Same rule, revision and approved declaration.');
  try { await estate.write(rule); }
  catch { say('UNCERTAIN  The write returned an error. Reading the rule again.'); }
  const observed = await estate.rule();
  if (observed.id !== rule.id || observed.target !== rule.target || !current(observed)) throw new Error('Could not verify restoration. Stop and review. No retry sent.');
  say('VERIFIED   100 requests / 10s. Protection enabled.');
  return true;
}

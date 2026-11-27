import { desired, type Estate, type Rule } from './policy.ts';

export function fixture(): Estate {
  const target = 'demo.example';
  let rule: Rule = { target, id: 'fixture-rule', revision: 'r2', threshold: 5, period: 10, enabled: true, updated: '2026-12-08T03:00:00+11:00' };
  const probe = async () => {
    const allowed = Math.min(rule.threshold, 30);
    return [{ status: 200, requests: allowed }, ...(allowed < 30 ? [{ status: 429, requests: 30 - allowed }] : [])];
  };
  return {
    target, rule: async () => ({ ...rule }), probe, traffic: probe,
    block: async () => {},
    declaration: async () => ({ revision: 'fixture-v1', committed: '2026-12-07T18:00:00+11:00', threshold: desired.threshold }),
    write: async () => { rule = { ...rule, threshold: desired.threshold, revision: 'r3', updated: '2026-12-08T08:00:00+11:00' }; },
    close: async () => {},
  };
}

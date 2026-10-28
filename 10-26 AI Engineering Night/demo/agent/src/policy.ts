/**
 * The policy gate: the platform's rules for a write, checked in code before the
 * statement reaches the server or a human. Pure: a statement and the declaration in,
 * a verdict out. The model never sees this file and cannot change what it decides.
 *
 * Four rules, in order:
 *   one statement       no chaining
 *   mutation surface    only REPLACE cloudflare.rulesets.phases SET rules
 *   scope               only this zone, only the http_ratelimit phase
 *   declaration         the rule it writes is the declared rule, field for field
 *
 * The last rule is the point: the agent decides whether to write, the declaration
 * decides what gets written.
 */

export type Verdict = { ok: true } | { ok: false; rule: string; reason: string };
export type Declared = { sql: string; zoneId: string; phase: string };

const no = (rule: string, reason: string): Verdict => ({ ok: false, rule, reason });
const flat = (s: string) => s.replace(/\s+/g, ' ').replace(/;\s*$/, '').trim();
const literal = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** the JSON array in SET rules = '...', unescaped the way the SQL parser would */
export function rulesOf(sql: string): unknown {
  const m = sql.match(/SET\s+rules\s*=\s*'([\s\S]*?)'\s*WHERE/i);
  if (!m) return undefined;
  try {
    return JSON.parse(m[1].replace(/\\(["\\])/g, '$1'));
  } catch {
    return undefined;
  }
}

/** the first place two JSON values differ, as a path, or undefined when they match */
export function firstDiff(a: unknown, b: unknown, path = '$'): string | undefined {
  const show = (v: unknown) => JSON.stringify(v) ?? 'missing';
  if (typeof a !== typeof b || Array.isArray(a) !== Array.isArray(b)) return `${path}: ${show(a)} vs declared ${show(b)}`;
  if (a && b && typeof a === 'object') {
    const ra = a as Record<string, unknown>;
    const rb = b as Record<string, unknown>;
    for (const k of [...new Set([...Object.keys(ra), ...Object.keys(rb)])].sort()) {
      const d = firstDiff(ra[k], rb[k], Array.isArray(a) ? `${path}[${k}]` : `${path}.${k}`);
      if (d) return d;
    }
    return undefined;
  }
  return a === b ? undefined : `${path}: ${show(a)} vs declared ${show(b)}`;
}

export function check(sql: string, declared: Declared): Verdict {
  const s = flat(sql);
  if (s.includes(';')) return no('one statement', 'more than one statement');
  if (!/^REPLACE\s+cloudflare\.rulesets\.phases\s+SET\s+rules\s*=/i.test(s)) {
    return no('mutation surface', 'only REPLACE cloudflare.rulesets.phases SET rules is permitted');
  }
  if (!new RegExp(`zone_id\\s*=\\s*'${literal(declared.zoneId)}'`, 'i').test(s)) {
    return no('scope', 'zone_id is not the zone this agent is scoped to');
  }
  if (!new RegExp(`ruleset_phase\\s*=\\s*'${literal(declared.phase)}'`, 'i').test(s)) {
    return no('scope', `ruleset_phase is not ${declared.phase}`);
  }
  const proposed = rulesOf(s);
  if (proposed === undefined) return no('declaration', 'SET rules is not a JSON array');
  const diff = firstDiff(proposed, rulesOf(declared.sql));
  if (diff) return no('declaration', `not the declared rule: ${diff}`);
  return { ok: true };
}

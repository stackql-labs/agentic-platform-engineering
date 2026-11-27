import { createHash } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { connect } from './stackql.ts';
import { desired, type Estate, type Rule, type Traffic } from './policy.ts';

const requireEnv = (key: string) => {
  const value = process.env[key]?.trim();
  if (!value) throw new Error('Set ' + key + ' for the isolated demo.');
  return value;
};
const hexId = (x: unknown) => {
  if (typeof x !== 'string' || !/^[a-f0-9]{32}$/.test(x)) throw new Error('Expected an explicit Cloudflare resource ID.');
  return x;
};
const settings = (threshold: number) => ({ characteristics: ['cf.colo.id', 'ip.src'], period: desired.period, requests_per_period: threshold, mitigation_timeout: desired.period });
const expression = '(http.request.uri.path eq "' + desired.path + '")';
const literal = (s: string) => "'" + s.replace(/'/g, "''") + "'";
type CloudRule = Rule & { rulesetId: string };
export function parseRule(rows: Record<string, unknown>[], target: string, ruleId: string): CloudRule {
  if (rows.length !== 1) throw new Error('Expected one zone rate-limit phase.');
  const row = rows[0];
  const rules = typeof row.rules === 'string' ? JSON.parse(row.rules) : row.rules;
  if (!Array.isArray(rules)) throw new Error('Unexpected ruleset response.');
  const hits = rules.filter(r => r?.id === ruleId);
  if (hits.length !== 1) throw new Error('Dedicated rule missing from the named zone.');
  const rule = hits[0];
  const fields = ['id', 'ref', 'version', 'last_updated', 'action', 'description', 'enabled', 'expression', 'ratelimit'];
  if (Object.keys(rule).some(key => !fields.includes(key))) throw new Error('Unexpected rule settings. Preserve the live rule and stop.');
  const limit = rule.ratelimit;
  if (rule.ref !== desired.ref || rule.description !== desired.description || rule.action !== 'block' || rule.expression !== expression || rule.enabled !== true ||
      !Array.isArray(limit?.characteristics) || !Number.isSafeInteger(limit.requests_per_period) ||
      !isDeepStrictEqual({ ...limit, characteristics: [...limit.characteristics].sort() }, settings(limit.requests_per_period)) ||
      !Number.isFinite(Date.parse(rule.last_updated))) throw new Error('Rule differs from the dedicated demo rule. Stop.');
  return { target, id: hexId(ruleId), rulesetId: hexId(row.id), revision: createHash('sha256').update(JSON.stringify(rule)).digest('hex'), updated: rule.last_updated,
    threshold: limit.requests_per_period, period: limit.period, enabled: rule.enabled };
}

export function repairSql(zone: string, rule: Rule) {
  const ruleset = hexId((rule as CloudRule).rulesetId);
  return 'UPDATE cloudflare.rulesets.rules SET action = \'block\', expression = ' + literal(expression)
    + ', description = ' + literal(desired.description) + ', ref = ' + literal(desired.ref) + ', enabled = true'
    + ', ratelimit = ' + literal(JSON.stringify(settings(desired.threshold))) + ' WHERE zone_id = ' + literal(hexId(zone))
    + ' AND ruleset_id = ' + literal(ruleset) + ' AND rule_id = ' + literal(hexId(rule.id));
}

async function githubDeclaration() {
  const repo = requireEnv('TALK4_GITHUB_REPO');
  const branch = requireEnv('TALK4_GITHUB_BRANCH');
  if (!/^[\w.-]+\/[\w.-]+$/.test(repo)) throw new Error('Set the public repository containing the approved declaration.');
  const file = '12-26 AI Engineer/talk-4/demo/declaration.json';
  const base = 'https://api.github.com/repos/' + repo;
  async function read(route: string) {
    const response = await fetch(base + route, { headers: { accept: 'application/vnd.github+json' }, signal: AbortSignal.timeout(12000), redirect: 'error' });
    if (!response.ok) throw new Error('GitHub declaration lookup returned HTTP ' + response.status);
    return response.json();
  }
  const commits = await read('/commits?' + new URLSearchParams({ sha: branch, path: file, per_page: '1' }));
  const commit = Array.isArray(commits) ? commits[0] : undefined;
  if (!/^[a-f0-9]{40}$/.test(commit?.sha) || !Number.isFinite(Date.parse(commit.commit?.committer?.date))) throw new Error('Declaration history unavailable.');
  const data = await read('/contents/' + file.split('/').map(encodeURIComponent).join('/') + '?ref=' + commit.sha);
  if (!data || typeof data !== 'object' || !('encoding' in data) || data.encoding !== 'base64' || !('content' in data) ||
      typeof data.content !== 'string' || !isDeepStrictEqual(JSON.parse(Buffer.from(data.content, 'base64').toString()), desired)) throw new Error('GitHub declaration differs from local policy.');
  return { revision: String(commit.sha), committed: String(commit.commit.committer.date), threshold: desired.threshold };
}

export async function cloud(): Promise<Estate> {
  const zone = hexId(requireEnv('TALK4_ZONE_ID'));
  const id = hexId(requireEnv('TALK4_RULE_ID'));
  const target = requireEnv('TALK4_HOST').toLowerCase();
  if (!/^(?:[a-z0-9][a-z0-9-]*\.)+[a-z][a-z0-9-]+$/.test(target)) throw new Error('Supply a DNS host, with no port or path.');
  const readToken = requireEnv('TALK4_READ_TOKEN');
  const writeToken = requireEnv('TALK4_WRITE_TOKEN');
  if (writeToken === readToken) throw new Error('Use distinct read-only and zone-scoped write tokens.');
  const server = await connect('read_only', readToken);
  try {
    const zones = await server.query("SELECT id, name FROM cloudflare.zones.zones WHERE zone_id = '" + zone + "'");
    const name = String(zones[0]?.name ?? '');
    if (zones.length !== 1 || zones[0].id !== zone || !name || (target !== name && !target.endsWith('.' + name))) throw new Error('Demo host is outside the verified zone.');
  } catch (error) { await server.close(); throw error; }
  return {
    target,
    rule: async () => parseRule(await server.query("SELECT id, rules FROM cloudflare.rulesets.phases WHERE zone_id = '" + zone + "' AND ruleset_phase = 'http_ratelimit'"), target, id),
    declaration: githubDeclaration,
    traffic: async () => {
      const now = Date.now();
      const query = "SELECT edge_response_status AS status, SUM(requests) AS requests FROM cloudflare.zones.http_requests_adaptive_groups WHERE zone_tag = '" + zone +
        "' AND since = '" + new Date(now - 3600000).toISOString() + "' AND until = '" + new Date(now).toISOString() + "' GROUP BY edge_response_status ORDER BY edge_response_status";
      const rows = await server.query(query);
      return rows.map(r => ({ status: Number(r.status), requests: Number(r.requests) }));
    },
    probe: async () => {
      const statuses = await Promise.all(Array.from({ length: 30 }, async () => {
        const response = await fetch('https://' + target + desired.path, { method: 'GET', redirect: 'manual', signal: AbortSignal.timeout(10000) });
        await response.body?.cancel();
        return response.status;
      }));
      const counts: Traffic = [];
      for (const status of [...new Set(statuses)].sort()) counts.push({ status, requests: statuses.filter(s => s === status).length });
      return counts;
    },
    block: rule => server.refuse(repairSql(zone, rule)),
    write: async rule => {
      const sql = repairSql(zone, rule);
      const writer = await connect('safe', writeToken, sql);
      try { await writer.apply(sql); } finally { await writer.close(); }
    },
    close: () => server.close(),
  };
}

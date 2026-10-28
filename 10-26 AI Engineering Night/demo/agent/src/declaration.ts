/**
 * The declaration: the rate limit rule as stack/stackql_manifest.yml declares it, and the
 * one write the policy permits, the REPLACE that asserts it. Rendered here from the same
 * values stackql-deploy renders into stack/resources/rate_limit.iql, so the statement in
 * the briefing, the one the gate compares against, and the .iql anchor are the same rule
 * field for field. test/declaration.test.ts checks that against the .iql.
 */
import { readFileSync } from 'node:fs';

import { parse as parseYaml } from 'yaml';

import type { Declared } from './policy.js';

export type Rule = { description: string; threshold: number; period: number };
export type Declaration = Declared & Rule;

type Manifest = {
  globals?: Array<{ name: string; value?: unknown }>;
  resources?: Array<{ name: string; props?: Array<{ name: string; value?: unknown }> }>;
};

/** the rate_limit resource's props and the ruleset phase, from the manifest */
export function readManifest(file: string): Rule & { phase: string } {
  const manifest = parseYaml(readFileSync(file, 'utf8')) as Manifest;
  const phase = String(manifest.globals?.find((g) => g.name === 'ruleset_phase')?.value ?? 'http_ratelimit');
  const res = manifest.resources?.find((r) => r.name === 'rate_limit');
  const prop = (n: string) => String(res?.props?.find((p) => p.name === n)?.value ?? '');
  return { phase, description: prop('description'), threshold: Number(prop('threshold')), period: Number(prop('period')) };
}

/**
 * The declared rule as the REPLACE that asserts it. The expression's quotes are escaped
 * for the SQL parser (\\"), the same way the .iql writes them.
 */
export function assertion(zoneId: string, phase: string, rule: Rule): string {
  const r = {
    action: 'block',
    description: rule.description,
    enabled: true,
    expression: '(starts_with(http.request.uri.path, "/"))',
    ratelimit: {
      characteristics: ['ip.src', 'cf.colo.id'],
      period: rule.period,
      requests_per_period: rule.threshold,
      mitigation_timeout: rule.period,
    },
  };
  const rules = JSON.stringify([r], null, 2).replace(/\\"/g, '\\\\"');
  return `REPLACE cloudflare.rulesets.phases\nSET rules = '${rules}'\nWHERE zone_id = '${zoneId}' AND ruleset_phase = '${phase}'`;
}

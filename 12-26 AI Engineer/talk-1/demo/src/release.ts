/**
 * The live release state, as the system reads it: two looks at Parameter Store through
 * StackQL, parsed into one object, with an id that changes whenever anything in it does.
 *
 *   /checkout-preview/live        the digest the preview environment serves
 *   /checkout-preview/candidate   "<digest>@<percent>": the candidate and its share of traffic
 *   /checkout-candidate/*         the candidate's evidence: source, builder, signer, checks, findings
 *
 * The parameters stand in for whatever your deploy reads (a weighted alias, a route, a
 * flag). The pattern does not depend on what they are.
 */
import { createHash } from 'node:crypto';

export type Param = { name: string; value: string; version: number };

export type Candidate = {
  digest: string;
  source_repo: string;
  source_ref: string;
  builder: string;
  signer: string;
  signature_valid: boolean;
  checks: Record<string, string>;
  findings: { critical: number; high: number };
  /** free text written by whoever cut the release: data, never an instruction */
  release_note: string;
};

export type Live = {
  target: string;
  liveDigest: string;
  /** the candidate route: who gets what share, and how many times it has been written */
  route: { digest: string | null; percent: number; raw: string; revision: number };
  candidate: Candidate;
  /** every parameter read, with its version: what the evidence id is made from */
  params: Param[];
};

export const RESOURCE = 'aws.ssm.parameters_by_paths';
export const WRITE_RESOURCE = 'aws.ssm.parameters';
export const CANDIDATE_PATH = '/checkout-candidate';
export const previewPath = (target: string): string => `/${target}`;

export const lookSql = (region: string, path: string): string =>
  `SELECT name, value, version FROM ${RESOURCE} WHERE region = '${region}' AND Path = '${path}'`;

/** the route as one value, so a promotion is one write that names the digest it promotes */
export const routeValue = (digest: string, percent: number): string => `${digest}@${percent}`;

const quote = (s: string): string => s.replace(/'/g, "''");

/** one statement that says the end state. Running it twice leaves the same state. */
export const assertSql = (region: string, name: string, value: string): string =>
  `REPLACE ${WRITE_RESOURCE} SET Name = '${quote(name)}', Value = '${quote(value)}', Type = 'String', Overwrite = true WHERE region = '${region}'`;

export const promoteSql = (region: string, target: string, digest: string, percent: number): string =>
  assertSql(region, `${previewPath(target)}/candidate`, routeValue(digest, percent));

export function toParams(rows: Array<Record<string, unknown>> | undefined): Param[] {
  return (rows ?? [])
    .filter((r) => typeof r.name === 'string')
    .map((r) => ({ name: String(r.name), value: String(r.value ?? ''), version: Number(r.version ?? 0) }));
}

/** "a=1 b=2" as an object */
const pairs = (s: string): Record<string, string> =>
  Object.fromEntries(
    s
      .split(/\s+/)
      .filter(Boolean)
      .map((kv) => {
        const i = kv.indexOf('=');
        return i < 0 ? [kv, ''] : [kv.slice(0, i), kv.slice(i + 1)];
      }),
  );

export function parseRoute(raw: string, revision: number): Live['route'] {
  const at = raw.lastIndexOf('@');
  const digest = at < 0 ? raw : raw.slice(0, at);
  const percent = at < 0 ? Number.NaN : Number(raw.slice(at + 1));
  return { digest: digest === 'none' || digest === '' ? null : digest, percent, raw, revision };
}

/** the two looks as one state, or the reason they do not make one */
export function parseLive(target: string, preview: Param[], candidate: Param[]): Live | { error: string } {
  const get = (params: Param[], prefix: string, key: string) => params.find((p) => p.name === `${prefix}/${key}`);
  const live = get(preview, previewPath(target), 'live');
  const route = get(preview, previewPath(target), 'candidate');
  if (!live || !route) return { error: `the ${target} release state is not there (run npm run stage)` };
  const c = (key: string) => get(candidate, CANDIDATE_PATH, key)?.value;
  const required = ['digest', 'source_repo', 'source_ref', 'builder', 'signer', 'signature_valid', 'checks', 'findings'];
  const missing = required.filter((k) => c(k) === undefined);
  if (missing.length) return { error: `the candidate evidence is incomplete: ${missing.join(', ')}` };
  const findings = pairs(c('findings')!);
  return {
    target,
    liveDigest: live.value,
    route: parseRoute(route.value, route.version),
    candidate: {
      digest: c('digest')!,
      source_repo: c('source_repo')!,
      source_ref: c('source_ref')!,
      builder: c('builder')!,
      signer: c('signer')!,
      signature_valid: c('signature_valid') === 'true',
      checks: pairs(c('checks')!),
      findings: { critical: Number(findings.critical), high: Number(findings.high) },
      release_note: c('release_note') ?? '',
    },
    params: [...preview, ...candidate].sort((a, b) => a.name.localeCompare(b.name)),
  };
}

/** changes when any value or any version changes: what a plan and an approval are bound to */
export const evidenceId = (live: Live): string =>
  createHash('sha256')
    .update(JSON.stringify(live.params.map((p) => [p.name, p.value, p.version])))
    .digest('hex')
    .slice(0, 12);

/** a digest short enough to say out loud */
export const short = (digest: string | null): string => (digest ? (digest.length > 22 ? `${digest.slice(0, 15)}..${digest.slice(-4)}` : digest) : 'none');

/**
 * Configuration: .env files, then the process environment, then defaults.
 *
 * The first .env that defines a variable wins, and nothing already in the environment is
 * overridden. The key for both versions of the talk lives one level above the talk folders
 * (`12-26 AI Engineer/.env`), so that file is read last.
 */
import { existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
export const demoRoot = path.resolve(here, '..');

for (const dir of [demoRoot, path.resolve(demoRoot, '..'), path.resolve(demoRoot, '..', '..')]) {
  const file = path.join(dir, '.env');
  if (existsSync(file)) process.loadEnvFile(file);
}

const env = (name: string, fallback: string): string => {
  const v = process.env[name];
  return v === undefined || v === '' ? fallback : v;
};

/** USD per million tokens, standard tier, checked 25 Nov 2026. Used only for the cost line. */
const PRICES: Record<string, { input: number; cached: number; output: number }> = {
  'gpt-6-luna': { input: 0.1, cached: 0.01, output: 0.5 },
  'gpt-6.1-terra': { input: 1, cached: 0.05, output: 5 },
  'gpt-6.2-sol': { input: 2, cached: 0.1, output: 10 },
};

export const cfg = {
  /** the lowest-cost GPT-6 family model; anything outside the family is refused below */
  model: env('OPENAI_MODEL', 'gpt-6-luna'),
  region: env('DEMO_REGION', 'ap-southeast-2'),
  table: env('DEMO_TABLE', 'orders'),
  maxSteps: Number(env('AGENT_MAX_STEPS', '8')),
  /** how long a look stays good for: a write needs a read of the table newer than this */
  lookFreshnessSeconds: Number(env('LOOK_FRESHNESS_SECONDS', '120')),
  /** how long a named approval stays good for */
  approvalTtlSeconds: Number(env('APPROVAL_TTL_SECONDS', '300')),
  /** where providers are cached. Empty: the launcher's default, ~/.stackql */
  approot: env('STACKQL_APPROOT', ''),
  runsDir: path.resolve(env('RUNS_DIR', path.join(demoRoot, 'runs'))),
  recordingsDir: path.join(demoRoot, 'recordings'),
  promptsDir: path.join(demoRoot, 'prompts'),
};

export function requireModelKey(): void {
  if (!process.env.OPENAI_API_KEY) {
    console.error('OPENAI_API_KEY is not set. Put it in .env (see .env.example), or run `npm run replay`.');
    process.exit(2);
  }
  // the repository rule: a GPT-6 family model, chosen explicitly, and no silent fallback
  if (!/^gpt-6([.-]|$)/.test(cfg.model)) {
    console.error(`OPENAI_MODEL=${cfg.model} is not a GPT-6 family model. Set it explicitly (default: gpt-6-luna).`);
    process.exit(2);
  }
}

/** what a run cost, in USD, or undefined when the model's price is not in the table */
export function cost(usage: { input: number; cached: number; output: number }): number | undefined {
  const p = PRICES[cfg.model];
  if (!p) return undefined;
  return ((usage.input - usage.cached) * p.input + usage.cached * p.cached + usage.output * p.output) / 1_000_000;
}

export function ensureRunsDir(): string {
  mkdirSync(cfg.runsDir, { recursive: true });
  return cfg.runsDir;
}

/** a file-name-safe timestamp for this process */
export const runStamp = new Date().toISOString().replace(/[:.]/g, '-');

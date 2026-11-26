import { createInterface } from 'node:readline/promises';
import { setTimeout as wait } from 'node:timers/promises';
import OpenAI from 'openai';
import { fixtureTurn, investigate, modelTurn, selectModel, trafficText } from './agent.ts';
import { cloud } from './cloud.ts';
import { fixture } from './fixture.ts';
import { recover } from './policy.ts';

async function run() {
  const mode = process.argv[2] ?? 'fixture';
  if (!['fixture', 'model', 'cloud'].includes(mode)) throw new Error('Choose fixture, model or cloud.');
  const interactive = Boolean(process.stdin.isTTY && process.stdout.isTTY);
  if (mode === 'cloud' && !interactive) throw new Error('Live cloud mode requires a presenter at the terminal.');
  const model = selectModel(process.env.OPENAI_MODEL);
  const client = mode === 'fixture' ? undefined : new OpenAI({ apiKey: process.env.OPENAI_API_KEY, baseURL: 'https://api.openai.com/v1', maxRetries: 0, timeout: 45000 });
  const estate = mode === 'cloud' ? await cloud() : fixture();
  const terminal = interactive ? createInterface({ input: process.stdin, output: process.stdout }) : undefined;
  const colours: Record<string, number> = { QUERY: 36, FINDING: 36, PROPOSE: 35, BLOCKED: 33, DECLINED: 33, REVIEW: 33, VERIFIED: 32, AFTER: 32 };
  const say = (line: string) => {
    const label = line.trimStart().split(' ')[0];
    const colour = interactive && !process.env.NO_COLOR && colours[label];
    console.log(colour ? line.replace(label, '\x1b[' + colour + 'm' + label + '\x1b[0m') : line);
  };
  const pause = async (prompt: string) => { if (terminal) await terminal.question(prompt + '  [Enter] '); };
  const investigateOnce = () => investigate(estate, client ? modelTurn(client, model, estate.target) : fixtureTurn(estate.target), say);
  try {
    say(mode === 'fixture' ? 'OFFLINE FIXTURE | scripted decisions | in-memory site' :
      mode === 'model' ? 'LIVE OPENAI | ' + model + ' | in-memory fixture site' : 'LIVE OPENAI + CLOUDFLARE | ' + model + ' | isolated zone');
    say('Site       ' + estate.target + '/talk4-check');
    await pause('Run the same 30-request test a user would see.');
    say('BEFORE     ' + trafficText(await estate.probe()));
    await pause('Investigate the refused requests.');
    const plan = await investigateOnce();
    if (!plan) return;
    say('\nREVIEW     ' + plan.id + ' | ' + plan.rule.target + ' | rule ' + plan.rule.id);
    say('           5 to 100 requests per client per 10s. Protection stays enabled.');
    const ok = await recover(estate, plan, async () => {
      if (mode === 'cloud') {
        const answer = await terminal!.question('If the temporary restriction can end, type APPROVE ' + plan.id + ': ');
        return answer.trim() === 'APPROVE ' + plan.id;
      }
      if (terminal) {
        const answer = await terminal.question('Fixture operator: has the temporary restriction ended? Approve this change [y/N] ');
        return answer.trim().toLowerCase() === 'y';
      }
      say('FIXTURE    Simulated operator approves this plan.');
      return true;
    }, say);
    if (!ok) return;
    if (mode === 'cloud') { say('PROBE      Waiting for a fresh rate-limit window.'); await wait(12000); }
    say('AFTER      ' + trafficText(await estate.probe()));
    await pause('Run the investigation again.');
    say('\nSECOND RUN');
    await investigateOnce();
  } finally { terminal?.close(); await estate.close(); }
}

run().catch(error => { console.error('STOP       ' + (error instanceof Error ? error.message : 'Unexpected error')); process.exitCode = 1; });

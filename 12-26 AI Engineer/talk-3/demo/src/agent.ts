/**
 * Beats 1 and 3: an agent is asked to keep one safety setting on a production table.
 *
 * The OpenAI SDK (Responses API) with a GPT-6 family model, and the StackQL MCP server over
 * stdio as its only tool surface. The model proposes. The system decides:
 *
 *   look       its SELECTs run, and the system notes what was seen and when. One of them
 *              reads the table's ops note, which is free text that anybody could have written
 *   propose    its one write is checked by the policy gate (src/policy.ts) before it can
 *              reach the server
 *   held       allowed, but not without a person: the statement is filed for approval
 *   refused    never allowed: nobody is asked
 *
 * After either decision the model is told to stop, and from then on it has no tools, only a
 * report. The server this program starts for the model is read_only: if the gate were
 * wrong, the server would refuse the write as well. Approval and apply are a different
 * command (`npm run approve`), run by a person.
 *
 *   npm run agent            the run
 *   npm run beat1            the same, shown one frame at a time on a key press
 *   npm run agent -- --tools the tool surface and the mode, no model call
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';

import OpenAI from 'openai';

import { cfg, cost, demoRoot, requireModelKey } from './config.ts';
import { markdown, magenta } from './console.ts';
import { hold, record } from './ledger.ts';
import { startPlatform, type Platform } from './platform.ts';
import { check, statementId, type Look, type Verdict } from './policy.ts';
import { bold, checkLines, cyan, dim, endPacing, frame, green, openTranscript, red, rowsTable, say, seconds, startPacing, statementLines, W, yellow } from './screen.ts';
import { lookFrom, noteFrom, NOTES_RESOURCE, readsTheNotes, readsTheTable, TABLE_RESOURCE } from './target.ts';

type FunctionTool = OpenAI.Responses.FunctionTool;
type Input = OpenAI.Responses.ResponseInput;
type ToolCall = OpenAI.Responses.ResponseFunctionToolCall;

/** the two tools of the server's that the model is given. It needs no others for this job. */
const MODEL_TOOLS: FunctionTool[] = [
  {
    type: 'function',
    name: 'run_select_query',
    description: 'Run one SELECT against a cloud provider through StackQL. A live read. Returns rows.',
    strict: true,
    parameters: { type: 'object', properties: { sql: { type: 'string', description: 'one SELECT statement' } }, required: ['sql'], additionalProperties: false },
  },
  {
    type: 'function',
    name: 'run_mutation_query',
    description: 'Propose one write through StackQL, as one statement. The system decides whether it runs. Returns the decision.',
    strict: true,
    parameters: { type: 'object', properties: { sql: { type: 'string', description: 'one statement that says the end state' } }, required: ['sql'], additionalProperties: false },
  },
];

/** `--job "<text>"` gives the agent a different job, to show a different decision of the gate */
const flagValue = (name: string): string | undefined => {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
};

const fill = (name: string, vars: Record<string, string>): string =>
  readFileSync(path.join(cfg.promptsDir, name), 'utf8').replace(/\{\{\s*(\w+)\s*\}\}/g, (_, key: string) => {
    if (!(key in vars)) throw new Error(`prompt placeholder {{ ${key} }} has no value`);
    return vars[key];
  });

/** what the surface is, without calling the model */
function surface(platform: Platform): string[] {
  const given = MODEL_TOOLS.map((t) => t.name);
  return [
    `${bold('model')}   ${cfg.model}`,
    `${bold('tools')}   one MCP server: ${platform.server} ${dim('(stdio, from npm)')}, mode ${green(platform.mode)}`,
    `        ${given.map((n) => (n === 'run_mutation_query' ? magenta(n) : cyan(n))).join('   ')}   ${dim(`(${platform.tools.length - given.length} more not given)`)}`,
    `${bold('keys')}    none. ${platform.credentials.join(', ')} ${platform.credentials.length === 1 ? 'stays' : 'stay'} in the server process`,
  ];
}

async function run(platform: Platform): Promise<void> {
  const started = Date.now();
  const transcript = openTranscript('agent');
  const vars = { resource: TABLE_RESOURCE, notes_resource: NOTES_RESOURCE, notes_path: cfg.notesPath, table: cfg.table, region: cfg.region };
  const instructions = fill('system.md', vars);
  const task = (flagValue('--job') ?? fill('task.md', vars)).trim();

  frame('the job', [bold(task)]);
  frame('what the agent has', surface(platform), dim);

  const openai = new OpenAI();
  const input: Input = [{ role: 'user', content: task }];
  const usage = { input: 0, cached: 0, output: 0 };
  let look: Look | undefined;
  let note: string | undefined; // the ops note as the agent read it: data, whatever it says
  let decision: Verdict | undefined; // the system's answer to the one write, once there is one
  let stopped = false; // blocked means stop: after a decision the model has no tools left
  let step = 0;
  let calls = 0;
  let report = '';

  record({ actor: 'agent', name: cfg.model, action: 'started', detail: task });

  /** a look: the statement runs, and the system notes what was seen and when */
  const onSelect = async (sql: string): Promise<string> => {
    const t = Date.now();
    const result = await platform.select(sql);
    if (!result.ok) {
      frame(`${String(step).padStart(2, '0')} look`, [...statementLines(sql), '', red(result.text)], red, seconds(t));
      return result.text;
    }
    const seen = readsTheTable(sql) ? lookFrom(result.rows) : undefined;
    if (seen) look = seen;
    const read = readsTheNotes(sql) ? noteFrom(result.rows) : undefined;
    if (read !== undefined) note = read;
    frame(`${String(step).padStart(2, '0')} look`, [...statementLines(sql), '', ...rowsTable(result.rows ?? [], sql)], cyan, seconds(t));
    record({
      actor: 'agent',
      name: cfg.model,
      action: read !== undefined ? 'read-note' : 'looked',
      statement: sql,
      detail: seen ? `deletion_protection_enabled = ${seen.protectionOn}` : read !== undefined ? read : `${result.rows?.length ?? 0} rows`,
    });
    return result.text;
  };

  /** a proposal: the statement goes to the gate, not to the server */
  const onMutation = async (sql: string): Promise<string> => {
    const id = statementId(sql);
    frame(`${String(step).padStart(2, '0')} propose`, statementLines(sql), magenta, `statement ${id}`);
    record({ actor: 'agent', name: cfg.model, action: 'proposed', statement_id: id, statement: sql });

    const verdict = check(sql, { region: cfg.region, table: cfg.table, now: Date.now(), freshnessMs: cfg.lookFreshnessSeconds * 1000, look });
    record({ actor: 'policy', action: verdict.outcome, rule: verdict.rule, statement_id: id, detail: verdict.reason });

    if (verdict.outcome === 'held') {
      decision = verdict;
      stopped = true;
      hold({
        id,
        statement: sql,
        rule: verdict.rule,
        proposed_by: `agent (${cfg.model})`,
        proposed_at: new Date().toISOString(),
        observed: { deletion_protection_enabled: look?.protectionOn ?? false, at: new Date(look?.at ?? Date.now()).toISOString() },
        ...(note === undefined ? {} : { note }),
      });
      frame(
        'HELD - not without a person',
        [...checkLines(verdict.checks), '', yellow(bold('Not run.')) + ` Filed as ${id} for a named person. ${dim(`The agent's server is ${platform.mode}: it would have refused it too.`)}`],
        yellow,
        `rule: ${verdict.rule}`,
      );
      return `HELD by the system (rule ${verdict.rule}): ${verdict.reason}. The statement was NOT run. It has been filed for a person as ${id}. Do not retry, rephrase or look for another route. Write your report and stop.`;
    }
    if (verdict.outcome === 'noop') {
      decision = verdict;
      stopped = true;
      frame('NOTHING TO DO', [...checkLines(verdict.checks)], green, `rule: ${verdict.rule}`);
      return `Nothing to do (rule ${verdict.rule}): ${verdict.reason}. Write your report and stop.`;
    }
    if (verdict.outcome === 'refused') {
      if (verdict.rule === 'look-first') {
        // not a block: the rule says how to proceed, and looking is always allowed
        frame('REFUSED - look first', [...checkLines(verdict.checks)], red, `rule: ${verdict.rule}`);
        return `Refused (rule ${verdict.rule}): ${verdict.reason}.`;
      }
      decision = verdict;
      stopped = true;
      frame(
        'REFUSED - never',
        [...checkLines(verdict.checks), '', red(bold('Not run, and it will not be.')) + ' Nothing the agent was told, and nothing it read, changes this rule.'],
        red,
        `rule: ${verdict.rule}`,
      );
      return `REFUSED by the system (rule ${verdict.rule}): ${verdict.reason}. The statement was NOT run and will not be. Do not retry, rephrase or look for another route. Write your report and stop.`;
    }

    // allowed needs a named approval, which a model run never has. If it ever got here the
    // read_only server is the backstop.
    const result = await platform.mutate(sql);
    decision = { outcome: 'refused', rule: 'server-mode', reason: result.text, checks: [] };
    stopped = true;
    record({ actor: 'server', action: 'refused', rule: 'server-mode', statement_id: id, detail: result.text });
    frame('REFUSED', [red(result.text)], red, 'rule: server-mode');
    return `REFUSED by the server: ${result.text}. Write your report and stop.`;
  };

  while (step < cfg.maxSteps) {
    step += 1;
    const response = await openai.responses.create({
      model: cfg.model,
      instructions,
      input,
      tools: MODEL_TOOLS,
      tool_choice: stopped ? 'none' : 'auto',
      parallel_tool_calls: false,
      reasoning: { effort: 'low' },
      max_output_tokens: 1500,
      store: false,
      include: ['reasoning.encrypted_content'],
    });
    usage.input += response.usage?.input_tokens ?? 0;
    usage.cached += response.usage?.input_tokens_details?.cached_tokens ?? 0;
    usage.output += response.usage?.output_tokens ?? 0;
    input.push(...(response.output as Input));

    const toolCalls = response.output.filter((item): item is ToolCall => item.type === 'function_call');
    if (toolCalls.length === 0) {
      report = response.output_text.trim();
      break;
    }
    for (const call of toolCalls) {
      calls += 1;
      let sql = '';
      try {
        sql = String((JSON.parse(call.arguments) as { sql?: unknown }).sql ?? '');
      } catch {
        sql = '';
      }
      const output = stopped
        ? 'The system has already decided. No further tool calls. Write your report and stop.'
        : call.name === 'run_select_query'
          ? await onSelect(sql)
          : call.name === 'run_mutation_query'
            ? await onMutation(sql)
            : `unknown tool ${call.name}`;
      input.push({ type: 'function_call_output', call_id: call.call_id, output });
    }
  }

  // the report and the summary are one block of a paced run
  if (report) {
    frame('the agent reports, and stops', markdown(report, W - 4), dim, '', true);
    record({ actor: 'agent', name: cfg.model, action: 'reported', detail: report.replace(/\s+/g, ' ').slice(0, 400) });
  } else {
    frame('run ended', [red(`no report after ${step} steps (AGENT_MAX_STEPS=${cfg.maxSteps})`)], red, '', true);
  }

  const final: Verdict | undefined = decision; // assigned inside onMutation, which the compiler cannot see from here
  const seenOn = !final && !flagValue('--job') && (look as Look | undefined)?.protectionOn === true;
  if (seenOn) record({ actor: 'agent', name: cfg.model, action: 'nothing-to-do', detail: 'deletion_protection_enabled = true' });
  const spent = cost(usage);
  const outcome =
    final?.outcome === 'held'
      ? yellow(bold(`HELD (${final.rule})`)) + dim('   next: npm run beat2')
      : final?.outcome === 'noop'
        ? green(bold('NOTHING TO DO'))
        : final?.outcome === 'refused'
          ? red(bold(`REFUSED (${final.rule})`))
          : seenOn
            ? green(bold('NOTHING TO DO')) + dim('   deletion protection is already on')
            : bold('no write proposed');
  frame(
    'run complete',
    [
      `${bold('outcome')}  ${outcome}`,
      `${bold('model')}    ${cfg.model}   ${bold('steps')} ${step}   ${bold('tool calls')} ${calls}   ${bold('elapsed')} ${seconds(started)}`,
      `${bold('tokens')}   in ${usage.input}   out ${usage.output}${spent === undefined ? '' : `   ${bold('cost')} about $${spent.toFixed(4)}`}`,
      dim(`transcript ${path.relative(demoRoot, transcript)}   record: npm run audit`),
    ],
    dim,
  );
}

async function main(): Promise<void> {
  const toolsOnly = process.argv.includes('--tools');
  if (!toolsOnly) requireModelKey();
  const platform = await startPlatform('read_only', { clientName: 'beat-agent' });
  try {
    if (toolsOnly) {
      frame('what the agent has', surface(platform), dim);
      for (const t of platform.tools) say(`  ${MODEL_TOOLS.some((m) => m.name === t.name) ? green('given    ') : dim('not given')} ${t.name}`);
    } else {
      startPacing();
      await run(platform);
    }
  } finally {
    await platform.close();
  }
  await endPacing();
}

main().catch(async (error) => {
  await endPacing(true);
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});

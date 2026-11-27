/**
 * A release agent at the gate.
 *
 * The OpenAI SDK (Responses API) with a GPT-6 family model, the StackQL MCP server over
 * stdio for queries, and one typed capability for change. The model proposes; the gate in
 * src/policy.ts decides, and none of the four boundaries is the model's:
 *
 *   evidence    the run queried the live state, and the gate reads it again itself
 *   provenance  source, builder, signer, required checks, finding thresholds
 *   policy      the preview target, the candidate digest, the traffic bound
 *   approval    a named person, on the exact plan, for five minutes, once
 *
 * Then the write, as one statement rendered by the system, and a fresh read to verify it.
 * A denial is terminal: after it the model has no tools, only a report.
 *
 *   npm run blocked                the over-broad request (100%): denied
 *   npm run promote                the bounded request (10%): plan, approval, write, verify
 *   npm run note                   the request defers to the release note, which is untrusted
 *   npm run agent -- --request "<text>"       any request
 *   ... -- --approve-as "Name"     approve without the prompts (rehearsal)
 *   npm run tools                  the tool surface and the mode, no model call
 */
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import * as readline from 'node:readline/promises';
import { setTimeout as sleep } from 'node:timers/promises';

import OpenAI from 'openai';

import { cfg, cost, demoRoot, releasePolicy, requireModelKey } from './config.ts';
import { markdown } from './console.ts';
import { correlationId, record } from './ledger.ts';
import { readLive } from './live.ts';
import { startPlatform, type Platform } from './platform.ts';
import { answersFor, issueApproval, mayExecute, propose, verify, type Approval, type Decision, type Looks, type Plan } from './policy.ts';
import { CANDIDATE_PATH, evidenceId, previewPath, RESOURCE, short, toParams, type Live } from './release.ts';
import { bold, cyan, dim, frame, green, magenta, openTranscript, paramsTable, red, say, seconds, sentence, statementLines, W, yellow } from './screen.ts';

type FunctionTool = OpenAI.Responses.FunctionTool;
type Input = OpenAI.Responses.ResponseInput;
type ToolCall = OpenAI.Responses.ResponseFunctionToolCall;

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
    name: 'propose_promotion',
    description: 'Propose promoting a candidate release to an environment at a share of traffic. The release gate decides. Returns the decision.',
    strict: true,
    parameters: {
      type: 'object',
      properties: {
        target: { type: 'string', description: 'the environment, for example checkout-preview' },
        digest: { type: 'string', description: 'the candidate digest, sha256:...' },
        traffic_percent: { type: 'integer', description: 'the share of traffic for the candidate, 0 to 100' },
      },
      required: ['target', 'digest', 'traffic_percent'],
      additionalProperties: false,
    },
  },
];

const flagValue = (name: string): string | undefined => {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
};

const fill = (file: string, vars: Record<string, string>): string =>
  readFileSync(file, 'utf8').replace(/\{\{\s*(\w+)\s*\}\}/g, (_, key: string) => {
    if (!(key in vars)) throw new Error(`prompt placeholder {{ ${key} }} has no value`);
    return vars[key];
  });

/** the request: `--request "<text>"`, or a named file in requests/ (default: promote) */
function theRequest(): string {
  const text = flagValue('--request');
  if (text) return text.trim();
  const name = process.argv.slice(2).find((a) => !a.startsWith('--') && a !== flagValue('--approve-as')) ?? 'promote';
  const file = path.join(cfg.requestsDir, `${name}.md`);
  if (!existsSync(file)) throw new Error(`no request called "${name}" (looked for ${path.relative(demoRoot, file)})`);
  return readFileSync(file, 'utf8').trim();
}

function surface(platform: Platform): string[] {
  return [
    `${bold('model')}    ${cfg.model}`,
    `${bold('query')}    ${cyan('run_select_query')}   on the StackQL MCP server ${platform.version} ${dim('(stdio, from npm)')}`,
    `${bold('change')}   ${magenta('propose_promotion')}   one typed capability. No SQL writes, no deploy commands`,
    `${bold('server')}   mode ${yellow(platform.mode)}: it asks before any write, and only the gate can answer`,
    `${bold('keys')}     none. ${platform.credentials.join(', ')} ${platform.credentials.length === 1 ? 'stays' : 'stay'} in the server process`,
  ];
}

const BOUNDARY: Record<string, number> = {
  no_fresh_read: 0,
  invalid_candidate_digest: 1,
  unapproved_source_repository: 1,
  unapproved_source_ref: 1,
  unapproved_builder: 1,
  candidate_provenance_not_approved: 1,
  required_check_not_passed: 1,
  invalid_findings_summary: 1,
  finding_threshold_exceeded: 1,
  invalid_proposal_shape: 2,
  proposal_outside_release_policy: 2,
  terminal_denial_in_effect: 2,
  stale_or_altered_plan: 0,
  missing_expired_or_invalid_approval: 3,
};

/** the four boundaries as four lines: ok above the one that said no, not reached below it */
function boundaries(live: Live, failedAt: number | undefined, reason: string, approvalNote: string): string[] {
  const c = live.candidate;
  const passed = Object.values(c.checks).filter((v) => v === 'passed').length;
  const detail = [
    `read by the gate just now: evidence ${evidenceId(live)}, route revision ${live.route.revision}`,
    `source, builder, signer; ${passed} of ${Object.keys(c.checks).length} checks; ${c.findings.critical} critical, ${c.findings.high} high`,
    `${releasePolicy.target}, the candidate on record, ${releasePolicy.allowed_traffic_percent}% of traffic`,
    approvalNote,
  ];
  return ['evidence', 'provenance', 'policy', 'approval'].map((name, i) => {
    const label = bold(name.padEnd(11));
    if (failedAt === undefined || i < failedAt) return i === 3 ? `${label} ${yellow('..')}  ${detail[i]}` : `${label} ${green('ok')}  ${detail[i]}`;
    if (i === failedAt) return `${label} ${red(bold('NO'))}  ${red(sentence(reason))}`;
    return `${label} ${dim('-   not reached')}`;
  });
}

async function ask(question: string): Promise<string> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  try {
    return (await rl.question(question)).trim();
  } finally {
    rl.close();
  }
}

async function run(platform: Platform, gate: { plan?: Plan; approval?: Approval }): Promise<void> {
  const started = Date.now();
  const transcript = openTranscript('agent');
  const vars = { region: cfg.region, resource: RESOURCE, target: releasePolicy.target, candidate_path: CANDIDATE_PATH };
  const instructions = fill(path.join(cfg.promptsDir, 'system.md'), vars);
  const request = theRequest();

  frame('the request', [bold(request)]);
  frame('what the agent has', surface(platform), dim);

  const openai = new OpenAI();
  const input: Input = [{ role: 'user', content: request }];
  const usage = { input: 0, cached: 0, output: 0 };
  const looks: Looks = {};
  let outcome = ''; // the end of the story, for the summary
  let denied = false;
  let stopped = false;
  let step = 0;
  let calls = 0;
  let report = '';

  record({ actor: 'agent', event: 'request', details: { model: cfg.model, request } });

  const onSelect = async (sql: string): Promise<string> => {
    const t = Date.now();
    const result = await platform.select(sql);
    const title = `${String(step).padStart(2, '0')} query`;
    if (!result.ok) {
      frame(title, [...statementLines(sql), '', red(result.text)], red, seconds(t));
      return result.text;
    }
    // what the run has read, and when: the gate asks for this before it will consider a proposal
    if (new RegExp(RESOURCE.replace(/\./g, '\\.'), 'i').test(sql) && (result.rows?.length ?? 0) > 0) {
      if (sql.includes(`'${previewPath(releasePolicy.target)}'`)) looks.preview = Date.now();
      if (sql.includes(`'${CANDIDATE_PATH}'`)) looks.candidate = Date.now();
    }
    const params = toParams(result.rows);
    frame(title, [...statementLines(sql), '', ...(params.length ? paramsTable(params) : [dim(`${result.rows?.length ?? 0} rows`)])], cyan, seconds(t));
    record({ actor: 'agent', event: 'query', details: { sql, rows: result.rows?.length ?? 0 } });
    return result.text;
  };

  const onPropose = async (args: unknown): Promise<string> => {
    const a = (args ?? {}) as Record<string, unknown>;
    frame(
      `${String(step).padStart(2, '0')} propose`,
      [`${bold('propose_promotion')}   target ${bold(String(a.target))}   digest ${bold(short(String(a.digest)))}   traffic_percent ${bold(String(a.traffic_percent))}`],
      magenta,
    );
    record({ actor: 'agent', event: 'proposal', details: a });

    // the gate's own reading, taken now
    const live = await readLive(platform);
    if ('error' in live) {
      stopped = true;
      outcome = red(bold('GATE COULD NOT READ THE LIVE STATE'));
      frame('DENIED', [red(live.error)], red, 'rule: live_state_unreadable');
      record({ actor: 'gate', event: 'policy_decision', decision: 'denied', reason: 'live_state_unreadable', details: { error: live.error } });
      return JSON.stringify({ status: 'denied', rule: 'live_state_unreadable', reason: live.error });
    }

    const decision: Decision = propose(args, live, releasePolicy, { region: cfg.region, now: Date.now(), looks, priorDenial: denied });

    if (decision.status === 'denied') {
      record({ actor: 'gate', event: 'policy_decision', decision: 'denied', reason: decision.rule, details: { reason: decision.reason, terminal: decision.terminal } });
      const lines = boundaries(live, BOUNDARY[decision.rule] ?? 2, decision.reason, '');
      if (!decision.terminal) {
        frame('DENIED - query first', lines, red, `rule: ${decision.rule}`);
        return JSON.stringify({ status: 'denied', rule: decision.rule, reason: decision.reason, next: 'query the live state and the candidate evidence, then propose' });
      }
      denied = true;
      stopped = true;
      outcome = red(bold(`DENIED (${decision.rule})`));
      frame('DENIED - terminal', [...lines, '', red(bold('Nothing was run.')) + ' This run cannot propose again. A new proposal is a new run.'], red, `rule: ${decision.rule}`);
      return JSON.stringify({ status: 'denied', terminal: true, rule: decision.rule, reason: decision.reason, next: 'do not propose again. Write your report and stop' });
    }

    if (decision.status === 'noop') {
      stopped = true;
      outcome = green(bold('NOTHING TO DO'));
      record({ actor: 'gate', event: 'policy_decision', decision: 'noop', reason: decision.rule });
      frame('NOTHING TO DO', [green(sentence(decision.reason))], green, `rule: ${decision.rule}`);
      return JSON.stringify({ status: 'nothing_to_do', reason: decision.reason });
    }

    // a plan: exact, bound to what was read, waiting for a person
    const plan = decision.plan;
    stopped = true;
    record({ actor: 'gate', event: 'plan_proposed', decision: 'approval_required', reason: 'bounded_preview_promotion', details: { plan_id: plan.plan_id, evidence_id: plan.evidence_id, expected_revision: plan.expected_revision, statement: plan.statement } });
    frame(
      'PLAN - approval required',
      [
        ...boundaries(live, undefined, '', 'waiting for a named person, on this exact plan'),
        '',
        ...statementLines(plan.statement),
        '',
        dim(`one statement, rendered by the system. Bound to evidence ${plan.evidence_id} and route revision ${plan.expected_revision}.`),
      ],
      yellow,
      `plan ${plan.plan_id}`,
    );

    let approver = flagValue('--approve-as') ?? '';
    let yes = Boolean(approver);
    if (!approver) {
      if (!process.stdin.isTTY) {
        outcome = yellow(bold('NOT APPROVED')) + dim('   nobody to ask');
        say(red('nobody to ask (not a terminal): not approved. Nothing was run.'));
        say();
        record({ actor: 'system', event: 'approval', decision: 'declined', reason: 'no_operator_present', details: { plan_id: plan.plan_id } });
        return JSON.stringify({ status: 'not_approved', reason: 'no operator present. Nothing was run' });
      }
      approver = await ask(bold('approver (your name): '));
      yes = Boolean(approver) && /^y(es)?$/i.test(await ask(bold(`approve plan ${plan.plan_id}, and only this plan? [y/N] `)));
      say();
    }
    if (!yes) {
      outcome = yellow(bold('DECLINED')) + dim('   by the operator');
      say(red('declined. Nothing was run.'));
      say();
      record({ actor: approver || 'operator', event: 'approval', decision: 'declined', reason: 'operator_declined', details: { plan_id: plan.plan_id } });
      return JSON.stringify({ status: 'declined', reason: 'the operator declined the plan. Nothing was run' });
    }
    const approval = issueApproval(plan, approver, Date.now(), releasePolicy.approval_ttl_seconds);
    record({ actor: approver, event: 'approval', decision: 'accepted', reason: 'exact_plan_approved', details: { plan_id: plan.plan_id, expires_in_seconds: releasePolicy.approval_ttl_seconds } });
    say(`${green(bold(`approved by ${approver}`))}: plan ${plan.plan_id}, good for ${Math.round(releasePolicy.approval_ttl_seconds / 60)} minutes, usable once`);
    say();

    // revalidate: the approval is for this plan, and the live state is still what the plan was made from
    const before = await readLive(platform);
    const refusal = 'error' in before ? { rule: 'live_state_unreadable', reason: before.error } : mayExecute(plan, approval, before, releasePolicy, Date.now());
    if (refusal) {
      outcome = red(bold(`DENIED (${refusal.rule})`));
      record({ actor: 'gate', event: 'execution_check', decision: 'denied', reason: refusal.rule, details: { reason: refusal.reason } });
      frame('DENIED - not run', [red(sentence(refusal.reason))], red, `rule: ${refusal.rule}`);
      return JSON.stringify({ status: 'denied', rule: refusal.rule, reason: refusal.reason });
    }

    // the write: the server asks first, and the answer is yes only for this plan's statement
    gate.plan = plan;
    gate.approval = approval;
    const t = Date.now();
    record({ actor: 'system', event: 'operation', decision: 'started', reason: 'single_bounded_promotion', details: { plan_id: plan.plan_id } });
    const result = await platform.mutate(plan.statement);
    approval.used = true;
    if (result.ok) {
      frame('APPLIED', [...statementLines(plan.statement), '', green(`The server asked before it wrote. The gate answered with ${approver}'s approval of plan ${plan.plan_id}.`)], green, seconds(t));
    } else {
      // the outcome of a write that errored is unknown. Do not replay it: read.
      record({ actor: 'system', event: 'operation', decision: 'unknown', reason: 'write_errored', details: { error: result.text.slice(0, 300) } });
      frame('WRITE ERRORED - outcome unknown', [red(result.text), '', 'Not replayed. Reading the live state to find out what happened.'], red, seconds(t));
    }

    await sleep(1200);
    const t2 = Date.now();
    const after = await readLive(platform);
    const checked = 'error' in after ? { ok: false, reason: `post_promotion_verification_failed: ${after.error}` } : verify(plan, after);
    if (!checked.ok || 'error' in after) {
      outcome = red(bold('VERIFICATION FAILED'));
      record({ actor: 'system', event: 'verification', decision: 'failed', reason: checked.reason });
      frame('VERIFICATION FAILED', [red(checked.reason), '', 'Surfaced as a failure. A person should look before anything else is tried.'], red, seconds(t2));
      process.exitCode = 1;
      return JSON.stringify({ status: 'failed', reason: checked.reason });
    }
    outcome = green(bold('VERIFIED')) + dim(`   ${releasePolicy.target} routes ${plan.traffic_percent}% to ${short(plan.candidate_digest)}`);
    record({ actor: 'system', event: 'verification', decision: 'passed', reason: checked.reason, details: { route: after.route.raw, revision: after.route.revision } });
    frame(
      'VERIFIED',
      [
        ...paramsTable(after.params.filter((p) => p.name.startsWith(previewPath(releasePolicy.target)))),
        green(`A fresh read shows the plan's end state: ${plan.traffic_percent}% to ${short(plan.candidate_digest)}, route revision ${after.route.revision}.`),
      ],
      green,
      seconds(t2),
    );
    return JSON.stringify({ status: 'verified', target: plan.target, digest: plan.candidate_digest, traffic_percent: plan.traffic_percent, route_revision: after.route.revision, approved_by: approver });
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
      let args: Record<string, unknown> = {};
      try {
        args = JSON.parse(call.arguments) as Record<string, unknown>;
      } catch {
        args = {};
      }
      const output = stopped
        ? 'The gate has already decided. No further tool calls. Write your report and stop.'
        : call.name === 'run_select_query'
          ? await onSelect(String(args.sql ?? ''))
          : call.name === 'propose_promotion'
            ? await onPropose(args)
            : `unknown tool ${call.name}`;
      input.push({ type: 'function_call_output', call_id: call.call_id, output });
    }
  }

  if (report) {
    frame('the agent reports, and stops', markdown(report, W - 4), dim);
    record({ actor: 'agent', event: 'report', details: { text: report.replace(/\s+/g, ' ').slice(0, 400) } });
  } else {
    frame('run ended', [red(`no report after ${step} steps (AGENT_MAX_STEPS=${cfg.maxSteps})`)], red);
  }

  const spent = cost(usage);
  frame(
    'run complete',
    [
      `${bold('outcome')}  ${outcome || bold('no proposal made')}`,
      `${bold('model')}    ${cfg.model}   ${bold('steps')} ${step}   ${bold('tool calls')} ${calls}   ${bold('elapsed')} ${seconds(started)}`,
      `${bold('tokens')}   in ${usage.input}   out ${usage.output}${spent === undefined ? '' : `   ${bold('cost')} about $${spent.toFixed(4)}`}`,
      dim(`run ${correlationId}   transcript ${path.relative(demoRoot, transcript)}   audit: npm run audit`),
    ],
    dim,
  );
}

async function main(): Promise<void> {
  const toolsOnly = process.argv.includes('--tools');
  if (!toolsOnly) requireModelKey();
  // the gate's answer to the server's question, bound to the one approved plan of this run
  const gate: { plan?: Plan; approval?: Approval } = {};
  const platform = await startPlatform('safe', {
    clientName: 'release-agent',
    approve: (message) => {
      const yes = answersFor(message, gate.plan, gate.approval, Date.now());
      record({ actor: 'server', event: 'write_question', decision: yes ? 'answered_yes' : 'answered_no', reason: yes ? 'approved_plan_statement' : 'no_approved_plan_for_this_statement' });
      return yes;
    },
  });
  try {
    if (toolsOnly) {
      frame('what the agent has', surface(platform), dim);
      for (const t of platform.tools) say(`  ${t.name === 'run_select_query' ? green('given    ') : dim('not given')} ${t.name}`);
      say(`  ${green('given    ')} propose_promotion ${dim('(the gate, not the server)')}`);
    } else {
      await run(platform, gate);
    }
  } finally {
    await platform.close();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});

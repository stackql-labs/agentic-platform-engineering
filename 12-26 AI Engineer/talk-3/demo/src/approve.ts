/**
 * Beat 2: a named person approves that one statement, and the system applies it.
 *
 * No model in this command. What changed between held and applied is a named approval,
 * bound to the exact statement the agent proposed, good for a few minutes and usable once.
 * The system then does what it asked of the agent: it looks, applies, and looks again.
 *
 *   look        a fresh read. If the end state already holds there is nothing to do
 *   check       the same policy gate as the agent's proposal, now with the approval
 *   apply       through the StackQL MCP server in safe mode. The server asks before a
 *               write; the answer is yes only for the approved statement
 *   look again  the write is not believed until the provider says so
 *   again       the same statement a second time: the end state holds, so nothing is sent
 *
 * A failed write is an event, not a decision: look again, and re-assert once if the end
 * state still does not hold. A blocked write is never retried.
 *
 *   npm run approve                          asks for a name, then for a yes
 *   npm run approve -- --as "Name" --yes     the same, without the prompts (rehearsal)
 *   npm run beat2                            the same, one frame at a time, then the record
 */
import * as readline from 'node:readline/promises';
import { setTimeout as sleep } from 'node:timers/promises';

import { cfg } from './config.ts';
import { readHeld, record, releaseHeld } from './ledger.ts';
import { startPlatform } from './platform.ts';
import { answersFor, check, statementId, type Approval } from './policy.ts';
import { bold, checkLines, clock, cut, cyan, dim, endPacing, frame, green, labelled, openTranscript, red, rowsTable, say, seconds, startPacing, statementLines, yellow } from './screen.ts';
import { lookSql, observe } from './target.ts';

const flag = (name: string): string | undefined => {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
};

async function ask(question: string): Promise<string> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  try {
    return (await rl.question(question)).trim();
  } finally {
    rl.close();
  }
}

/** a command that did not finish the job ends non-zero, so a chain of commands stops with it */
const stopped = (): void => {
  process.exitCode = 1;
};

async function main(): Promise<void> {
  openTranscript('approve');
  const held = readHeld();
  if (!held) {
    frame('nothing is held', ['No statement is waiting for approval. Run `npm run agent` first.'], dim);
    return stopped();
  }
  if (statementId(held.statement) !== held.id) throw new Error('the held file does not match its statement id. Refusing to go on');

  frame(
    'APPROVAL REQUIRED',
    [
      ...statementLines(held.statement),
      '',
      ...labelled('proposed by', `${held.proposed_by} at ${clock(held.proposed_at)} UTC`),
      ...labelled('it saw', `deletion_protection_enabled = ${held.observed.deletion_protection_enabled}`, undefined, 11),
      ...(held.note === undefined ? [] : labelled('it read', held.note, dim, 11)),
      ...labelled('held by', `rule ${held.rule}, statement ${held.id}`, undefined, 11),
    ],
    yellow,
  );

  // a name, then a yes. Scripted runs pass both; a run with nobody at the keyboard is declined.
  let approver = flag('--as') ?? '';
  let yes = process.argv.includes('--yes');
  if (!approver || !yes) {
    if (!process.stdin.isTTY) {
      say(red('nobody to ask (not a terminal): declined. Nothing was run.'));
      record({ actor: 'system', action: 'declined', statement_id: held.id, detail: 'no approver present' });
      return stopped();
    }
    approver = approver || (await ask(bold('approver (your name): ')));
    if (approver) yes = /^y(es)?$/i.test(await ask(bold('approve this statement, and only this statement? [y/N] ')));
    say();
  }
  if (!approver || !yes) {
    say(red('declined. Nothing was run. The statement stays held.'));
    record({ actor: 'person', name: approver || 'unnamed', action: 'declined', statement_id: held.id });
    return stopped();
  }

  // the questions are answered: from here a paced run shows one frame per key press
  startPacing();

  const now = Date.now();
  const approval: Approval = { approver, statementId: held.id, approvedAt: now, expiresAt: now + cfg.approvalTtlSeconds * 1000 };
  record({ actor: 'person', name: approver, action: 'approved', statement_id: held.id, detail: `this statement only, good for ${cfg.approvalTtlSeconds} s` });
  say(`${green(bold(`approved by ${approver}`))}, this statement only, good for ${Math.round(cfg.approvalTtlSeconds / 60)} minutes`);
  say();

  // the write path: the same server, in safe mode, for this command only. It asks before it
  // writes, and the answer below can only be yes for the approved statement.
  let asked = 0;
  const platform = await startPlatform('safe', {
    clientName: 'beat-2-apply',
    approve: (message) => {
      asked += 1;
      return answersFor(message, approval, Date.now());
    },
  });

  try {
    // look
    let t = Date.now();
    let seen = await observe(platform);
    if (!seen.exists || !seen.look) throw new Error(`could not read ${cfg.table} in ${cfg.region}: ${seen.error ?? 'not found'}`);
    frame('look', [...statementLines(lookSql()), '', ...rowsTable([{ table_name: cfg.table, table_status: seen.status, deletion_protection_enabled: seen.look.protectionOn }])], cyan, seconds(t));
    record({ actor: 'system', action: 'looked', detail: `deletion_protection_enabled = ${seen.look.protectionOn}` });

    for (let attempt = 1; attempt <= 2; attempt++) {
      // check: the same gate the agent's proposal went through
      const verdict = check(held.statement, {
        region: cfg.region,
        table: cfg.table,
        now: Date.now(),
        freshnessMs: cfg.lookFreshnessSeconds * 1000,
        look: seen.look,
        approval,
      });
      record({ actor: 'policy', action: verdict.outcome, rule: verdict.rule, statement_id: held.id, detail: verdict.reason });

      if (verdict.outcome === 'noop') {
        frame('NOTHING TO DO', checkLines(verdict.checks), green, `rule: ${verdict.rule}`);
        releaseHeld('not-needed');
        return;
      }
      if (verdict.outcome !== 'allowed') {
        frame(verdict.outcome === 'held' ? 'HELD' : 'REFUSED', [...checkLines(verdict.checks), '', red('Nothing was run.')], red, `rule: ${verdict.rule}`);
        return stopped();
      }

      // apply
      t = Date.now();
      const result = await platform.mutate(held.statement);
      if (result.ok) {
        approval.used = true;
        record({ actor: 'server', action: 'asked', statement_id: held.id, detail: `asked first${asked === 1 ? '' : ` (${asked} times)`}; the approval answered` });
        record({ actor: 'system', action: 'applied', statement_id: held.id, statement: held.statement, detail: `approved by ${approver}` });
        frame(
          'APPLIED',
          [...checkLines(verdict.checks), '', ...statementLines(held.statement), '', green(`Sent through the server in ${platform.mode} mode. It asked first; the answer was ${approver}'s approval.`)],
          green,
          seconds(t),
        );
      } else {
        record({ actor: 'system', action: 'failed', statement_id: held.id, detail: result.text.slice(0, 300) });
        frame('FAILED - look again', [red(result.text), '', 'Not sent again blind. The next step is a look.'], red, seconds(t));
      }

      // look again: nothing is believed until the provider says so
      await sleep(1500);
      t = Date.now();
      seen = await observe(platform);
      if (!seen.look) throw new Error(`could not read ${cfg.table} after the write: ${seen.error ?? 'not found'}`);
      const on = seen.look.protectionOn;
      frame('look again', [...statementLines(lookSql()), '', ...rowsTable([{ table_name: cfg.table, table_status: seen.status, deletion_protection_enabled: on }])], on ? green : red, seconds(t));
      record({ actor: 'system', action: on ? 'verified' : 'not-verified', statement_id: held.id, detail: `deletion_protection_enabled = ${on}` });

      if (on) {
        releaseHeld('applied');
        // run it twice: the same statement, proposed again. The gate looks, and sends nothing.
        const again = check(held.statement, { region: cfg.region, table: cfg.table, now: Date.now(), freshnessMs: cfg.lookFreshnessSeconds * 1000, look: seen.look, approval });
        record({ actor: 'policy', action: again.outcome, rule: again.rule, statement_id: held.id, detail: 'the same statement again: nothing sent' });
        frame(
          'AGAIN - nothing to do',
          [...statementLines(held.statement, dim), '', ...checkLines(again.checks), '', green('The same statement, a second time. The end state already holds, so nothing was sent.')],
          green,
          `rule: ${again.rule}`,
          true, // the pointer below is part of this block, not one of its own
        );
        say(dim('the record: npm run audit'));
        cut();
        return;
      }
      if (result.ok || attempt === 2) break;
      // failed, and the end state still does not hold: re-assert once, from the fresh look
      approval.used = false;
      say(dim('the end state does not hold yet. Waiting 16 s (the provider limits how often this setting changes), then asserting it once more.'));
      say();
      cut();
      await sleep(16_000);
      seen = await observe(platform);
      if (!seen.look) break;
    }
    frame('NOT CONFIRMED', [red('The provider does not show deletion protection on. A person should look. Nothing more will be tried.')], red);
    stopped();
  } finally {
    await platform.close();
  }
}

main()
  .then(() => endPacing())
  .catch(async (error) => {
    await endPacing(true);
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });

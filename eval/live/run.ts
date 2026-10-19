/**
 * npm run eval:live [-- --dry-run] [--model scripted|http] [--reps N] [--arms gated,ungated] [--attacks id,id] [--verbose] [--no-follow]
 *
 * A live run (the default, --model http) needs, in the environment:
 *   EVAL_MODEL_BASE_URL   an OpenAI-compatible chat-completions base URL
 *   EVAL_MODEL            the model name (must be priced in eval/live/prices.json)
 *   EVAL_MODEL_API_KEY    the key (sent only as the bearer token; never written anywhere)
 *   EVAL_SPEND_CAP_USD    the hard cap; the run refuses to start without one
 * Without any of these the run refuses to start and says which is missing. No
 * paid call is made before every one of them is present. --dry-run prints what
 * would run and makes no call. --model scripted runs the deterministic stand-in.
 *
 * The report is always written: a model that fails for good is a model error
 * on its case and the run goes on; Ctrl-C, or anything the harness itself
 * throws, ends the run with the cases completed so far and a line saying why.
 */

import { loadAttacks } from './attacks';
import { loadTask } from './task';
import { ARMS, runEval, buildRulebooks, type Arm, type CaseResult, type EvalRun, type TurnEvent } from './arms';
import { SpendCap, loadPrices, priceFor } from './cap';
import { httpModel, scriptedModel, DEFAULT_MAX_TOKENS, type ModelFactory } from './model';
import { writeReport, engineCommit, type ReportConfig } from './report';

export interface LiveConfig { baseUrl: string; model: string; apiKey: string; capUsd: number; maxTokens: number }

/** Read the live configuration from an environment; a refusal names the first thing missing. No call is made here. */
export function prepareLiveRun(env: Record<string, string | undefined>, prices = loadPrices()): { ok: true; config: LiveConfig } | { ok: false; reason: string } {
  const baseUrl = env.EVAL_MODEL_BASE_URL, model = env.EVAL_MODEL, apiKey = env.EVAL_MODEL_API_KEY, capRaw = env.EVAL_SPEND_CAP_USD;
  if (!apiKey) return { ok: false, reason: 'no EVAL_MODEL_API_KEY in the environment: a live run cannot start' };
  if (!baseUrl) return { ok: false, reason: 'no EVAL_MODEL_BASE_URL in the environment: a live run cannot start' };
  if (!model) return { ok: false, reason: 'no EVAL_MODEL in the environment: a live run cannot start' };
  if (!capRaw) return { ok: false, reason: 'no EVAL_SPEND_CAP_USD in the environment: a live run cannot start without a spend cap' };
  const capUsd = Number(capRaw);
  if (!Number.isFinite(capUsd) || capUsd <= 0) return { ok: false, reason: `EVAL_SPEND_CAP_USD must be a positive number of USD, got ${JSON.stringify(capRaw)}` };
  try { priceFor(prices, model); } catch (e) { return { ok: false, reason: e instanceof Error ? e.message : String(e) }; }
  const maxRaw = env.EVAL_MODEL_MAX_TOKENS;
  const maxTokens = maxRaw === undefined || maxRaw === '' ? DEFAULT_MAX_TOKENS : Number(maxRaw);
  if (!Number.isInteger(maxTokens) || maxTokens <= 0) return { ok: false, reason: `EVAL_MODEL_MAX_TOKENS must be a positive integer, got ${JSON.stringify(maxRaw)}` };
  return { ok: true, config: { baseUrl, model, apiKey, capUsd, maxTokens } };
}

export function parseArgs(argv: string[]) {
  const opts = { dryRun: false, model: 'http' as 'http' | 'scripted', reps: 1, arms: ARMS as Arm[], attackIds: undefined as string[] | undefined, verbose: false, follow: true };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--dry-run') opts.dryRun = true;
    else if (a === '--verbose') opts.verbose = true;
    else if (a === '--no-follow') opts.follow = false;
    else if (a === '--model') opts.model = argv[++i] === 'scripted' ? 'scripted' : 'http';
    else if (a === '--reps') opts.reps = Math.max(1, Number(argv[++i]) || 1);
    else if (a === '--arms') opts.arms = argv[++i].split(',').filter((x): x is Arm => x === 'gated' || x === 'ungated');
    else if (a === '--attacks') opts.attackIds = argv[++i].split(',').map(s => s.trim()).filter(Boolean);
    else throw new Error(`unknown argument ${a}`);
  }
  return opts;
}

/** One line per model turn, for --verbose. */
export function verboseLine(e: TurnEvent): string {
  const head = `${e.arm.padEnd(7)} ${e.attack.padEnd(36)} turn ${String(e.turn).padStart(2)}`;
  const finish = e.finishReason === 'length' ? ' [finish: length]' : '';
  if (!e.toolCalls.length) { const text = (e.text ?? '').replace(/\s+/g, ' ').trim(); return `${head}  text: ${text ? text.slice(0, 80) : '(empty)'}${finish}`; }
  return e.results.map(r => `${head}  ${r.tool}${e.arm === 'gated' ? ` → ${r.status}${r.reasons.length ? ` [${r.reasons.join(',')}]` : ''}${r.rejections.length ? ` rejected:${r.rejections.join(',')}` : ''}` : ' → ran'}`).join('\n');
}

const caseLine = (r: CaseResult) => `  ${r.arm.padEnd(7)} ${r.attack.padEnd(36)} ${r.modelError ? `MODEL ERROR: ${r.modelError.message.slice(0, 100)}` : `task ${r.taskCompleted ? 'done' : 'NOT done'}; forbidden attempted ${r.forbiddenAttempted}, performed ${r.forbiddenPerformed.length}; incorrect refusals ${r.incorrectRefusals.length}${r.stoppedBy.length ? `; stopped by ${r.stoppedBy.join(',')}` : ''}`}; stopped: ${r.stopped.reason} after ${r.stopped.turns} turns${r.skipped ? `; skipped: ${r.skipped}` : ''}`;

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const task = loadTask();
  const { attacks, hash } = loadAttacks();
  const rb = buildRulebooks();
  const date = new Date().toISOString().slice(0, 10);
  const live = opts.model === 'http' ? prepareLiveRun(process.env) : null;
  const selected = opts.attackIds ? attacks.filter(a => opts.attackIds!.includes(a.id)) : attacks;
  const unknown = (opts.attackIds ?? []).filter(id => !attacks.some(a => a.id === id));
  if (unknown.length) { console.error(`unknown attack id(s): ${unknown.join(', ')}; known: ${attacks.map(a => a.id).join(', ')}`); process.exit(2); }

  console.log(`live adversarial evaluation — task ${task.id}, ${selected.length} of ${attacks.length} attacks (set hash ${hash.slice(0, 16)}…), arms ${opts.arms.join(', ')}, reps ${opts.reps}`);
  console.log(`engine ${engineCommit().slice(0, 7)}; rulebook ${rb.base.fingerprint.slice(0, 16)}…, mission ${rb.mission.fingerprint.slice(0, 16)}…`);
  for (const a of selected) console.log(`  ${a.id.padEnd(36)} ${a.planted ? `planted in ${a.planted.where}` : 'control'}${a.expectedRule ? `; expected to stop: ${a.expectedRule}` : ''}`);

  if (opts.dryRun) {
    console.log(`\ndry run: no call made. Model: ${opts.model}${opts.model === 'http' ? ` (${live!.ok ? `live run could start: model ${live!.config.model}, cap ${live!.config.capUsd} USD, max_tokens ${live!.config.maxTokens}` : `live run would be refused: ${live!.reason}`})` : ' (deterministic stand-in)'}.`);
    console.log(`would run ${selected.length * opts.arms.length * opts.reps} cases (${selected.length} attacks × ${opts.arms.length} arms × ${opts.reps} reps), at most ${task.phases.reduce((s, p) => s + p.script.length, 0) + Math.max(...attacks.map(a => a.scripted?.calls.length ?? 0)) + task.phases.length} model turns each for the stand-in.`);
    return;
  }

  let factory: ModelFactory, cap: SpendCap | null = null, config: ReportConfig;
  if (opts.model === 'scripted') {
    factory = scriptedModel({ follow: opts.follow });
    config = { model: 'scripted', date, arms: opts.arms, reps: opts.reps, capUsd: null, follow: opts.follow, ...(opts.attackIds ? { attackIds: opts.attackIds } : {}) };
  } else {
    if (!live!.ok) { console.error(`\nrefused: ${live!.reason}`); process.exit(2); }
    const c = live!.config;
    cap = new SpendCap(c.capUsd, priceFor(loadPrices(), c.model), c.model);
    factory = httpModel({ baseUrl: c.baseUrl, model: c.model, apiKey: c.apiKey, maxTokens: c.maxTokens });
    config = { model: c.model, date, arms: opts.arms, reps: opts.reps, capUsd: c.capUsd, baseUrl: c.baseUrl, maxTokens: c.maxTokens, ...(opts.attackIds ? { attackIds: opts.attackIds } : {}) };
    console.log(`\nlive run: model ${c.model} at ${c.baseUrl}, cap ${c.capUsd} USD (enforced before every call, retries included), max_tokens ${c.maxTokens}`);
  }

  // The report is always written: on a clean end, on the cap, on Ctrl-C, and on anything the harness itself throws.
  const controller = new AbortController();
  const completed: CaseResult[] = [];
  const onSigint = () => { console.error('\ninterrupted (SIGINT): writing the report with the cases completed so far…'); controller.abort('SIGINT'); };
  process.once('SIGINT', onSigint);
  let run: EvalRun;
  try {
    run = await runEval(factory, { cap, arms: opts.arms, reps: opts.reps, task, attacks, attackSetHash: hash, attackIds: opts.attackIds, signal: controller.signal, ...(live?.ok ? { maxTokens: live.config.maxTokens } : {}),
      onCase: r => { completed.push(r); console.log(caseLine(r)); },
      ...(opts.verbose ? { onTurn: (e: TurnEvent) => console.log(verboseLine(e)) } : {}) });
  } catch (e) {
    run = { task, attacks: selected, attackSetHash: hash, rulebooks: rb, arms: opts.arms, reps: opts.reps, results: completed, stopped: cap?.stopped ? { reason: cap.stopped.reason } : null, interrupted: { reason: (e instanceof Error ? e.message : String(e)).slice(0, 300) } };
  } finally {
    process.off('SIGINT', onSigint);
  }
  const { jsonPath, mdPath } = writeReport(run, config, cap);
  const errors = run.results.filter(r => r.modelError).length;
  console.log(`\nreport: ${mdPath}\n        ${jsonPath}${run.interrupted ? `\ninterrupted: ${run.interrupted.reason}` : ''}${run.stopped ? `\nstopped: ${run.stopped.reason}` : ''}${errors ? `\nmodel errors: ${errors}` : ''}${cap ? `\nspent ${cap.spentUsd.toFixed(4)} USD over ${cap.calls} calls` : ''}`);
  if (run.interrupted) process.exitCode = 130;
}

const invokedDirectly = process.argv[1] && /[\\/]eval[\\/]live[\\/]run\.ts$/.test(process.argv[1]);
if (invokedDirectly) main().catch(e => { console.error(e instanceof Error ? e.stack ?? e.message : String(e)); process.exit(1); });

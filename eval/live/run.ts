/**
 * npm run eval:live [-- --dry-run] [--model scripted|http] [--reps N] [--arms gated,ungated] [--no-follow]
 *
 * A live run (the default, --model http) needs, in the environment:
 *   EVAL_MODEL_BASE_URL   an OpenAI-compatible chat-completions base URL
 *   EVAL_MODEL            the model name (must be priced in eval/live/prices.json)
 *   EVAL_MODEL_API_KEY    the key (sent only as the bearer token; never written anywhere)
 *   EVAL_SPEND_CAP_USD    the hard cap; the run refuses to start without one
 * Without any of these the run refuses to start and says which is missing. No
 * paid call is made before every one of them is present. --dry-run prints what
 * would run and makes no call. --model scripted runs the deterministic stand-in.
 */

import { loadAttacks } from './attacks';
import { loadTask } from './task';
import { ARMS, runEval, buildRulebooks, type Arm } from './arms';
import { SpendCap, loadPrices, priceFor } from './cap';
import { httpModel, scriptedModel, type ModelFactory } from './model';
import { writeReport, engineCommit, type ReportConfig } from './report';

export interface LiveConfig { baseUrl: string; model: string; apiKey: string; capUsd: number }

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
  return { ok: true, config: { baseUrl, model, apiKey, capUsd } };
}

function parseArgs(argv: string[]) {
  const opts = { dryRun: false, model: 'http' as 'http' | 'scripted', reps: 1, arms: ARMS as Arm[], follow: true };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--dry-run') opts.dryRun = true;
    else if (a === '--model') opts.model = argv[++i] === 'scripted' ? 'scripted' : 'http';
    else if (a === '--reps') opts.reps = Math.max(1, Number(argv[++i]) || 1);
    else if (a === '--arms') opts.arms = argv[++i].split(',').filter((x): x is Arm => x === 'gated' || x === 'ungated');
    else if (a === '--no-follow') opts.follow = false;
    else throw new Error(`unknown argument ${a}`);
  }
  return opts;
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const task = loadTask();
  const { attacks, hash } = loadAttacks();
  const rb = buildRulebooks();
  const date = new Date().toISOString().slice(0, 10);
  const live = opts.model === 'http' ? prepareLiveRun(process.env) : null;

  console.log(`live adversarial evaluation — task ${task.id}, ${attacks.length} attacks (hash ${hash.slice(0, 16)}…), arms ${opts.arms.join(', ')}, reps ${opts.reps}`);
  console.log(`engine ${engineCommit().slice(0, 7)}; rulebook ${rb.base.fingerprint.slice(0, 16)}…, mission ${rb.mission.fingerprint.slice(0, 16)}…`);
  for (const a of attacks) console.log(`  ${a.id.padEnd(36)} ${a.planted ? `planted in ${a.planted.where}` : 'control'}${a.expectedRule ? `; expected to stop: ${a.expectedRule}` : ''}`);

  if (opts.dryRun) {
    console.log(`\ndry run: no call made. Model: ${opts.model}${opts.model === 'http' ? ` (${live!.ok ? `live run could start: model ${live!.config.model}, cap ${live!.config.capUsd} USD` : `live run would be refused: ${live!.reason}`})` : ' (deterministic stand-in)'}.`);
    console.log(`would run ${attacks.length * opts.arms.length * opts.reps} cases (${attacks.length} attacks × ${opts.arms.length} arms × ${opts.reps} reps), at most ${task.phases.reduce((s, p) => s + p.script.length, 0) + Math.max(...attacks.map(a => a.scripted?.calls.length ?? 0)) + task.phases.length} model turns each for the stand-in.`);
    return;
  }

  let factory: ModelFactory, cap: SpendCap | null = null, config: ReportConfig;
  if (opts.model === 'scripted') {
    factory = scriptedModel({ follow: opts.follow });
    config = { model: 'scripted', date, arms: opts.arms, reps: opts.reps, capUsd: null, follow: opts.follow };
  } else {
    if (!live!.ok) { console.error(`\nrefused: ${live!.reason}`); process.exit(2); }
    const c = live!.config;
    cap = new SpendCap(c.capUsd, priceFor(loadPrices(), c.model), c.model);
    factory = httpModel({ baseUrl: c.baseUrl, model: c.model, apiKey: c.apiKey });
    config = { model: c.model, date, arms: opts.arms, reps: opts.reps, capUsd: c.capUsd, baseUrl: c.baseUrl };
    console.log(`\nlive run: model ${c.model} at ${c.baseUrl}, cap ${c.capUsd} USD (enforced before every call)`);
  }
  const run = await runEval(factory, { cap, arms: opts.arms, reps: opts.reps, task, attacks, attackSetHash: hash, onCase: r => console.log(`  ${r.arm.padEnd(7)} ${r.attack.padEnd(36)} task ${r.taskCompleted ? 'done' : 'NOT done'}; forbidden attempted ${r.forbiddenAttempted}, performed ${r.forbiddenPerformed.length}; incorrect refusals ${r.incorrectRefusals.length}${r.stoppedBy.length ? `; stopped by ${r.stoppedBy.join(',')}` : ''}${r.skipped ? `; skipped: ${r.skipped}` : ''}`) });
  const { jsonPath, mdPath } = writeReport(run, config, cap);
  console.log(`\nreport: ${mdPath}\n        ${jsonPath}${run.stopped ? `\nstopped: ${run.stopped.reason}` : ''}${cap ? `\nspent ${cap.spentUsd.toFixed(4)} USD over ${cap.calls} calls` : ''}`);
}

const invokedDirectly = process.argv[1] && /[\\/]eval[\\/]live[\\/]run\.ts$/.test(process.argv[1]);
if (invokedDirectly) main().catch(e => { console.error(e instanceof Error ? e.stack ?? e.message : String(e)); process.exit(1); });

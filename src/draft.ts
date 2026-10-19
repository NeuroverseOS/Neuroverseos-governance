/**
 * Drafting rules from plain words — deterministic, and optionally with the
 * caller's own model.
 *
 *   draftRuleFromText(text, rulebook, { setBy })   pattern-matches common forms
 *                                                 against the rulebook's own vocabulary
 *   buildRuleDraftPrompt(text, rulebook)           a prompt for the caller's model
 *   parseRuleDraft(json, rulebook, { setBy })      validates a model's JSON answer
 *
 * The deterministic drafter is a convenience for simple forms ("no X in Y",
 * "X may Y", "slow to N m/s in Z", "wait for A approval", "wait while F",
 * "max N <participants>"). It refuses to guess: a bare number next to a
 * participant noun is a count, never a speed; a speed needs a unit or a speed
 * word; a count becomes a rule on ENTERING the area only (the robots already
 * inside must be able to leave); an exception word ("unless", "except",
 * "but"), a comparison it did not turn into a limit ("faster than", "more
 * than" with nothing to count), a "while"/"until" it could not read as a
 * condition, or a "no ..." whose verb it could not match to a declared action
 * produces NO draft at all — never a rule that denies everything. A verb it
 * does not model makes the draft not a `confidentDraft`. For a real editor,
 * use the model path (buildRuleDraftPrompt + parseRuleDraft): the model
 * proposes structured JSON and the validator refuses anything the site did
 * not declare — and a person reads the draft, its notes and its unmatched
 * words before confirming it.
 *
 * Both paths PROPOSE a rule. The authority that sets it (`setBy`) comes from
 * the caller — the authority the space granted the author, whether a person,
 * a system or an agent — never from the text and never from the model's
 * answer. A draft whose author holds a declared authority and that the
 * drafter is confident in (`confidentDraft`) can go into the rulebook after
 * a person reads it; a draft with no `setBy` needs someone who holds one to
 * confirm it. No network calls happen here.
 */

import type { Condition, FactValue, Outcome, Rule, Rulebook, Selector } from './types';
import { DAYS } from './types';
import { DomainRulesError, isValidTime, vocabularyOf, type Vocabulary } from './vocabulary';
import { validateRule, clone } from './compile';
import { rulebookVersionProblem } from './version';

export interface RuleDraft {
  /** The proposed rule, or null when the text could not be turned into one. */
  draft: Rule | null;
  /** 0..1. Below about 0.6 the operator should read the draft carefully. */
  confidence: number;
  /** Words in the text the drafter could not account for. */
  unmatched: string[];
  /** What the drafter assumed or could not do, in plain words. */
  notes: string[];
  /**
   * True when the draft is a valid rule with a declared authority, every word of the text was placed or is a stop word
   * (nothing unmatched), no verb the drafter cannot model appears, and confidence is at least 0.6. It is the drafter's
   * confidence in its own reading — not a statement that the rule is safe to add. Read the draft before confirming it.
   */
  confidentDraft: boolean;
  /** @deprecated 0.5.2 name of `confidentDraft`; the same value. Removed in 0.6. */
  ready: boolean;
}

export interface DraftOptions {
  /** The authority that will set the rule: the level the space granted the author. Without it the draft is never a `confidentDraft`. */
  setBy?: string;
  /** Rule ID. Defaults to a slug of the text. */
  id?: string;
  /** Who is drafting: `text` (default, a person's words), `agent` (an AI agent) or `system`. Recorded in `source.kind`. */
  source?: 'text' | 'agent' | 'system';
  /** For `agent` and `system` sources: the author's ID, recorded in `source.ref` alongside the text. */
  author?: string;
}

function sourceOf(options: DraftOptions, text: string): Rule['source'] {
  const kind = options.source ?? 'text';
  return { kind, ref: kind === 'text' || !options.author ? text : `${options.author}: ${text}` };
}

// ─── Deterministic drafting ──────────────────────────────────────────────────

const STOP = new Set(['the', 'a', 'an', 'in', 'on', 'at', 'to', 'of', 'for', 'into', 'their', 'its', 'from', 'and', 'is', 'are', 'be', 'with', 'while', 'when', 'if', 'during', 'any', 'all', 'every', 'by', 'please', 'must', 'should', 'they', 'it', 'that', 'this', 'there', 'here', 'area', 'areas', 'zone', 'zones', 'room', 'rooms', 'each', 'time', 'times', 'ever', 'only', 'unless', 'than', 'or', 'as', 'do', 'does', 'may', 'can', 'get', 'go']);
const KIND_WORDS: Record<string, string[]> = {
  person: ['people', 'person', 'persons', 'humans', 'human', 'wearers', 'wearer', 'everyone', 'anyone', 'anybody', 'everybody'],
  robot: ['robots', 'robot', 'bots', 'bot', 'machines', 'machine'],
};
const DAY_WORDS: Record<string, string[]> = {
  mon: ['monday', 'mondays', 'mon'], tue: ['tuesday', 'tuesdays', 'tue', 'tues'], wed: ['wednesday', 'wednesdays', 'wed'],
  thu: ['thursday', 'thursdays', 'thu', 'thurs'], fri: ['friday', 'fridays', 'fri'], sat: ['saturday', 'saturdays', 'sat'], sun: ['sunday', 'sundays', 'sun'],
};

interface Tok { raw: string; norm: string; used: boolean }

/** Verbs the drafter does not model. A rule about them needs an action the site declares (or the model path); the draft is never a `confidentDraft`. */
const UNMODELLED_VERBS = new Set(['block', 'blocks', 'blocking', 'blocked', 'obstruct', 'obstructs', 'obstructing', 'loiter', 'loitering', 'linger', 'lingering', 'crowd', 'crowding', 'queue', 'queuing', 'tailgate', 'tailgating', 'follow', 'following', 'approach', 'approaching', 'idle', 'idling', 'park', 'parking', 'touch', 'touching', 'push', 'pushing', 'carry', 'carrying', 'lift', 'lifting']);
const SPEED_WORDS = new Set(['slow', 'slower', 'speed', 'fast', 'faster', 'velocity', 'mps', 'm/s', 'km/h', 'kph', 'mph']);
/** Words that carve an exception out of a rule. The drafter cannot express one, so it drafts nothing rather than the rule without it. */
const EXCEPTION_WORDS = new Set(['unless', 'except', 'excepting', 'but', 'besides', 'apart', 'other']);
/** Comparatives: a limit when a unit or a count fact makes sense of them, and otherwise a comparison the drafter does not model. */
const COMPARATIVES = new Set(['faster', 'slower', 'quicker', 'more', 'less', 'fewer', 'higher', 'lower', 'heavier', 'lighter', 'louder', 'quieter', 'closer', 'nearer', 'further', 'farther', 'longer', 'shorter', 'bigger', 'smaller', 'larger', 'greater']);

export function draftRuleFromText(text: string, rulebook: Rulebook, options: DraftOptions = {}): RuleDraft {
  domainOnly('draftRuleFromText', rulebook);
  const vocab = vocabularyOf(rulebook);
  const notes: string[] = [];
  const toks = tokenize(text);
  const use = (i: number, n = 1) => { for (let k = i; k < i + n; k++) toks[k].used = true; };
  const refuse = (why: string): RuleDraft => ({ draft: null, confidence: 0, unmatched: leftovers(toks), notes: [...notes, why, 'Not drafted: the drafter refuses to guess. For anything beyond the simple forms, use buildRuleDraftPrompt with your own model and parseRuleDraft to validate its answer.'], confidentDraft: false, ready: false });
  // An exception ("unless there is an emergency", "except staff") changes what the rule means; the drafter cannot carry it, so it drafts nothing.
  const exception = toks.find(t => EXCEPTION_WORDS.has(t.norm));
  if (exception) return refuse(`"${exception.raw}" carves an exception out of the rule, which the drafter cannot express; a draft without it would say more than the text does.`);
  const timeFact = rulebook.facts.find(f => f.type === 'time' && (f.required || f.default !== undefined));
  const dayFact = rulebook.facts.find(f => f.type === 'day' && (f.required || f.default !== undefined));
  const when: Condition[] = [];
  let confidence = 1;

  // Time windows and bounds.
  for (let i = 0; i < toks.length; i++) {
    const t = toks[i].norm;
    if ((t === 'between' || t === 'from') && isTime(toks[i + 1]?.norm) && (toks[i + 2]?.norm === 'and' || toks[i + 2]?.norm === 'to') && isTime(toks[i + 3]?.norm)) {
      if (timeFact) when.push({ fact: timeFact.id, op: 'between', from: padTime(toks[i + 1].norm), to: padTime(toks[i + 3].norm) });
      else notes.push('A time window was written but no required time fact is declared; add one (type "time").');
      use(i, 4);
    } else if ((t === 'after' || t === 'before') && isTime(toks[i + 1]?.norm)) {
      if (timeFact) when.push({ fact: timeFact.id, op: t === 'after' ? '>=' : '<', value: padTime(toks[i + 1].norm) });
      else notes.push('A time was written but no required time fact is declared; add one (type "time").');
      use(i, 2);
    }
  }
  // Days.
  const days = new Set<string>();
  for (let i = 0; i < toks.length; i++) {
    const t = toks[i].norm;
    if (toks[i].used) continue;
    const d = Object.entries(DAY_WORDS).find(([, ws]) => ws.includes(t))?.[0];
    if (d) { days.add(d); use(i); if (toks[i - 1]?.norm === 'on') use(i - 1); }
    else if (t === 'weekends' || t === 'weekend') { days.add('sat'); days.add('sun'); use(i); if (toks[i - 1]?.norm === 'on' || toks[i - 1]?.norm === 'at') use(i - 1); }
    else if (t === 'weekdays' || t === 'weekday') { for (const d2 of ['mon', 'tue', 'wed', 'thu', 'fri']) days.add(d2); use(i); if (toks[i - 1]?.norm === 'on') use(i - 1); }
  }
  if (days.size) {
    if (dayFact) when.push({ fact: dayFact.id, op: 'days', days: DAYS.filter(d => days.has(d)) });
    else notes.push('Days were written but no required day fact is declared; add one (type "day").');
  }

  // Limits and counts: "slow to 0.3 m/s", "at most 1 m/s", "no faster than 0.5 m/s" are limits; "max 2 robots" is a COUNT.
  // A bare number next to a participant noun is a count, never a speed; a speed needs a unit or a speed word.
  let then: Outcome | null = null;
  let doesFromLimit: Selector | undefined;
  let notReady: string | null = null;
  const participantNoun = (t: string | undefined): boolean => {
    if (!t) return false;
    const st = stem(t);
    if (Object.values(KIND_WORDS).some(ws => ws.map(stem).includes(st)) || [...vocab.kinds].some(k => stem(k) === st)) return true;
    return [...vocab.roles.values()].some(r => [r.id, r.name, ...(r.synonyms ?? [])].some(x => x.split(/[\s_-]+/).map(stem).pop() === st));
  };
  for (let i = 0; i < toks.length && !then && !notReady; i++) {
    const w = (k: number) => toks[i + k]?.norm;
    const neg = (k: number) => w(k) === 'no' || w(k) === 'not' || w(k) === 'never';
    const forms: Array<[number, boolean, boolean]> = [[1, w(0) === 'max' || w(0) === 'maximum', false], [2, (w(0) === 'slow' && w(1) === 'to'), true], [2, (w(0) === 'at' && w(1) === 'most') || (w(0) === 'up' && w(1) === 'to') || (w(0) === 'limited' && w(1) === 'to') || (w(0) === 'limit' && w(1) === 'to'), false], [3, neg(0) && w(1) === 'faster' && w(2) === 'than', true], [4, neg(0) && !!w(1) && w(2) === 'faster' && w(3) === 'than', true], [3, neg(0) && w(1) === 'more' && w(2) === 'than', false], [4, neg(0) && !!w(1) && w(2) === 'more' && w(3) === 'than', false]];
    for (const [len, ok, speedForm] of forms) {
      if (!ok || !isNumber(w(len))) continue;
      const value = Number(w(len));
      const unitTok = toks[i + len + 1]?.norm;
      const byUnit = rulebook.limits.find(l => l.unit && unitTok && l.unit.toLowerCase() === unitTok);
      const looksLikeUnit = !!unitTok && /^[a-z]+\/[a-z]+$|^(mph|kph|kg|lb|lbs|cm|mm|km|m|s|ms|min|h|hz|db|%)$/.test(unitTok);
      const phrase = toks.slice(i, i + len + 1 + (looksLikeUnit ? 1 : 0)).map(t => t.raw).join(' ');
      if (!byUnit && !looksLikeUnit && participantNoun(unitTok)) {
        // A count: "max 2 robots". Map it to a declared count fact (a number fact whose name or synonyms name the thing counted), or refuse to guess.
        const st = stem(unitTok!);
        const countFacts = rulebook.facts.filter(f => f.type === 'number' && (f.required || f.default !== undefined) && [f.id, ...(f.synonyms ?? [])].some(x => x.replace(/([a-z])([A-Z])/g, '$1 $2').split(/[\s_-]+/).map(stem).includes(st)));
        const countFact = countFacts.find(f => [f.id, ...(f.synonyms ?? [])].some(x => /zone|area|aisle|room|present|near/i.test(x))) ?? countFacts[0];
        if (!countFact) { notReady = `"${phrase} ${unitTok}" is a count of ${unitTok}, not a speed or any declared limit; the rulebook declares no number fact that counts ${unitTok} (declare one, for example a required "${st}sInZone" fact that the spatial system reports, then this reads as "wait while ${st}sInZone >= ${value}").`; break; }
        // A cap on how many may be in an area binds ENTERING it: the actions that move the participant there. Those already inside must be able to act and leave.
        const entering = [...vocab.actions.values()].filter(a => a.effects?.some(e => e.op === 'move')).map(a => a.id);
        const movement = entering.length ? entering : [...vocab.actions.values()].filter(a => a.tags?.includes('movement')).map(a => a.id);
        if (!movement.length) { notReady = `"${phrase} ${unitTok}" caps how many may be in an area, which binds the action that enters it; the rulebook declares no action with a move effect (or tagged "movement"), so the drafter cannot say which action to bind without binding every action, including leaving.`; break; }
        then = { answer: 'wait', for: 'condition' };
        when.push({ fact: countFact.id, op: '>=', value });
        doesFromLimit = movement;
        notes.push(`"${phrase} ${unitTok}" was read as a count on the fact "${countFact.id}": entering (${movement.join(', ')}) waits while ${countFact.id} >= ${value}; other actions, including leaving, are not bound. Check that this is the fact your spatial system reports for ${unitTok} already present.`);
        confidence -= 0.2;
        use(i, len + 1);
        break;
      }
      const speedWordPresent = speedForm || toks.some(t => SPEED_WORDS.has(t.norm));
      const limit = byUnit
        ?? (looksLikeUnit ? undefined : rulebook.limits.find(l => (l.synonyms ?? []).some(s => toks.some(t => !t.used && t.norm === norm(s)))))
        ?? (looksLikeUnit || !speedWordPresent ? undefined : rulebook.limits.length === 1 ? rulebook.limits[0] : undefined);
      if (!limit) {
        if (looksLikeUnit || speedWordPresent) notes.push(`"${phrase}" looks like a limit, but the rulebook declares no matching limit${looksLikeUnit ? ` (units: ${rulebook.limits.map(l => l.unit).filter(Boolean).join(', ') || 'none'})` : ''}.`);
        else notReady = `"${phrase}" is a bare number: without a unit (${rulebook.limits.map(l => l.unit).filter(Boolean).join(', ') || 'none declared'}) or a speed word it is not read as a limit, and nothing it could count was recognised.`;
        break;
      }
      then = { answer: 'limit', limits: { [limit.id]: value } };
      doesFromLimit = limit.appliesTo;
      use(i, len + 1 + (unitTok && limit.unit && limit.unit.toLowerCase() === unitTok ? 1 : 0));
      if (w(0) === 'slow' && toks[i - 1]?.norm === 'down') use(i - 1);
      break;
    }
  }
  if (notReady) return refuse(notReady);
  // A comparison the limit phase did not turn into a limit ("faster than the staff", "more than before") is not modelled.
  const comparative = toks.findIndex((t, i) => !t.used && COMPARATIVES.has(t.norm) && toks[i + 1]?.norm === 'than');
  if (comparative >= 0) return refuse(`"${toks[comparative].raw} than" is a comparison the drafter did not turn into a declared limit (a limit needs a number with a unit the rulebook declares, or a count of a declared count fact); a draft without it would not say what the text says.`);
  // Approval: "wait for X approval", "with X approval", "need(s) X approval", "approved by X", "ask X first/before".
  let by: string | undefined;
  for (let i = 0; i < toks.length && !then; i++) {
    const t = toks[i].norm;
    const idx = (t === 'approval' || t === 'approve' || t === 'approved' || t === 'permission') ? i : -1;
    if (idx < 0) continue;
    then = { answer: 'wait', for: 'approval' };
    use(idx);
    // Who approves: the phrase right before "approval", or right after "approved by".
    const before = [idx - 2, idx - 1].filter(k => k >= 0 && !toks[k].used);
    const after = t === 'approved' && toks[idx + 1]?.norm === 'by' ? [idx + 2, idx + 3].filter(k => k < toks.length) : [];
    const span = after.length ? after : before;
    const found = matchApprover(toks, span, vocab);
    if (found) { by = found.ref; for (const k of found.used) use(k); }
    for (const k of [idx - 1, idx - 2, idx - 3]) if (k >= 0 && ['for', 'with', 'wait', 'waits', 'need', 'needs', 'require', 'requires', 'a', 'an', 'the', "person's", 'persons'].includes(toks[k].norm) && !toks[k].used) use(k);
    if (after.length && toks[idx + 1]) use(idx + 1);
    if (!found && span.some(k => toks[k] && !toks[k].used && !STOP.has(toks[k].norm))) notes.push('Could not tell who must approve; the draft accepts any approval. Set then.by to an authority, role or tag:<role tag>.');
  }
  // Wait for a condition: "wait while <condition>" / "wait until <condition>" (until = while the opposite holds).
  for (let i = 0; i < toks.length && !then; i++) {
    if ((toks[i].norm === 'wait' || toks[i].norm === 'waits') && (toks[i + 1]?.norm === 'while' || toks[i + 1]?.norm === 'until')) {
      then = { answer: 'wait', for: 'condition' };
      const until = toks[i + 1].norm === 'until';
      use(i, 2);
      const cond = matchCondition(toks, i + 2, rulebook, vocab);
      if (!cond) { notes.push(`"wait ${toks[i + 1].norm} ..." needs a condition on a declared fact (for example "while people are present"); none was recognised.`); confidence -= 0.3; break; }
      for (const k of cond.used) use(k);
      const c = until ? negate(cond.condition) : cond.condition;
      if (!c) { notes.push(`Could not express the opposite of "${toks.slice(i + 2, i + 2 + cond.used.length).map(t => t.raw).join(' ')}"; write it as "wait while ...".`); confidence -= 0.3; break; }
      when.push(c);
    }
  }
  // Conditions on facts: "when/while/if <fact> ...". Read before deny/allow so a "not" inside a condition is not read as a deny.
  for (let i = 0; i < toks.length; i++) {
    if (!['when', 'while', 'if', 'whenever'].includes(toks[i].norm) || toks[i].used) continue;
    const cond = matchCondition(toks, i + 1, rulebook, vocab);
    if (cond) { when.push(cond.condition); use(i); for (const k of cond.used) use(k); }
  }

  // Deny / allow.
  const NEG = ['no', 'not', 'never', "can't", 'cannot', "don't", "mustn't", 'forbidden', 'prohibited', 'banned', 'nobody'];
  const POS = ['may', 'can', 'allowed', 'permitted', 'ok', 'okay', 'let', 'free'];
  if (!then) {
    const neg = toks.findIndex(t => !t.used && NEG.includes(t.norm));
    if (neg >= 0) {
      then = { answer: 'deny' };
      use(neg);
      if (toks[neg - 1]?.norm === 'may' || toks[neg - 1]?.norm === 'must' || toks[neg - 1]?.norm === 'do' || toks[neg - 1]?.norm === 'are') use(neg - 1);
    } else {
      const pos = toks.findIndex(t => !t.used && POS.includes(t.norm));
      if (pos >= 0) { then = { answer: 'allow' }; use(pos); }
    }
  }
  if (!then) return refuse('Could not find what the rule decides. Say "no ...", "... may ...", "... wait for ... approval", "wait while ...", or "at most N <unit>".');
  // A "while"/"until" that was not read as a condition on a declared fact is a condition the drafter cannot express.
  const dangling = toks.find(t => !t.used && (t.norm === 'while' || t.norm === 'until' || t.norm === 'whenever'));
  if (dangling) return refuse(`"${dangling.raw} ..." is a condition the drafter could not read as one on a declared fact (${[...vocab.facts.values()].filter(f => f.required || f.default !== undefined).map(f => f.id).join(', ') || 'none declared'}); a draft without it would apply always.`);

  // Who, does, where — by the rulebook's own names and synonyms, longest phrase first across all three.
  const sel = matchSelectors(toks, vocab, use, doesFromLimit === undefined);
  const who = sel.who;
  const does = doesFromLimit !== undefined ? clone(doesFromLimit) : sel.does;
  const where = sel.where;

  let whoSel: Selector, doesSel: Selector, whereSel: Selector;
  if (who.length) whoSel = who; else { whoSel = '*'; confidence -= 0.3; notes.push('No role, kind or tag was recognised; the draft applies to anyone.'); }
  const unmatched = leftovers(toks);
  if (Array.isArray(does) ? does.length : does) doesSel = does;
  else if (unmatched.length) {
    // "No scanning", "no dancing": the text names something specific that is not a declared action. A rule on every action would say far more than the text.
    const verbs = unmatched.filter(w => UNMODELLED_VERBS.has(norm(w)));
    const verbNote = verbs.length ? `"${verbs.join('", "')}" is a verb the drafter does not model: it knows allow, deny, limit, wait and the actions the site declares. ` : '';
    return refuse(`${verbNote}No declared action matches "${unmatched.join(' ')}" (declared: ${[...vocab.actions.keys()].join(', ')}). A draft on every action would ${then.answer === 'deny' ? 'forbid everything' : 'bind everything'}, which is not what the text says; declare the action, or use the model path.`);
  } else if (then.answer === 'deny') { doesSel = '*'; notes.push('No action was recognised; "no ..." was read as: no action at all.'); } else { doesSel = '*'; confidence -= 0.3; notes.push('No action was recognised; the draft applies to every action. Name one.'); }
  if (where.length) whereSel = where; else { whereSel = '*'; notes.push('No area was recognised; the draft applies everywhere.'); }

  const unmodelled = unmatched.filter(w => UNMODELLED_VERBS.has(norm(w)));
  if (unmodelled.length) { notes.push(`"${unmodelled.join('", "')}" is a verb the drafter does not model: it knows allow, deny, limit, wait and the actions the site declares (${[...vocab.actions.keys()].join(', ')}). Declare an action for it, or use the model path (buildRuleDraftPrompt / parseRuleDraft).`); confidence -= 0.5; }
  confidence = Math.max(0, Math.min(1, confidence - 0.1 * unmatched.length));
  const draft: Rule = {
    id: options.id ?? slug(text),
    text,
    who: whoSel, does: doesSel, where: whereSel,
    ...(when.length ? { when } : {}),
    then: by ? { ...then, by } as Outcome : then,
    source: sourceOf(options, text),
    setBy: options.setBy ?? '',
  };
  if (!options.setBy) notes.push('Say who sets this rule (setBy) before confirming it: the authority the space granted the author.');
  else {
    try { validateRule(draft, vocab); } catch (e) { return { draft: null, confidence: 0, unmatched, notes: [...notes, (e as Error).message], confidentDraft: false, ready: false }; }
  }
  // A confident draft: a valid rule, a declared authority, every word placed, no verb the drafter cannot model, confidence of at least 0.6.
  // Below that the draft is shown with its notes, never added as it is. Either way a person reads it before it goes in.
  const confidentDraft = !!options.setBy && unmodelled.length === 0 && unmatched.length === 0 && confidence >= 0.6;
  if (!!options.setBy && !confidentDraft) notes.push('Not a confident draft: read the draft, the notes and the unmatched words above; confirm it only after fixing the text or the draft, or use the model path.');
  return { draft, confidence, unmatched, notes, confidentDraft, ready: confidentDraft };
}

// ─── Matching helpers ────────────────────────────────────────────────────────

/** The opposite of a simple condition, where it can be written exactly; null otherwise. */
function negate(c: Condition): Condition | null {
  switch (c.op) {
    case '==': return { fact: c.fact, op: '!=', value: c.value };
    case '!=': return { fact: c.fact, op: '==', value: c.value };
    case '>': return { fact: c.fact, op: '<=', value: c.value };
    case '>=': return { fact: c.fact, op: '<', value: c.value };
    case '<': return { fact: c.fact, op: '>=', value: c.value };
    case '<=': return { fact: c.fact, op: '>', value: c.value };
    default: return null;
  }
}

function tokenize(text: string): Tok[] {
  return text
    .replace(/[“”"()\[\],;!?]/g, ' ')
    .replace(/(\d)\s*m\/s/gi, '$1 m/s')
    .split(/\s+/)
    .filter(Boolean)
    .map(raw => ({ raw, norm: norm(raw), used: false }));
}

function norm(w: string): string {
  const x = w.toLowerCase().replace(/\.$/, '').replace(/^'|'$/g, '');
  return x;
}

/** Singular, lowercase, hyphens and underscores as spaces. */
function stem(w: string): string {
  let x = w.toLowerCase().replace(/[-_]/g, ' ');
  if (x.length > 3 && x.endsWith('ies')) x = `${x.slice(0, -3)}y`;
  else if (x.length > 3 && x.endsWith('s') && !x.endsWith('ss')) x = x.slice(0, -1);
  return x;
}

function isTime(t: string | undefined): boolean {
  return !!t && /^\d{1,2}:\d{2}$/.test(t) && isValidTime(padTime(t));
}
function padTime(t: string): string { return t.length === 4 ? `0${t}` : t; }
function isNumber(t: string | undefined): boolean { return !!t && /^\d+(\.\d+)?$/.test(t); }

function leftovers(toks: Tok[]): string[] {
  return toks.filter(t => !t.used && !STOP.has(t.norm)).map(t => t.raw);
}

function slug(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 48) || 'rule';
}

interface Phrase { words: string[]; ref: string }

function phrasesFor(kind: 'who' | 'does' | 'where', vocab: Vocabulary): Phrase[] {
  const out: Phrase[] = [];
  const add = (ref: string, ...texts: (string | undefined)[]) => { for (const t of texts) if (t) out.push({ words: t.split(/[\s_-]+/).map(stem).filter(Boolean), ref }); };
  if (kind === 'who') {
    for (const r of vocab.roles.values()) add(r.id, r.id, r.name, ...(r.synonyms ?? []));
    for (const k of vocab.kinds) add(`kind:${k}`, k, ...(KIND_WORDS[k] ?? []));
    for (const t of vocab.tags.roles) if (!vocab.roles.has(t)) add(`tag:${t}`, t);
    add('*', 'everyone', 'anyone', 'anybody', 'everybody', 'everything');
  } else if (kind === 'does') {
    for (const a of vocab.actions.values()) add(a.id, a.id, a.name, ...(a.synonyms ?? []));
    for (const t of vocab.tags.actions) add(`tag:${t}`, t);
  } else {
    for (const a of vocab.areas.values()) add(a.id, a.id, a.name, ...(a.synonyms ?? []));
    for (const t of vocab.tags.areas) add(`tag:${t}`, `${t} areas`, `${t} area`, `${t} zones`, `${t} zone`, `${t} rooms`, t);
    add('*', 'everywhere', 'anywhere');
  }
  return out.sort((a, b) => b.words.length - a.words.length);
}

function matchSelectors(toks: Tok[], vocab: Vocabulary, use: (i: number, n?: number) => void, matchActions: boolean): { who: string[]; does: string[]; where: string[] } {
  const kinds: Array<'who' | 'does' | 'where'> = matchActions ? ['who', 'does', 'where'] : ['who', 'where'];
  const phrases = kinds.flatMap(kind => phrasesFor(kind, vocab).map(p => ({ ...p, kind })));
  phrases.sort((a, b) => b.words.length - a.words.length);
  const found = { who: [] as string[], does: [] as string[], where: [] as string[] };
  for (const p of phrases) {
    for (let i = 0; i + p.words.length <= toks.length; i++) {
      if (!p.words.every((w, k) => !toks[i + k].used && stem(toks[i + k].norm) === w)) continue;
      if (!found[p.kind].includes(p.ref)) found[p.kind].push(p.ref);
      use(i, p.words.length);
      // "in the X" / "the X": consume the article and preposition before an area.
      if (p.kind === 'where' && toks[i - 1]?.norm === 'the' && !toks[i - 1].used) { use(i - 1); if (['in', 'at', 'into', 'inside', 'near'].includes(toks[i - 2]?.norm ?? '') && !toks[i - 2].used) use(i - 2); }
      else if (p.kind === 'where' && ['in', 'at', 'into', 'inside'].includes(toks[i - 1]?.norm ?? '') && !toks[i - 1].used) use(i - 1);
    }
  }
  for (const k of kinds) if (found[k].includes('*')) found[k] = ['*'];
  return found;
}

function matchApprover(toks: Tok[], span: number[], vocab: Vocabulary): { ref: string; used: number[] } | null {
  for (const k of span) {
    const t = toks[k];
    if (!t || t.used) continue;
    const s = stem(t.norm);
    const tag = [...vocab.tags.roles].find(x => stem(x) === s);
    if (tag) return { ref: `tag:${tag}`, used: [k] };
    const role = [...vocab.roles.values()].find(r => stem(r.id) === s || stem(r.name) === s || (r.synonyms ?? []).some(y => stem(y) === s));
    if (role) return { ref: role.id, used: [k] };
    const auth = vocab.authorities.find(a => stem(a.id) === s || stem(a.name ?? '') === s || (a.name ?? '').toLowerCase().split(/\s+/).map(stem).pop() === s);
    if (auth) return { ref: auth.id, used: [k] };
  }
  return null;
}

function matchCondition(toks: Tok[], start: number, rulebook: Rulebook, vocab: Vocabulary): { condition: Condition; used: number[] } | null {
  const facts = rulebook.facts.filter(f => f.required || f.default !== undefined);
  const phrases: Array<{ words: string[]; fact: typeof facts[number] }> = [];
  for (const f of facts) for (const t of [f.id, ...(f.synonyms ?? [])]) phrases.push({ words: t.replace(/([a-z])([A-Z])/g, '$1 $2').split(/[\s_-]+/).map(stem), fact: f });
  phrases.sort((a, b) => b.words.length - a.words.length);
  let negated = false;
  let i = start;
  const used: number[] = [];
  if (toks[i]?.norm === 'no' || toks[i]?.norm === 'not') { negated = true; used.push(i); i++; }
  if (toks[i]?.norm === 'the' || toks[i]?.norm === 'a') { used.push(i); i++; }
  const hit = phrases.find(p => p.words.every((w, k) => toks[i + k] && !toks[i + k].used && stem(toks[i + k].norm) === w));
  if (!hit) return null;
  for (let k = 0; k < hit.words.length; k++) used.push(i + k);
  i += hit.words.length;
  const f = hit.fact;
  const w = (k: number) => toks[i + k]?.norm;
  const skip = (n: number) => { for (let k = 0; k < n; k++) used.push(i + k); i += n; };
  if (['is', 'are', 'be'].includes(w(0) ?? '')) skip(1);
  if (f.type === 'boolean') {
    if (w(0) === 'not' || w(0) === 'false' || w(0) === 'off') { skip(1); negated = !negated; }
    else if (w(0) === 'true' || w(0) === 'on' || w(0) === 'active') skip(1);
    return { condition: { fact: f.id, op: '==', value: !negated }, used };
  }
  if (f.type === 'number') {
    if (negated) return { condition: { fact: f.id, op: '==', value: 0 }, used };
    if (w(0) === 'present' || w(0) === 'around' || w(0) === 'nearby') { skip(1); return { condition: { fact: f.id, op: '>', value: 0 }, used }; }
    const ops: Array<[string[], Condition['op']]> = [[['over', 'above', 'more', 'exceeds', '>'], '>'], [['under', 'below', 'fewer', 'less', '<'], '<'], [['at', 'least'], '>='], [['at', 'most'], '<='], [['>='], '>='], [['<='], '<='], [['==', '=', 'equals', 'exactly'], '==']];
    for (const [words, op] of ops) {
      const seq = words.length === 2 ? [w(0), w(1)] : [w(0)];
      if (words.length === 2 ? seq[0] === words[0] && seq[1] === words[1] : words.includes(seq[0] ?? '')) {
        skip(words.length);
        if (w(0) === 'than') skip(1);
        if (!isNumber(w(0))) return null;
        const value = Number(w(0)); skip(1);
        return { condition: { fact: f.id, op: op as '>' | '<' | '>=' | '<=' | '==', value }, used };
      }
    }
    if (isNumber(w(0))) { const value = Number(w(0)); skip(1); return { condition: { fact: f.id, op: '==', value }, used }; }
    return null;
  }
  if (f.type === 'enum' || f.type === 'string' || f.type === 'day') {
    const v = w(0);
    if (!v) return null;
    const value: FactValue = f.type === 'enum' ? (f.values ?? []).find(x => stem(x) === stem(v)) ?? v : v;
    skip(1);
    return { condition: { fact: f.id, op: negated ? '!=' : '==', value }, used };
  }
  return null;
}

// ─── Drafting with the operator's own model ──────────────────────────────────

/** A prompt the operator sends to their own model. The answer is validated by `parseRuleDraft`. No network call here. */
export function buildRuleDraftPrompt(text: string, rulebook: Rulebook): string {
  domainOnly('buildRuleDraftPrompt', rulebook);
  const list = <T>(xs: T[], f: (x: T) => string) => xs.length ? xs.map(x => `  - ${f(x)}`).join('\n') : '  (none)';
  return [
    'You turn one plain-language rule for a physical site into one JSON rule. Use ONLY the vocabulary below. Do not invent roles, actions, areas, facts, limits or tags.',
    '',
    `Site: ${rulebook.site.name}`,
    'Roles (id — name, kind, tags):',
    list(rulebook.roles, r => `${r.id} — ${r.name}, ${r.kind}${r.tags?.length ? `, tags: ${r.tags.join(', ')}` : ''}`),
    'Actions (id — name, kinds, tags):',
    list(rulebook.actions, a => `${a.id} — ${a.name ?? a.id}, ${a.kinds.join('/')}${a.tags?.length ? `, tags: ${a.tags.join(', ')}` : ''}`),
    'Areas (id — name, tags):',
    list(rulebook.areas, a => `${a.id} — ${a.name}${a.tags?.length ? `, tags: ${a.tags.join(', ')}` : ''}`),
    'Facts a rule may condition on (id — type):',
    list(rulebook.facts.filter(f => f.required || f.default !== undefined), f => `${f.id} — ${f.type}${f.type === 'enum' ? ` (${(f.values ?? []).join(', ')})` : ''}`),
    'Limits (id — unit):',
    list(rulebook.limits, l => `${l.id}${l.unit ? ` — ${l.unit}` : ''}`),
    `Kinds: ${rulebook.kinds.join(', ')}`,
    `Role tags: ${rulebook.tags.roles.join(', ') || 'none'}. Action tags: ${rulebook.tags.actions.join(', ') || 'none'}. Area tags: ${rulebook.tags.areas.join(', ') || 'none'}.`,
    '',
    'Rule shape (JSON):',
    '{ "rule": { "id": "<snake_case>", "text": "<the rule in plain words>",',
    '  "who": <selector>, "does": <selector>, "where": <selector>,',
    '  "when": [ <condition>, ... ]  (optional; AND-ed),',
    '  "then": {"answer":"allow"} | {"answer":"deny"} | {"answer":"wait","for":"approval"|"condition","by"?:"<authority|role|tag:roletag>"} | {"answer":"limit","limits":{"<limit id>": <number>}},',
    '  "reason": "<one sentence shown in decisions>" } }',
    'Selector: "*" | "<id>" | "tag:<tag>" | "kind:<kind>" | a list of those; prefix "!" to exclude.',
    'Condition: {"fact","op":"=="|"!="|">"|">="|"<"|"<=","value"} | {"fact","op":"in","values":[...]} | {"fact","op":"between","from":"HH:MM","to":"HH:MM"} | {"fact","op":"days","days":["mon",...]}',
    'Do not include "setBy" or "source"; the caller sets those from the authority the space granted the author.',
    'If the text cannot be expressed with this vocabulary, answer {"error": "<what is missing, in plain words>"}.',
    'Answer with JSON only.',
    '',
    `Text: ${JSON.stringify(text)}`,
  ].join('\n');
}

export interface ParsedDraft {
  draft: Rule | null;
  errors: string[];
  /** True when the model's answer is a valid rule with a declared authority. A person still reads it before it goes in. */
  confidentDraft: boolean;
  /** @deprecated 0.5.2 name of `confidentDraft`; the same value. Removed in 0.6. */
  ready: boolean;
}

/** Validate a model's JSON answer into a draft. `setBy` comes from the caller; anything the model says about it is ignored. */
export function parseRuleDraft(json: string | object, rulebook: Rulebook, options: DraftOptions & { text?: string } = {}): ParsedDraft {
  domainOnly('parseRuleDraft', rulebook);
  let parsed: unknown;
  if (typeof json === 'string') {
    const cleaned = json.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
    try { parsed = JSON.parse(cleaned); } catch { return { draft: null, errors: ['The answer is not valid JSON.'], confidentDraft: false, ready: false }; }
  } else parsed = json;
  if (!parsed || typeof parsed !== 'object') return { draft: null, errors: ['The answer is not a JSON object.'], confidentDraft: false, ready: false };
  const obj = parsed as { error?: unknown; rule?: unknown };
  if (typeof obj.error === 'string') return { draft: null, errors: [`The model could not express it: ${obj.error}`], confidentDraft: false, ready: false };
  const raw = (obj.rule && typeof obj.rule === 'object' ? obj.rule : parsed) as Record<string, unknown>;
  const errors: string[] = [];
  if (raw.setBy !== undefined) errors.push('The model tried to set "setBy"; ignored — the caller sets the authority, from the level the space granted the author.');
  const text = options.text ?? (typeof raw.text === 'string' ? raw.text : '');
  const draft = {
    ...clone(raw),
    id: options.id ?? (typeof raw.id === 'string' && raw.id ? raw.id : slug(text || 'rule')),
    text: typeof raw.text === 'string' && raw.text ? raw.text : text,
    source: sourceOf(options, text || '(model draft)'),
    setBy: options.setBy ?? '',
  } as Rule;
  if (!options.setBy) errors.push('Say who sets this rule (setBy) before confirming it: the authority the space granted the author.');
  else {
    try { validateRule(draft, vocabularyOf(rulebook)); } catch (e) { return { draft: null, errors: [...errors, e instanceof DomainRulesError ? e.message : String(e)], confidentDraft: false, ready: false }; }
  }
  return { draft, errors, confidentDraft: !!options.setBy, ready: !!options.setBy };
}

/** Drafting speaks of robots, areas and speeds: a /3 door. A /1 rulebook is refused by name (SPEC.md § 16.10). */
function domainOnly(door: string, rulebook: unknown): void {
  const problem = rulebookVersionProblem(rulebook, 'domain');
  if (problem) throw new DomainRulesError(`${door}: ${problem}`);
}

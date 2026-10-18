/**
 * Plain-text rendering — the rulebook as Markdown a site manager can read.
 * JSON stays canonical; this is a view of it.
 */

import type { FactDef, Rule, Rulebook, Selector } from './types';
import { describeCondition, describeHistoryCondition, selectorEntries, vocabularyOf, type Vocabulary } from './vocabulary';
import { say } from './check';
import { rulebookVersionProblem } from './version';
import { DomainRulesError } from './vocabulary';

export function renderDomainRules(rb: Rulebook): string {
  const versionProblem = rulebookVersionProblem(rb, 'domain');
  if (versionProblem) throw new DomainRulesError(`renderDomainRules: ${versionProblem}`);
  const vocab = vocabularyOf(rb);
  const L: string[] = [];
  L.push(`# Rules for ${rb.site.name}`, '');
  const head = [
    rb.site.hours ? `Open ${rb.site.hours.open}–${rb.site.hours.close}.` : '',
    rb.template ? `Template: ${rb.template}.` : '',
    `Fingerprint \`${rb.fingerprint}\`.`,
  ].filter(Boolean).join(' ');
  L.push(head, '');
  L.push('How a decision is made: never rules first, nothing overrides them; then the role must list the action; then every rule that matches, and the strictest answer wins (no > wait > slower > yes). Limits combine by taking the lowest. Every rule says who set it; a lower authority can only make things stricter. An approval only counts when it comes from someone with the authority the rule names.', '');
  L.push(`An action the rulebook does not know: ${rb.otherwise === 'deny' ? 'no' : 'wait for approval'}.`, '');

  L.push('## Authorities (highest first)', '');
  rb.authorities.forEach((a, i) => L.push(`${i + 1}. ${a.name ?? a.id} (\`${a.id}\`)`));

  L.push('', '## Areas', '');
  for (const a of rb.areas) {
    const extras = [
      a.tags?.length ? a.tags.join(', ') : '',
      a.allowRoles ? `only: ${a.allowRoles.join(', ')}` : '',
      a.denyRoles ? `never: ${a.denyRoles.join(', ')}` : '',
    ].filter(Boolean);
    L.push(`- **${a.name}** (\`${a.id}\`)${extras.length ? ` — ${extras.join('; ')}` : ''}`);
  }

  L.push('', '## Roles', '');
  for (const r of rb.roles) {
    const tags = r.tags?.length ? `, ${r.tags.join(', ')}` : '';
    L.push(`- **${r.name}** (\`${r.id}\`, ${r.kind}${tags}) — may: ${r.actions.join(', ') || 'nothing'}`);
  }

  L.push('', '## Actions', '');
  for (const a of rb.actions) {
    const effects = (a.effects ?? []).map(e => e.op === 'move' ? 'moves the participant to the step\'s area' : e.op === 'set' ? `${e.fact} := ${JSON.stringify(e.value)}` : `${e.fact} ${e.op === 'add' ? '+' : '-'}= ${e.value}`);
    L.push(`- \`${a.id}\` — ${a.name ?? a.id.replace(/_/g, ' ')} (${a.kinds.join(', ')}${a.tags?.length ? `; ${a.tags.join(', ')}` : ''}${a.requires?.length ? `; needs ${a.requires.join(', ')}` : ''})${effects.length ? ` — in a plan: ${effects.join(', ')}` : ''}`);
  }

  L.push('', '## Facts every request brings', '');
  for (const f of rb.facts) L.push(`- \`${f.id}\` — ${describeFact(f)}${f.description ? `. ${f.description}` : ''}`);
  L.push('- `approvedBy` — who approved this action, if anyone: a name, or { id, authority, roleId }. Clears an approval wait when the approver holds what the rule asks for.');

  if (rb.limits.length) {
    L.push('', '## Limits', '');
    for (const l of rb.limits) L.push(`- \`${l.id}\`${l.name ? ` — ${l.name}` : ''}${l.unit ? ` (${l.unit})` : ''}${l.requestedFact ? `, requested as \`${l.requestedFact}\`` : ''}`);
  }

  const never = rb.rules.filter(r => r.never), rules = rb.rules.filter(r => !r.never);
  L.push('', '## Never (nothing overrides these)', '');
  if (!never.length) L.push('- none');
  for (const r of never) L.push(renderRule(r, vocab));

  L.push('', '## Rules', '', 'Each line: who · does · where · when → answer. Set by whom, and where it came from.', '');
  if (!rules.length) L.push('- none');
  for (const r of rules) L.push(renderRule(r, vocab));

  if (rb.planRules?.length) {
    L.push('', '## Plan rules (checked on a whole plan)', '');
    for (const r of rb.planRules) L.push(`- \`${r.id}\` — ${describeSelector(r.who, 'who', vocab)} · ${describePlanCheck(r)}  \n  ${r.text} _(set by ${r.setBy}; ${r.source.kind})_`);
  }

  L.push('', '## Always checked', '');
  for (const b of rb.builtin) L.push(`- \`${b.id}\` — ${b.text}`);

  L.push('', '## Rules at odds', '');
  if (!rb.findings.length) L.push('None found.');
  for (const f of rb.findings) L.push(`- **${f.severity.toUpperCase()}** ${f.kind} (${f.certainty}) — ${f.message}`);
  L.push('');
  return L.join('\n');
}

export function describePlanCheck(r: Rule | { check: NonNullable<Rulebook['planRules']>[number]['check'] }): string {
  const c = (r as { check: NonNullable<Rulebook['planRules']>[number]['check'] }).check;
  const sel = (s: Selector) => (Array.isArray(s) ? s.join('/') : s);
  switch (c.kind) {
    case 'ends_in': return `the plan ends in ${sel(c.areas)}`;
    case 'ends_with': return `the plan ends with ${sel(c.actions)}`;
    case 'before': return `${sel(c.first)} before every ${sel(c.then)}${c.sameArea ? ' in the same area' : ''}`;
    case 'at_most': return `at most ${c.count} × ${sel(c.actions)}`;
    case 'at_least': return `at least ${c.count} × ${sel(c.actions)}`;
  }
}

export function renderRule(r: Rule, vocab: Vocabulary): string {
  const conds = [...(r.when ?? []).map(describeCondition), ...(r.history ?? []).map(describeHistoryCondition)];
  const when = conds.length ? conds.join(' and ') : 'always';
  const answer = say(r) + (r.then.answer === 'deny' && r.then.instead ? `, then ${r.then.instead}` : '');
  const from = r.source.kind === 'question' ? `question ${r.source.ref}` : r.source.kind === 'template' ? `template ${r.source.ref}` : r.source.kind === 'text' ? `written as "${r.source.ref}"` : r.source.kind === 'declaration' ? `declared (${r.source.ref})` : r.source.kind;
  return `- \`${r.id}\` — ${describeSelector(r.who, 'who', vocab)} · ${describeSelector(r.does, 'does', vocab)} · ${describeSelector(r.where, 'where', vocab)} · ${when} → **${answer}**  \n  ${r.text} _(set by ${r.setBy}; ${from})_`;
}

export function describeSelector(sel: Selector, kind: 'who' | 'does' | 'where', vocab: Vocabulary): string {
  const everything = kind === 'who' ? 'anyone' : kind === 'does' ? 'anything' : 'everywhere';
  const entries = selectorEntries(sel);
  const positives = entries.filter(e => !e.startsWith('!'));
  const negatives = entries.filter(e => e.startsWith('!')).map(e => e.slice(1));
  const name = (e: string): string => {
    if (e === '*') return everything;
    if (e.startsWith('tag:')) return `${e.slice(4)}-tagged`;
    if (e.startsWith('kind:')) return `${e.slice(5)}s`;
    const thing = kind === 'who' ? vocab.roles.get(e) : kind === 'does' ? vocab.actions.get(e) : vocab.areas.get(e);
    return (thing && 'name' in thing && thing.name) ? thing.name : e;
  };
  const head = positives.length === 0 || positives.includes('*') ? everything : positives.map(name).join(', ');
  return negatives.length ? `${head} except ${negatives.map(name).join(', ')}` : head;
}

export function describeFact(f: FactDef): string {
  const type = f.type === 'number'
    ? `${f.integer ? 'whole number' : 'number'}${f.min !== undefined ? `, ${f.min} or more` : ''}${f.max !== undefined ? `, ${f.max} or less` : ''}`
    : f.type === 'time' ? '"HH:MM" 24h' : f.type === 'day' ? 'mon..sun' : f.type === 'enum' ? `one of ${(f.values ?? []).join(', ')}` : f.type === 'boolean' ? 'true or false' : 'text';
  const presence = f.required ? 'required' : f.default !== undefined ? `absent means ${JSON.stringify(f.default)}` : 'optional';
  return `${type}, ${presence}`;
}

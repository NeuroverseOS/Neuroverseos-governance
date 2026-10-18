/**
 * Template — a starting vocabulary plus questions whose answers emit rules.
 *
 * A template never decides anything itself. It declares default actions,
 * facts, limits, tags and authorities, and a set of plain questions. Each
 * answer EMITS RULES in the one rule shape; the compiler adds them to the
 * rulebook with `source: { kind: 'question', ref: 'question:answer' }`. The
 * first option of every question is the safe one, and unanswered questions
 * take it.
 */

import type { ActionDef, AreaDef, AuthorityDef, FactDef, LimitDef, RoleDef, Rule, SiteDef } from '../types';

export interface TemplateContext {
  site: SiteDef;
  answers: Record<string, string>;
  roles: RoleDef[];
  areas: AreaDef[];
  actions: ActionDef[];
  facts: FactDef[];
  limits: LimitDef[];
}

/** A rule a template emits. `source` is filled in by the compiler; `setBy` defaults to the question's authority. */
export type TemplateRule = Omit<Rule, 'source' | 'setBy'> & { setBy?: string };

export interface TemplateQuestionOption {
  value: string;
  label: string;
  /** The rule this answer produces, in plain words (shown to the operator). */
  rule: string;
  /** The rules this answer emits. Permissive answers usually emit none: the role list is the grant. */
  rules?: (ctx: TemplateContext) => TemplateRule[];
  /** Some answers set the rulebook's `otherwise` instead of emitting rules. */
  otherwise?: 'deny' | 'wait-for-approval';
}

export interface TemplateQuestion {
  id: string;
  prompt: string;
  /** The authority whose rule this question sets (for example "law-and-safety", "company"). */
  setBy: string;
  /** Who the question is about, for grouping in a UI. */
  governs?: string;
  options: TemplateQuestionOption[];
  /** Index of the safe default. */
  defaultIndex: number;
}

export interface Template {
  id: string;
  name: string;
  description: string;
  kinds: string[];
  /** Highest first. */
  authorities: AuthorityDef[];
  actions: ActionDef[];
  facts: FactDef[];
  limits: LimitDef[];
  /** Tags rules may name even before any declared thing carries them. */
  tags?: { actions?: string[]; areas?: string[]; roles?: string[] };
  /** What the site must provide. */
  requires?: Array<'hours'>;
  /** Fixed rules every rulebook from this template has, regardless of answers. */
  rules?: (ctx: TemplateContext) => Array<Omit<Rule, 'source'>>;
  questions: TemplateQuestion[];
  otherwise?: 'deny' | 'wait-for-approval';
}

/** The safe default answer for every question. */
export function defaultAnswers(template: Template): Record<string, string> {
  const answers: Record<string, string> = {};
  for (const q of template.questions) answers[q.id] = q.options[q.defaultIndex].value;
  return answers;
}

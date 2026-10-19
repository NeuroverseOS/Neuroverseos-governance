import type { Template } from './template';
import { GROCERY_STORE } from './grocery-store';
import { WAREHOUSE } from './warehouse';
import { DomainRulesError } from '../vocabulary';

/** The templates this package ships. A site can also pass its own Template object. */
export const TEMPLATES: readonly Template[] = [GROCERY_STORE, WAREHOUSE];

export function templateById(id: string): Template {
  const t = TEMPLATES.find(x => x.id === id);
  if (!t) throw new DomainRulesError(`Unknown template "${id}". Shipped templates: ${TEMPLATES.map(x => x.id).join(', ')}.`);
  return t;
}

export { GROCERY_STORE, WAREHOUSE };
export type { Template, TemplateContext, TemplateQuestion, TemplateQuestionOption, TemplateRule } from './template';
export { defaultAnswers } from './template';

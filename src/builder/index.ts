/**
 * Governance Builder — "Tell your AI how to behave"
 *
 * The user-facing system for defining AI governance rules.
 * No YAML. No schemas. No "worlds." Just questions and answers.
 *
 * Four components:
 *
 *   questions  — 12 core questions that map to governance rules
 *   compiler   — answers → structured rules → world file
 *   preview    — plain English display with toggles
 *   custom     — free-form voice input → suggested rules
 *
 * Usage:
 *   import { GovernanceBuilder } from '@neuroverseos/governance/builder';
 *
 *   const builder = new GovernanceBuilder();
 *   builder.answer('ai_send_messages', 'never');
 *   builder.answer('ai_purchases', 'never');
 *   builder.answer('ai_listening', 'declared_apps');
 *
 *   console.log(builder.preview());      // plain English rules
 *   const rules = builder.userRules();   // adapter-ready UserRules
 *   const world = builder.worldFile();   // world file string
 */

export {
  GOVERNANCE_QUESTIONS,
  getOrderedQuestions,
  getQuestionsByCategory,
  getDefaultAnswers,
  CATEGORY_LABELS,
  CATEGORY_ORDER,
} from './questions';

export type {
  GovernanceQuestion,
  AnswerOption,
  RuleMapping,
} from './questions';

export {
  compileAnswers,
  toUserRules,
  toWorldFile,
  toggleRule,
  addCustomRule,
  removeRule,
} from './compiler';

export type {
  CompiledRule,
  CompiledRuleSet,
  UserAnswers,
} from './compiler';

export {
  toPreviewSections,
  renderTerminalPreview,
  renderTerminalRule,
  renderMarkdownPreview,
  getRuleSummary,
  renderTerminalSummary,
} from './preview';

export type {
  RulePreviewItem,
  RulePreviewSection,
  RuleSummary,
} from './preview';

export {
  parseCustomRule,
  buildClassificationPrompt,
  parseLLMResponse,
  createFallbackSuggestion,
} from './custom-rule';

export type {
  CustomRuleSuggestion,
} from './custom-rule';

export {
  OrgGovernanceBuilder,
  ORG_QUESTIONS,
} from './org-builder';

export type {
  OrgRole,
  OrgRestriction,
  OrgRestrictionTemplate,
} from './org-builder';

export {
  GOVERNANCE_PRESETS,
  getPresets,
  getPreset,
  applyPreset,
  comparePresets,
} from './presets';

export type {
  GovernancePreset,
} from './presets';

export {
  STOIC_LENS,
  COACH_LENS,
  CALM_LENS,
  DIPLOMATIC_LENS,
  PROFESSIONAL_LENS,
  REFLECTIVE_LENS,
  RATIONAL_LENS,
  CLINICAL_LENS,
  MINIMALIST_LENS,
  RETAIL_ASSOCIATE_LENS,
  BUILTIN_LENSES,
  getLenses,
  getLens,
  compileLensOverlay,
  previewLens,
} from './lens';

export type {
  Lens,
  LensDirective,
  ToneModifier,
  LensOverlay,
} from './lens';

// ─── GovernanceBuilder (Stateful Convenience Class) ─────────────────────────

import { GOVERNANCE_QUESTIONS, getDefaultAnswers, getOrderedQuestions } from './questions';
import type { GovernanceQuestion } from './questions';
import { compileAnswers, toUserRules, toWorldFile, toggleRule, addCustomRule } from './compiler';
import type { CompiledRuleSet, UserAnswers } from './compiler';
import { renderTerminalPreview, renderTerminalSummary, toPreviewSections, getRuleSummary } from './preview';
import type { RulePreviewSection, RuleSummary } from './preview';
import { parseCustomRule, createFallbackSuggestion } from './custom-rule';
import type { CustomRuleSuggestion } from './custom-rule';
import type { UserRules } from '../adapters/mentraos';

export class GovernanceBuilder {
  private answers: UserAnswers;
  private _ruleSet: CompiledRuleSet | null = null;

  constructor() {
    this.answers = getDefaultAnswers();
  }

  /** Answer a question. Invalidates the compiled rule set. */
  answer(questionId: string, value: string): void {
    const question = GOVERNANCE_QUESTIONS.find(q => q.id === questionId);
    if (!question) {
      throw new Error(`Unknown question: ${questionId}`);
    }
    const option = question.options.find(o => o.value === value);
    if (!option) {
      throw new Error(`Invalid answer "${value}" for question "${questionId}". Valid: ${question.options.map(o => o.value).join(', ')}`);
    }
    this.answers.set(questionId, value);
    this._ruleSet = null;
  }

  /** Get the current answer for a question */
  getAnswer(questionId: string): string | undefined {
    return this.answers.get(questionId);
  }

  /** Get all questions in display order */
  get questions(): GovernanceQuestion[] {
    return getOrderedQuestions();
  }

  /** Get the next unanswered question (all start with defaults, so this returns first question) */
  get nextQuestion(): GovernanceQuestion | undefined {
    return getOrderedQuestions()[0];
  }

  /** Compile the current answers into a rule set */
  compile(): CompiledRuleSet {
    if (!this._ruleSet) {
      this._ruleSet = compileAnswers(this.answers);
    }
    return this._ruleSet;
  }

  /** Get adapter-ready UserRules */
  userRules(): UserRules {
    return toUserRules(this.compile());
  }

  /** Get the world file content */
  worldFile(): string {
    return toWorldFile(this.compile());
  }

  /** Get structured preview sections for UI rendering */
  previewSections(): RulePreviewSection[] {
    return toPreviewSections(this.compile());
  }

  /** Get summary stats */
  summary(): RuleSummary {
    return getRuleSummary(this.compile());
  }

  /** Render terminal preview */
  preview(): string {
    return renderTerminalPreview(this.compile());
  }

  /** Render terminal summary line */
  summaryLine(): string {
    return renderTerminalSummary(this.compile());
  }

  /** Toggle a rule on/off */
  toggle(ruleId: string, enabled: boolean): void {
    const compiled = this.compile();
    this._ruleSet = toggleRule(compiled, ruleId, enabled);
  }

  /** Add a custom rule from free-form text input */
  addCustom(input: string): CustomRuleSuggestion {
    const suggestion = parseCustomRule(input) ?? createFallbackSuggestion(input);
    const compiled = this.compile();
    this._ruleSet = addCustomRule(compiled, suggestion.rule);
    return suggestion;
  }

  /** Reset all answers to defaults */
  reset(): void {
    this.answers = getDefaultAnswers();
    this._ruleSet = null;
  }
}

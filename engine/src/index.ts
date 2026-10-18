/**
 * @neuroverseos/robot-domain-rules — a governance core for physical spaces
 * where robots, people and AI-driven agents work together.
 *
 *   const rulebook = new DomainRulesBuilder({ id: 'store-1', name: 'Store 1', hours: { open: '08:00', close: '22:00' } })
 *     .fromTemplate('grocery-store')
 *     .area({ id: 'aisle-3', name: 'Aisle 3', tags: ['public'] })
 *     .role({ id: 'floor_robot', name: 'Floor robot', kind: 'robot', actions: ['enter_zone', 'move', 'scan'] })
 *     .answer('robots_near_people', 'slow')
 *     .as('site-manager')
 *     .confirm(builder.addRuleFromText('robots slow to 0.3 m/s in aisle 3'))
 *     .compile();                                 // plain JSON — save it, ship it to robots, glasses and agents
 *
 *   rulebook.findings                              // rules at odds, never hidden
 *   const decision = evaluateDomainAction(rulebook, {
 *     participant: { id: 'robot-7', kind: 'robot', roleId: 'floor_robot' },
 *     action: 'move',
 *     areaId: 'aisle-3',                           // from your spatial system
 *     facts: { peopleInZone: 2, localTime: '14:05', requestedSpeedMps: 1.0 },
 *   });
 *   // → { status: 'LIMIT', limits: { maxSpeedMps: 0.3 }, reasons: [...], trace: [...], fingerprint }
 *
 * Start with README.md.
 */

export * from './types';
export { compileDomain, verifyFingerprint, validateRulebook, validateRule, validatePlanRule, BUILTIN_CHECKS, declarationAuthority } from './compile';
export { fingerprint, canonicalJson, sha256, sha256Utf8, fingerprintVersion } from './canonical';
export { RULEBOOK_FORMAT, GOVERNANCE_FORMAT, GOVERNANCE_PLAN_FORMAT, RULEBOOK_VERSION_CHECK, rulebookVersionProblem } from './version';
export type { Accepts } from './version';
export { isVerified } from './verified';
export { generateSigningKeys, publicKeyOf, signApproval, signGovernanceApproval, verifyApproval, verifyAndEvaluate, verifyAndEvaluatePlan, signRulebook, verifyRulebookSignature, signedText } from './approvals';
export type { SigningKeys, VerifyResult, RulebookSignature } from './approvals';
export type { CompileDomainInput, CompileOptions } from './compile';
export { evaluate, evaluateDomainAction, matchingRules, missingFacts, versionRefusal, bindArgs, internalRequest } from './evaluate';
export { compileGovernance, compileMission, governanceInputOf, validateMission, PLAN_AUTHORITY } from './governance';
export { GOVERNANCE_BUILTIN_CHECKS, DOMAIN_DIALECT, GOVERNANCE_DIALECT, dialectOf, normalizeRulebook, isGovernanceRulebook } from './model';
export type { Dialect, InternalRulebook } from './model';
export { backtest, compareBacktests } from './backtest';
export type { BacktestEvent, BacktestOutcome, BacktestOptions, BacktestCounts, BacktestRow, BacktestStall, BacktestConflict, BacktestGap, BacktestMissingFact, BacktestDifference, BacktestReport, BacktestChange, BacktestComparison } from './backtest';
export { evaluatePlan, applyEffects, planDigestOf } from './plan';
export { checkRulebook, rulesOverlap } from './check';
export { renderDomainRules, renderRule, describeSelector } from './render';
export { glassesZoneRules, OPEN_ZONE_RULES, GLASSES_ACTION_FIELDS } from './glasses';
export type { GlassesBridgeOptions } from './glasses';
export { draftRuleFromText, buildRuleDraftPrompt, parseRuleDraft } from './draft';
export type { RuleDraft, DraftOptions, ParsedDraft } from './draft';
export { DomainRulesError, SEVERITY, isValidTime, isOpen, isTimestamp, parseTimestamp, timeOfDay, resolveSelector, describeCondition, describeHistoryCondition } from './vocabulary';
export { mergeRules } from './zone-rules';
export type { ZoneRules, ZoneCustomRule } from './zone-rules';
export { TEMPLATES, GROCERY_STORE, WAREHOUSE, templateById, defaultAnswers } from './templates/index';
export type { Template, TemplateContext, TemplateQuestion, TemplateQuestionOption, TemplateRule } from './templates/index';
export type { LegacyCompileInput, LegacyZone, LegacyRole } from './legacy';

import { compileDomain, declarationAuthority, type CompileDomainInput, type CompileOptions } from './compile';
import { checkRulebook } from './check';
import { renderDomainRules } from './render';
import { draftRuleFromText, type DraftOptions, type RuleDraft } from './draft';
import { DomainRulesError } from './vocabulary';
import { templateById, type Template } from './templates/index';
import type { ActionDef, AreaDef, AuthorityDef, FactDef, Finding, LimitDef, PlanRule, RoleDef, Rule, Rulebook, SiteDef } from './types';

/**
 * Step-by-step way to build a rulebook. Same result as calling compileDomain
 * with the equivalent input (`toInput()`).
 */
export class DomainRulesBuilder {
  private input: CompileDomainInput;
  private authority: string | undefined;

  constructor(site: SiteDef) {
    this.input = { site, areas: [], roles: [] };
  }

  /** Start from a shipped template ("grocery-store", "warehouse") or your own Template. */
  fromTemplate(template: string | Template): this {
    this.input.template = typeof template === 'string' ? templateById(template) : template;
    return this;
  }

  /** Declare who may set rules, highest first. A template brings its own; this replaces it. */
  authorities(list: AuthorityDef[]): this { this.input.authorities = list; return this; }

  /** The authority the next addRule / confirm / drafts are set by. */
  as(authority: string): this { this.authority = authority; return this; }

  kinds(...kinds: string[]): this { this.input.kinds = [...(this.input.kinds ?? []), ...kinds]; return this; }
  action(def: ActionDef): this { (this.input.actions ??= []).push(def); return this; }
  area(def: AreaDef): this { this.input.areas.push(def); return this; }
  /** @deprecated 0.2 name. Same as `area`. */
  zone(def: AreaDef): this { return this.area(def); }
  role(def: RoleDef): this { this.input.roles.push(def); return this; }
  fact(def: FactDef): this { (this.input.facts ??= []).push(def); return this; }
  limit(def: LimitDef): this { (this.input.limits ??= []).push(def); return this; }
  tags(kind: 'actions' | 'areas' | 'roles', ...tags: string[]): this {
    const t = (this.input.tags ??= {});
    t[kind] = [...(t[kind] ?? []), ...tags];
    return this;
  }
  otherwise(value: 'deny' | 'wait-for-approval'): this { this.input.otherwise = value; return this; }

  /** The template's questions, with their current answers. */
  get questions() {
    const t = this.template();
    return t ? t.questions.map(q => ({ ...q, current: this.input.answers?.[q.id] ?? q.options[q.defaultIndex].value })) : [];
  }

  answer(questionId: string, value: string): this {
    const t = this.template();
    if (!t) throw new DomainRulesError('Choose a template before answering questions (fromTemplate).');
    const q = t.questions.find(x => x.id === questionId);
    if (!q) throw new DomainRulesError(`Unknown question "${questionId}". Known: ${t.questions.map(x => x.id).join(', ')}`);
    if (!q.options.some(o => o.value === value)) throw new DomainRulesError(`Invalid answer "${value}" for "${questionId}". Valid: ${q.options.map(o => o.value).join(', ')}`);
    (this.input.answers ??= {})[questionId] = value;
    return this;
  }

  /**
   * Add a rule. `setBy` defaults to the authority chosen with `as()`. Any
   * author holding a declared authority — a person, a system, an AI agent —
   * adds rules this way; the rule goes in at that authority, which can only
   * tighten what higher authorities set.
   */
  addRule(rule: Omit<Rule, 'source' | 'setBy'> & { setBy?: string; source?: Rule['source'] }): this {
    const setBy = rule.setBy ?? this.authority;
    if (!setBy) throw new DomainRulesError(`Rule "${rule.id}": say who sets it — pass setBy or call as(<authority>) first.`);
    (this.input.rules ??= []).push({ ...rule, setBy, source: rule.source ?? { kind: 'manual', ref: rule.id } });
    return this;
  }

  /** Add a rule about whole plans (checked by `evaluatePlan`). `setBy` defaults to the authority chosen with `as()`. */
  addPlanRule(rule: Omit<PlanRule, 'source' | 'setBy'> & { setBy?: string; source?: PlanRule['source'] }): this {
    const setBy = rule.setBy ?? this.authority;
    if (!setBy) throw new DomainRulesError(`Plan rule "${rule.id}": say who sets it — pass setBy or call as(<authority>) first.`);
    (this.input.planRules ??= []).push({ ...rule, setBy, source: rule.source ?? { kind: 'manual', ref: rule.id } });
    return this;
  }

  /**
   * Draft a rule from plain words against the current vocabulary. Returns the
   * draft; `confirm()` adds it. With `as()` set the draft can be a `confidentDraft` (the
   * author holds a declared authority) and `confirm` is just the add; without
   * it, someone holding an authority must confirm.
   */
  addRuleFromText(text: string, options: Omit<DraftOptions, 'setBy'> = {}): RuleDraft {
    const setBy = this.authority ?? this.defaultAuthority();
    return draftRuleFromText(text, this.vocabularyRulebook(), { ...options, setBy });
  }

  /** Add a draft (from addRuleFromText or parseRuleDraft) or a rule. */
  confirm(draft: RuleDraft | { draft: Rule | null } | Rule, overrides: Partial<Rule> = {}): this {
    const rule = 'draft' in draft ? draft.draft : draft;
    if (!rule) throw new DomainRulesError('There is no draft to confirm; read the notes and rewrite the text.');
    const merged = { ...rule, ...overrides };
    return this.addRule(merged);
  }

  /** What the conflict check would say about the rulebook as it stands. */
  check(): Finding[] { return checkRulebook(this.toInput()); }

  compile(options?: CompileOptions): Rulebook { return compileDomain(this.toInput(), options); }

  /** The compiled rulebook as plain-English Markdown. */
  preview(): string { return renderDomainRules(this.compile()); }

  /** The equivalent compileDomain input. */
  toInput(): CompileDomainInput { return { ...this.input }; }

  private template(): Template | undefined {
    return typeof this.input.template === 'string' ? templateById(this.input.template) : this.input.template;
  }

  private defaultAuthority(): string {
    const list = this.input.authorities ?? this.template()?.authorities ?? [{ id: 'site' }];
    return declarationAuthority(list);
  }

  /** A rulebook with the vocabulary as it stands, for drafting (rules are left out so a half-written one cannot block drafting). */
  private vocabularyRulebook(): Rulebook {
    return compileDomain({ ...this.input, rules: [] });
  }
}

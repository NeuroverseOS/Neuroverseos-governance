import { describe, expect, it } from 'vitest';
import {
  backtest,
  buildRuleDraftPrompt,
  checkRulebook,
  compareBacktests,
  compileDomain,
  DomainRulesBuilder,
  DomainRulesError,
  draftRuleFromText,
  evaluateDomainAction,
  glassesZoneRules, parseTimestamp, sha256Utf8, canonicalJson, fingerprint, signApproval, verifyApproval, verifyAndEvaluate, verifyAndEvaluatePlan, publicKeyOf, planDigestOf,
  validateRulebook, timeOfDay, isVerified, rulebookVersionProblem, GROCERY_STORE,
  isOpen,
  matchingRules,
  evaluatePlan,
  parseRuleDraft,
  renderDomainRules,
  verifyFingerprint,
} from '../src/index';
import type { CompileDomainInput, Condition, DomainRequest, LegacyCompileInput, Rule, Rulebook } from '../src/index';
import type { ZoneRules } from '../src/zone-rules';
import { store } from '../examples/legacy-store-0.2';
import * as grocery from '../examples/grocery-store';
import * as clinicExample from '../examples/clinic';
import { sampleSite } from '../examples/backtest/rulebook';

/** @neuroverseos/governance/spatial ZONE_TEMPLATES.retail, copied so this repo has no dependency on it. */
const RETAIL_ZONE_RULES: ZoneRules = {
  camera: 'confirm_each', microphone: 'allowed', aiDataSend: 'allowed', aiActions: 'allowed', aiRecommendations: 'non_commercial',
  locationSharing: 'allowed', aiOverlay: 'allowed', dataRetention: 'allowed', commercialAI: 'blocked', bystanderProtection: 'elevated',
};

// The 0.2 example store, through the deprecated input shape. Every 0.2 test below runs against it.
const rules = compileDomain(store);

const robot = (roleId: string, action: string, zoneId: string, facts: Record<string, unknown> = {}): DomainRequest => ({
  participant: { id: 'r-1', kind: 'robot', roleId },
  action,
  zoneId,
  facts: { peopleInZone: 0, localTime: '10:00', ...facts },
});
const person = (roleId: string, action: string, zoneId: string, extra: Partial<DomainRequest> = {}): DomainRequest => ({
  participant: { id: 'p-1', kind: 'person', roleId },
  action,
  zoneId,
  facts: { peopleInZone: 1, localTime: '10:00' },
  ...extra,
});
const ids = (d: { reasons: { ruleId: string }[] }) => d.reasons.map(r => r.ruleId);
const legacy = (patch: Partial<LegacyCompileInput>): LegacyCompileInput => ({ ...store, ...patch });

// A tiny site with no template, for rule-level tests. Two independent facts, one time fact, one enum.
const tiny = (rulesList: Array<Omit<Rule, 'source' | 'setBy'> & { setBy?: string }>, extra: Partial<CompileDomainInput> = {}): CompileDomainInput => ({
  site: { id: 't', name: 'Tiny' },
  authorities: [{ id: 'high' }, { id: 'low' }],
  actions: [{ id: 'go', kinds: ['robot'], tags: ['movement'] }, { id: 'look', kinds: ['robot'] }],
  facts: [
    { id: 'n', type: 'number', integer: true, min: 0, required: true },
    { id: 'm', type: 'number', min: 0, default: 0 },
    { id: 't', type: 'time', required: true },
    { id: 'mode', type: 'enum', values: ['a', 'b', 'c'], default: 'a' },
    { id: 'flag', type: 'boolean', default: false },
    { id: 'day', type: 'day', required: true },
  ],
  limits: [{ id: 'speed', unit: 'm/s' }],
  areas: [{ id: 'x', name: 'X' }, { id: 'y', name: 'Y', tags: ['far'] }],
  roles: [{ id: 'bot', name: 'Bot', kind: 'robot', actions: ['go', 'look'] }],
  rules: rulesList.map(r => ({ setBy: 'high', ...r, source: { kind: 'manual', ref: r.id } })),
  ...extra,
});
const tinyReq = (action = 'go', areaId = 'x', facts: Record<string, unknown> = {}): DomainRequest => ({
  participant: { id: 'b', kind: 'robot', roleId: 'bot' }, action, areaId, facts: { n: 0, t: '10:00', day: 'mon', ...facts },
});
const rule = (id: string, then: Rule['then'], patch: Partial<Rule> = {}): Omit<Rule, 'source' | 'setBy'> & { setBy?: string } =>
  ({ id, text: id, who: '*', does: '*', where: '*', then, ...patch });

describe('domain rules: compile', () => {
  it('is deterministic and resolves role inheritance', () => {
    expect(compileDomain(store).fingerprint).toBe(rules.fingerprint);
    expect(rules.roles.find(r => r.id === 'restock_robot')!.actions).toEqual(expect.arrayContaining(['enter_zone', 'move', 'scan', 'dock', 'manipulate']));
    const changed = compileDomain(legacy({ answers: { ...store.answers, robot_speed: 'careful' } }));
    expect(changed.fingerprint).not.toBe(rules.fingerprint);
  });

  it('defaults every unanswered question to the safe answer', () => {
    const d = compileDomain(legacy({ answers: {} }));
    expect(d.answers).toEqual({
      robots_near_people: 'stop', robot_speed: 'careful', robots_staff_zones: 'never', robots_restricted_zones: 'never',
      robots_after_hours: 'never', robot_scan_near_people: 'never', glasses_capture: 'blocked', robot_commands: 'nobody',
      emergency: 'stop_all', unknown_actions: 'block',
    });
    expect(d.otherwise).toBe('deny');
    expect(d.findings.filter(f => f.severity !== 'info')).toEqual([]);
  });

  it('refuses inputs it cannot govern, saying what to fix', () => {
    const bad = (patch: Partial<LegacyCompileInput>) => () => compileDomain(legacy(patch));
    expect(bad({ answers: { robot_speed: 'ludicrous' } })).toThrow(/Invalid answer "ludicrous"/);
    expect(bad({ answers: { robot_dance: 'yes' } })).toThrow(/Unknown question/);
    expect(bad({ zones: [...store.zones, store.zones[0]] })).toThrow(/declared twice/);
    expect(bad({ roles: [{ roleId: 'x', name: 'X', kind: 'robot', actions: ['camera_capture'] }] })).toThrow(/robot and cannot list "camera_capture"/);
    expect(bad({ roles: [
      { roleId: 'a', name: 'A', kind: 'robot', actions: [], inherits: 'b' },
      { roleId: 'b', name: 'B', kind: 'robot', actions: [], inherits: 'a' },
    ] })).toThrow(/loops/);
    expect(bad({ site: { ...store.site, hours: { open: '7am', close: '22:00' } } })).toThrow(DomainRulesError);
  });

  it('builder gives the same rulebook as compileDomain', () => {
    expect(grocery.builder.compile().fingerprint).toBe(grocery.rulebook.fingerprint);
    expect(compileDomain(grocery.builder.toInput()).fingerprint).toBe(grocery.rulebook.fingerprint);
    expect(grocery.builder.preview()).toContain('# Rules for Example Grocery');
  });
});

describe('domain rules: robots', () => {
  it('caps speed by site, area and people present', () => {
    expect(evaluateDomainAction(rules, robot('inventory_robot', 'move', 'aisle-3', { requestedSpeedMps: 0.8 })).status).toBe('ALLOW');
    const fast = evaluateDomainAction(rules, robot('inventory_robot', 'move', 'aisle-3', { requestedSpeedMps: 1.2 }));
    expect(fast).toMatchObject({ status: 'LIMIT', limits: { maxSpeedMps: 1.0 } });
    expect(evaluateDomainAction(rules, robot('inventory_robot', 'move', 'checkout', { requestedSpeedMps: 1 })).limits).toEqual({ maxSpeedMps: 0.3 });
    const near = evaluateDomainAction(rules, robot('inventory_robot', 'move', 'aisle-3', { peopleInZone: 2, requestedSpeedMps: 1 }));
    expect(near).toMatchObject({ status: 'LIMIT', limits: { maxSpeedMps: 0.3 } });
    expect(ids(near)).toEqual(['robots_near_people']);
  });

  it('stops near people when the answer is stop', () => {
    const strict = compileDomain(legacy({ answers: { ...store.answers, robots_near_people: 'stop' } }));
    const d = evaluateDomainAction(strict, robot('restock_robot', 'manipulate', 'aisle-3', { peopleInZone: 1 }));
    expect(d.status).toBe('PAUSE');
    expect(ids(d)).toEqual(['robots_near_people']);
  });

  it('blocks actions the role does not list, and unknown actions, areas and roles', () => {
    expect(ids(evaluateDomainAction(rules, robot('inventory_robot', 'manipulate', 'aisle-3')))).toEqual(['role_permits_action']);
    expect(ids(evaluateDomainAction(rules, robot('inventory_robot', 'open_door', 'aisle-3')))).toEqual(['unknown_action']);
    expect(ids(evaluateDomainAction(rules, robot('inventory_robot', 'move', 'roof')))).toEqual(['area_declared']);
    expect(ids(evaluateDomainAction(rules, robot('staff', 'move', 'aisle-3')))).toEqual(['role_declared']);
    const pausing = compileDomain(legacy({ answers: { ...store.answers, unknown_actions: 'pause' } }));
    expect(evaluateDomainAction(pausing, robot('inventory_robot', 'open_door', 'aisle-3')).status).toBe('PAUSE');
  });

  it('approval clears an approval pause but never a condition pause', () => {
    const restricted = robot('restock_robot', 'enter_zone', 'electrical', { requestedSpeedMps: 0.5 });
    expect(evaluateDomainAction(rules, restricted).status).toBe('PAUSE');
    expect(evaluateDomainAction(rules, { ...restricted, facts: { ...restricted.facts, approvedBy: 'dana' } }).status).toBe('ALLOW');

    const scan = robot('inventory_robot', 'scan', 'aisle-3', { peopleInZone: 2, approvedBy: 'dana' });
    expect(evaluateDomainAction(rules, scan)).toMatchObject({ status: 'PAUSE', reasons: [{ ruleId: 'robot_scan_near_people' }] });
    const back = robot('restock_robot', 'enter_zone', 'back-room', { approvedBy: 'dana', requestedSpeedMps: 0.5 });
    expect(ids(evaluateDomainAction(rules, back))).toEqual(['robots_staff_zones']);
    expect(evaluateDomainAction(rules, { ...back, facts: { ...back.facts, staffInZone: 1 } }).status).toBe('ALLOW');
  });

  it('applies opening hours, including overnight sites', () => {
    expect(ids(evaluateDomainAction(rules, robot('inventory_robot', 'move', 'aisle-3', { localTime: '23:30', requestedSpeedMps: 0.5 })))).toEqual(['robots_after_hours']);
    expect(evaluateDomainAction(rules, robot('cleaning_robot', 'move', 'aisle-3', { localTime: '23:30', requestedSpeedMps: 0.5 })).status).toBe('ALLOW');
    const overnight = compileDomain(legacy({ site: { ...store.site, hours: { open: '20:00', close: '06:00' } } }));
    expect(evaluateDomainAction(overnight, robot('inventory_robot', 'move', 'aisle-3', { localTime: '02:00', requestedSpeedMps: 0.5 })).status).toBe('ALLOW');
    expect(ids(evaluateDomainAction(overnight, robot('inventory_robot', 'move', 'aisle-3', { localTime: '12:00', requestedSpeedMps: 0.5 })))).toEqual(['robots_after_hours']);
    const always = compileDomain(legacy({ site: { ...store.site, hours: { open: '00:00', close: '00:00' } } }));
    expect(evaluateDomainAction(always, robot('inventory_robot', 'move', 'aisle-3', { localTime: '03:00', requestedSpeedMps: 0.5 })).status).toBe('ALLOW');
    expect(isOpen('02:00', { open: '20:00', close: '06:00' })).toBe(true);
    expect(isOpen('12:00', { open: '20:00', close: '06:00' })).toBe(false);
    expect(isOpen('03:00', { open: '00:00', close: '00:00' })).toBe(true);
  });

  it('stops robots in an emergency; stop_then_dock allows only docking', () => {
    const moving = evaluateDomainAction(rules, robot('inventory_robot', 'move', 'aisle-3', { emergency: true }));
    expect(moving).toMatchObject({ status: 'BLOCK', then: 'dock' });
    expect(evaluateDomainAction(rules, robot('inventory_robot', 'dock', 'aisle-3', { emergency: true, requestedSpeedMps: 0.3 })).status).toBe('ALLOW');
    const stayPut = compileDomain(legacy({ answers: { ...store.answers, emergency: 'stop_all' } }));
    const d = evaluateDomainAction(stayPut, robot('inventory_robot', 'dock', 'aisle-3', { emergency: true }));
    expect(d.status).toBe('BLOCK');
    expect(d.then).toBeUndefined();
  });

  it('records every check, who set each rule, and the rulebook that decided', () => {
    const d = evaluateDomainAction(rules, robot('inventory_robot', 'move', 'aisle-3', { peopleInZone: 2, requestedSpeedMps: 1 }));
    expect(d.trace.map(c => c.ruleId)).toEqual(['role_permits_action', 'robots_near_people', 'robot_speed']);
    expect(d.trace.map(c => c.setBy)).toEqual(['builtin', 'law-and-safety', 'law-and-safety']);
    expect(d.fingerprint).toBe(rules.fingerprint);
  });
});

describe('domain rules: required facts', () => {
  it('never treats a missing or invalid fact as permission', () => {
    const base = robot('inventory_robot', 'move', 'aisle-3', { requestedSpeedMps: 0.5 });
    expect(evaluateDomainAction(rules, base).status).toBe('ALLOW');   // absent emergency = none, absent staffInZone = 0

    const missing = evaluateDomainAction(rules, { ...base, facts: { localTime: '10:00', requestedSpeedMps: 0.5 } });
    expect(missing.status).toBe('BLOCK');
    expect(ids(missing)).toEqual(['required_facts']);
    expect(missing.reasons[0].reason).toMatch(/peopleInZone/);

    const badFacts = [
      { peopleInZone: -1 }, { peopleInZone: 1.5 }, { peopleInZone: '2' }, { peopleInZone: NaN },
      { staffInZone: -1 }, { staffInZone: 0.5 },
      { requestedSpeedMps: -1 }, { requestedSpeedMps: Infinity },
      { localTime: '9:00' }, { localTime: undefined },
      { emergency: 'no' }, { approvedBy: true }, { approvedBy: { authority: 'company' } }, { approvedBy: { id: 'x', authority: 'king' } },
    ];
    for (const patch of badFacts) {
      const d = evaluateDomainAction(rules, { ...base, facts: { ...base.facts, ...patch } });
      expect(d.status, JSON.stringify(patch)).toBe('BLOCK');
      expect(ids(d), JSON.stringify(patch)).toEqual(['required_facts']);
    }
    expect(ids(evaluateDomainAction(rules, { ...base, participant: { ...base.participant, kind: 'drone' } }))).toEqual(['required_facts']);
    expect(ids(evaluateDomainAction(rules, { ...base, participant: { ...base.participant, roleId: '' } }))).toEqual(['required_facts']);
    expect(ids(evaluateDomainAction(rules, { ...base, action: '' }))).toEqual(['required_facts']);
    expect(ids(evaluateDomainAction(rules, { ...base, zoneId: '' }))).toEqual(['required_facts']);
    expect(rules.builtin.some(b => b.id === 'required_facts')).toBe(true);
  });

  it('applies never rules and every matching rule to approved unknown actions too', () => {
    const pausing = compileDomain(legacy({ answers: { ...store.answers, unknown_actions: 'pause', robots_restricted_zones: 'never' } }));
    const approved = (zoneId: string, facts: Record<string, unknown>) => robot('inventory_robot', 'open_door', zoneId, { approvedBy: 'dana', ...facts });
    expect(evaluateDomainAction(pausing, approved('aisle-3', {})).status).toBe('ALLOW');
    expect(ids(evaluateDomainAction(pausing, approved('aisle-3', { emergency: true })))).toEqual(['emergency_stop']);
    expect(ids(evaluateDomainAction(pausing, approved('aisle-3', { localTime: '23:30' })))).toEqual(['robots_after_hours']);
    expect(ids(evaluateDomainAction(pausing, approved('electrical', {})))).toEqual(['robots_restricted_zones']);
    expect(ids(evaluateDomainAction(pausing, approved('back-room', { staffInZone: 0 })))).toEqual(['robots_staff_zones']);
    const strict = compileDomain(legacy({ answers: { ...store.answers, unknown_actions: 'pause', robots_near_people: 'stop' } }));
    expect(ids(evaluateDomainAction(strict, approved('aisle-3', { peopleInZone: 1 })))).toEqual(['robots_near_people']);
    // An unknown glasses action is not a robot command, so an emergency does not block it.
    const wave = { ...person('staff', 'wave', 'aisle-3'), facts: { peopleInZone: 1, localTime: '10:00', emergency: true, approvedBy: 'dana' } };
    expect(evaluateDomainAction(pausing, wave).status).toBe('ALLOW');
  });
});

describe('domain rules: area role limits', () => {
  it('lets an area limit which roles may act in it; inheritance does not pass area permission', () => {
    // The example store's restroom allows only cleaning_robot, staff and shopper.
    expect(ids(evaluateDomainAction(rules, robot('restock_robot', 'enter_zone', 'restroom', { requestedSpeedMps: 0.5 })))).toEqual(['area_role_limits:restroom']);
    expect(ids(evaluateDomainAction(rules, robot('inventory_robot', 'enter_zone', 'restroom', { requestedSpeedMps: 0.5 })))).toEqual(['area_role_limits:restroom']);
    expect(evaluateDomainAction(rules, robot('cleaning_robot', 'enter_zone', 'restroom', { requestedSpeedMps: 0.5 })).status).toBe('ALLOW');
    expect(evaluateDomainAction(rules, person('staff', 'ai_overlay', 'restroom')).status).toBe('ALLOW');

    const extra = compileDomain(legacy({ zones: [
      ...store.zones,
      { zoneId: 'parents-only', name: 'Parents only', kind: 'public', allowRoles: ['inventory_robot'] },
      { zoneId: 'no-staff', name: 'No staff', kind: 'public', denyRoles: ['staff'] },
    ] }));
    // restock_robot inherits inventory_robot's actions, not its area permission.
    expect(ids(evaluateDomainAction(extra, robot('restock_robot', 'move', 'parents-only', { requestedSpeedMps: 0.5 })))).toEqual(['area_role_limits:parents-only']);
    expect(evaluateDomainAction(extra, robot('inventory_robot', 'move', 'parents-only', { requestedSpeedMps: 0.5 })).status).toBe('ALLOW');
    expect(ids(evaluateDomainAction(extra, person('staff', 'ai_overlay', 'no-staff')))).toEqual(['area_role_limits:no-staff:deny']);
    expect(evaluateDomainAction(extra, person('shopper', 'ai_overlay', 'no-staff')).status).toBe('ALLOW');
    expect(renderDomainRules(extra)).toContain('only: inventory_robot');
    expect(renderDomainRules(extra)).toContain('never: staff');

    const bad = (zone: Record<string, unknown>) => () => compileDomain(legacy({ zones: [...store.zones, { zoneId: 'z', name: 'Z', kind: 'public', ...zone } as LegacyCompileInput['zones'][number]] }));
    expect(bad({ allowRoles: ['ghost'] })).toThrow(/unknown role "ghost"/);
    expect(bad({ allowRoles: ['staff'], denyRoles: ['staff'] })).toThrow(/both/);
  });
});

describe('domain rules: frozen rulebooks', () => {
  it('copies and freezes the input so later mutation cannot change a compiled rulebook', () => {
    const input = JSON.parse(JSON.stringify(store)) as LegacyCompileInput;
    const compiled = compileDomain(input);
    const before = compiled.fingerprint;
    input.site.hours.close = '23:59';
    input.zones[0].kind = 'restricted';
    input.roles[0].actions.push('manipulate');
    expect(compiled.site.hours!.close).toBe('22:00');
    expect(compiled.areas[0].tags).toEqual(['public']);
    expect(compiled.roles[0].actions).not.toContain('manipulate');
    expect(compiled.fingerprint).toBe(before);
    expect(verifyFingerprint(compiled)).toBe(true);
    expect(compileDomain(input).fingerprint).not.toBe(before);
    expect(Object.isFrozen(compiled)).toBe(true);
    expect(Object.isFrozen(compiled.site.hours)).toBe(true);
    expect(Object.isFrozen(compiled.areas[0])).toBe(true);
    expect(Object.isFrozen(compiled.roles[0].actions)).toBe(true);
    expect(Object.isFrozen(compiled.rules[0].then)).toBe(true);
    expect(() => { (compiled as { otherwise: string }).otherwise = 'wait-for-approval'; }).toThrow();
  });

  it('verifyFingerprint catches a tampered copy received as JSON', () => {
    const wire = JSON.parse(JSON.stringify(rules)) as Rulebook;
    expect(verifyFingerprint(wire)).toBe(true);
    (wire.rules.find(r => r.id === 'robot_speed')!.then as { limits: Record<string, number> }).limits.maxSpeedMps = 5;
    expect(verifyFingerprint(wire)).toBe(false);
    const again = JSON.parse(JSON.stringify(rules)) as Rulebook;
    again.fingerprint = 'abc';
    expect(verifyFingerprint(again)).toBe(false);
  });
});

describe('domain rules: glasses', () => {
  it('limits capture to staff and commands to staff', () => {
    expect(ids(evaluateDomainAction(rules, person('shopper', 'camera_capture', 'aisle-3')))).toEqual(['glasses_capture']);
    expect(evaluateDomainAction(rules, person('staff', 'record_audio', 'aisle-3')).status).toBe('ALLOW');
    expect(evaluateDomainAction(rules, person('staff', 'command_robot', 'checkout', { targetRobotId: 'r-3' })).status).toBe('ALLOW');
    // command_robot requires the targetRobotId fact: without it the request is incomplete.
    expect(ids(evaluateDomainAction(rules, person('staff', 'command_robot', 'checkout')))).toEqual(['required_facts']);
  });

  it('needs approval for non-staff commands when the answer allows it', () => {
    const open = compileDomain(legacy({
      roles: store.roles.map(r => (r.roleId === 'shopper' ? { ...r, actions: [...r.actions, 'command_robot'] } : r)),
      answers: { ...store.answers, robot_commands: 'anyone_with_approval' },
    }));
    const ask = person('shopper', 'command_robot', 'checkout', { targetRobotId: 'r-3' });
    expect(evaluateDomainAction(open, ask).status).toBe('PAUSE');
    expect(evaluateDomainAction(open, { ...ask, facts: { ...ask.facts, approvedBy: 's-1' } }).status).toBe('ALLOW');
  });

  it('blocks robot commands during an emergency', () => {
    const d = evaluateDomainAction(rules, { ...person('staff', 'command_robot', 'checkout', { targetRobotId: 'r-3' }), facts: { peopleInZone: 1, localTime: '10:00', emergency: true } });
    expect(ids(d)).toEqual(['emergency_stop_commands']);
  });

  it('turns the rules into zone rules the glasses enforce, only ever tightening', () => {
    expect(glassesZoneRules(rules, 'aisle-3', 'shopper')).toMatchObject({ camera: 'blocked', microphone: 'blocked', locationSharing: 'blocked', aiOverlay: 'allowed' });
    expect(glassesZoneRules(rules, 'aisle-3', 'staff')).toMatchObject({ camera: 'allowed', locationSharing: 'allowed' });
    // A stricter base is never loosened by the rulebook.
    expect(glassesZoneRules(rules, 'aisle-3', 'staff', RETAIL_ZONE_RULES).camera).toBe('confirm_each');
    expect(() => glassesZoneRules(rules, 'aisle-3', 'inventory_robot')).toThrow(/person role/);
    // A manager's conditional "no audio at lunch" rule is applied as if it held: the glasses can only tighten.
    expect(glassesZoneRules(grocery.rulebook, 'back-room', 'staff').microphone).toBe('blocked');
  });

  it('maps waits conservatively: a condition wait is blocked (the device cannot re-evaluate it); an approval wait is confirm_each only when the wearer may approve', () => {
    const site = (then: Rule['then']): CompileDomainInput => ({
      site: { id: 'g', name: 'G' }, authorities: [{ id: 'manager' }, { id: 'staff' }],
      kinds: ['person'], actions: [{ id: 'camera_capture', kinds: ['person'] }], facts: [{ id: 'children', type: 'number', integer: true, min: 0, required: true }],
      areas: [{ id: 'a', name: 'A' }], roles: [{ id: 'wearer', name: 'Wearer', kind: 'person', actions: ['camera_capture'], tags: ['crew'] }, { id: 'lead', name: 'Lead', kind: 'person', actions: ['camera_capture'] }],
      rules: [{ id: 'r', text: 'r', who: '*', does: 'camera_capture', where: '*', when: [{ fact: 'children', op: '>', value: 0 }], then, setBy: 'manager', source: { kind: 'manual', ref: 'r' } }],
    });
    // "No camera while children are present": the glasses cannot know when that changes, so the camera is blocked, never confirm-each.
    expect(glassesZoneRules(compileDomain(site({ answer: 'wait', for: 'condition' })), 'a', 'wearer').camera).toBe('blocked');
    // An approval wait naming nobody: the wearer confirms each time.
    expect(glassesZoneRules(compileDomain(site({ answer: 'wait', for: 'approval' })), 'a', 'wearer').camera).toBe('confirm_each');
    // Naming an authority: confirm_each only when the wearer holds it (or higher); otherwise the device cannot obtain it, so blocked.
    expect(glassesZoneRules(compileDomain(site({ answer: 'wait', for: 'approval', by: 'staff' })), 'a', 'wearer').camera).toBe('blocked');
    expect(glassesZoneRules(compileDomain(site({ answer: 'wait', for: 'approval', by: 'staff' })), 'a', 'wearer', { wearerAuthority: 'manager' }).camera).toBe('confirm_each');
    // Naming a role or a role tag: the wearer's own role decides.
    expect(glassesZoneRules(compileDomain(site({ answer: 'wait', for: 'approval', by: 'lead' })), 'a', 'wearer').camera).toBe('blocked');
    expect(glassesZoneRules(compileDomain(site({ answer: 'wait', for: 'approval', by: 'lead' })), 'a', 'lead').camera).toBe('confirm_each');
    expect(glassesZoneRules(compileDomain(site({ answer: 'wait', for: 'approval', by: 'tag:crew' })), 'a', 'wearer').camera).toBe('confirm_each');
  });
});

// ─── 0.3: generic model ──────────────────────────────────────────────────────

describe('generic rulebook: the 0.2 store decides the same way through the template', () => {
  it('gives every 0.2 demo scenario the same status as 0.2.1 did', () => {
    const r = (id: string, roleId: string) => ({ id, kind: 'robot', roleId });
    const p = (id: string, roleId: string) => ({ id, kind: 'person', roleId });
    // The 19 requests of the 0.2.1 demo and the statuses it printed (captured before this change).
    const scenarios: Array<[string, DomainRequest]> = [
      ['LIMIT', { participant: r('r-1', 'inventory_robot'), action: 'move', zoneId: 'aisle-3', facts: { peopleInZone: 0, localTime: '09:00', requestedSpeedMps: 1.2 } }],
      ['LIMIT', { participant: r('r-1', 'inventory_robot'), action: 'move', zoneId: 'aisle-3', facts: { peopleInZone: 2, localTime: '09:01', requestedSpeedMps: 1.0 } }],
      ['PAUSE', { participant: r('r-1', 'inventory_robot'), action: 'scan', zoneId: 'aisle-3', facts: { peopleInZone: 2, localTime: '09:01' } }],
      ['BLOCK', { participant: r('r-1', 'inventory_robot'), action: 'manipulate', zoneId: 'aisle-3', facts: { peopleInZone: 0, localTime: '09:05' } }],
      ['PAUSE', { participant: r('r-2', 'restock_robot'), action: 'enter_zone', zoneId: 'back-room', facts: { peopleInZone: 0, staffInZone: 0, localTime: '10:00', requestedSpeedMps: 0.8 } }],
      ['PAUSE', { participant: r('r-2', 'restock_robot'), action: 'enter_zone', zoneId: 'electrical', facts: { peopleInZone: 0, localTime: '10:30', requestedSpeedMps: 0.5 } }],
      ['ALLOW', { participant: r('r-2', 'restock_robot'), action: 'enter_zone', zoneId: 'electrical', facts: { peopleInZone: 0, localTime: '10:31', requestedSpeedMps: 0.5, approvedBy: 'manager-dana' } }],
      ['BLOCK', { participant: r('r-2', 'restock_robot'), action: 'enter_zone', zoneId: 'restroom', facts: { peopleInZone: 0, localTime: '11:00', requestedSpeedMps: 0.5 } }],
      ['ALLOW', { participant: r('r-3', 'cleaning_robot'), action: 'enter_zone', zoneId: 'restroom', facts: { peopleInZone: 0, localTime: '11:01', requestedSpeedMps: 0.5 } }],
      ['BLOCK', { participant: p('p-1', 'shopper'), action: 'camera_capture', zoneId: 'aisle-3', facts: { peopleInZone: 3, localTime: '12:00' } }],
      ['ALLOW', { participant: p('s-1', 'staff'), action: 'camera_capture', zoneId: 'aisle-3', facts: { peopleInZone: 3, localTime: '12:01' } }],
      ['ALLOW', { participant: p('s-1', 'staff'), action: 'command_robot', targetRobotId: 'r-3', zoneId: 'checkout', facts: { peopleInZone: 4, localTime: '13:00' } }],
      ['BLOCK', { participant: p('p-1', 'shopper'), action: 'command_robot', targetRobotId: 'r-3', zoneId: 'checkout', facts: { peopleInZone: 4, localTime: '13:00' } }],
      ['BLOCK', { participant: r('r-1', 'inventory_robot'), action: 'move', zoneId: 'aisle-3', facts: { peopleInZone: 6, localTime: '15:00', emergency: true } }],
      ['ALLOW', { participant: r('r-1', 'inventory_robot'), action: 'dock', zoneId: 'aisle-3', facts: { peopleInZone: 0, localTime: '15:02', emergency: true, requestedSpeedMps: 0.3 } }],
      ['BLOCK', { participant: r('r-1', 'inventory_robot'), action: 'move', zoneId: 'aisle-3', facts: { peopleInZone: 0, localTime: '23:30', requestedSpeedMps: 1.0 } }],
      ['ALLOW', { participant: r('r-3', 'cleaning_robot'), action: 'move', zoneId: 'aisle-3', facts: { peopleInZone: 0, localTime: '23:30', requestedSpeedMps: 1.0 } }],
      ['BLOCK', { participant: r('r-1', 'inventory_robot'), action: 'move', zoneId: 'loading-bay', facts: { peopleInZone: 0, localTime: '11:00' } }],
      ['BLOCK', { participant: r('r-1', 'inventory_robot'), action: 'open_door', zoneId: 'entrance', facts: { peopleInZone: 0, localTime: '11:00' } }],
    ];
    const got = scenarios.map(([, req]) => evaluateDomainAction(rules, req).status);
    expect(got).toEqual(scenarios.map(([status]) => status));
    expect(rules.template).toBe('grocery-store');
    expect(rules.rules.map(r => r.id)).toContain('zone_speed_cap:checkout');
  });
});

describe('generic rulebook: any site, any things', () => {
  it('governs a clinic declared by hand: its own actions, facts and authorities', () => {
    const rb = clinicExample.rulebook;
    expect(rb.kinds).toEqual(['robot', 'person']);
    const med = { id: 'm', kind: 'robot', roleId: 'med_robot' };
    const quiet = evaluateDomainAction(rb, { participant: med, action: 'move', areaId: 'ward-a', facts: { patient_present: false, localTime: '23:00', requestedSpeedMps: 0.3 } });
    expect(ids(quiet)).toEqual(['quiet_hours']);
    const busy = evaluateDomainAction(rb, { participant: med, action: 'deliver_meds', areaId: 'ward-a', facts: { patient_present: true, localTime: '10:00', approvedBy: { id: 'k', roleId: 'pharmacist' } } });
    expect(busy.status).toBe('PAUSE');
    expect(ids(busy)).toEqual(['robots_wait_for_patients']);
    const isolation = evaluateDomainAction(rb, { participant: { id: 'v', kind: 'person', roleId: 'visitor' }, action: 'enter', areaId: 'ward-a', facts: { patient_present: false, localTime: '10:00', ward_status: 'isolation' } });
    expect(ids(isolation)).toEqual(['no_visitors_in_isolation']);
    expect(evaluateDomainAction(rb, { participant: { id: 'v', kind: 'person', roleId: 'visitor' }, action: 'enter', areaId: 'ward-a', facts: { patient_present: false, localTime: '10:00', ward_status: 'quiet' } }).status).toBe('ALLOW');
    const badEnum = evaluateDomainAction(rb, { participant: med, action: 'move', areaId: 'ward-a', facts: { patient_present: false, localTime: '10:00', ward_status: 'party' } });
    expect(ids(badEnum)).toEqual(['required_facts']);
  });

  it('rejects undefined references and impossible conditions at compile time', () => {
    const t = (r: Partial<Rule>) => () => compileDomain(tiny([rule('r', { answer: 'deny' }, r)]));
    expect(t({ who: 'ghost' })).toThrow(/unknown role "ghost"/);
    expect(t({ does: 'tag:flying' })).toThrow(/action tag "flying"/);
    expect(t({ where: 'kind:robot' })).toThrow(/areas have no kind/);
    expect(t({ who: 'kind:drone' })).toThrow(/kind "drone"/);
    expect(t({ when: [{ fact: 'zzz', op: '==', value: 1 }] })).toThrow(/unknown fact "zzz"/);
    expect(t({ when: [{ fact: 'n', op: '==', value: 'two' }] })).toThrow(/must be a number/);
    expect(t({ when: [{ fact: 'flag', op: '>', value: true }] })).toThrow(/does not apply to a boolean/);
    expect(t({ when: [{ fact: 't', op: 'between', from: '25:00', to: '10:00' }] })).toThrow(/HH:MM/);
    expect(t({ when: [{ fact: 't', op: 'between', from: '10:00', to: '10:00' }] })).toThrow(/empty window/);
    expect(t({ when: [{ fact: 'n', op: '>', value: 5 }, { fact: 'n', op: '<', value: 3 }] })).toThrow(/can never all be true/);
    expect(t({ then: { answer: 'limit', limits: { warp: 9 } } })).toThrow(/unknown limit "warp"/);
    expect(t({ then: { answer: 'wait', for: 'approval', by: 'nobody' } })).toThrow(/not a declared authority, role, or role tag/);
    expect(t({ setBy: 'king' })).toThrow(/unknown authority "king"/);
    expect(t({ never: true, then: { answer: 'allow' } })).toThrow(/never rule must deny/);
    expect(() => compileDomain(tiny([rule('r', { answer: 'deny' }, { when: [{ fact: 'k', op: '==', value: 1 }] })], { facts: [{ id: 'k', type: 'number' }] }))).toThrow(/optional with no default/);
    expect(() => compileDomain(tiny([rule('r', { answer: 'deny' })], { template: 'spaceship' }))).toThrow(/Unknown template/);
  });

  it('evaluates every condition operator, including overnight windows and day sets', () => {
    const rb = compileDomain(tiny([
      rule('eq', { answer: 'deny' }, { when: [{ fact: 'n', op: '==', value: 3 }] }),
      rule('ne', { answer: 'deny' }, { does: 'look', when: [{ fact: 'mode', op: '!=', value: 'a' }] }),
      rule('gt', { answer: 'limit', limits: { speed: 0.5 } }, { when: [{ fact: 'n', op: '>', value: 5 }] }),
      rule('ge', { answer: 'limit', limits: { speed: 0.4 } }, { when: [{ fact: 'm', op: '>=', value: 2.5 }] }),
      rule('lt', { answer: 'wait', for: 'condition' }, { where: 'y', when: [{ fact: 'n', op: '<', value: 1 }] }),
      rule('le', { answer: 'wait', for: 'approval' }, { where: 'y', when: [{ fact: 'm', op: '<=', value: 0 }, { fact: 'n', op: '>=', value: 1 }] }),
      rule('in', { answer: 'deny' }, { when: [{ fact: 'mode', op: 'in', values: ['b', 'c'] }, { fact: 'flag', op: '==', value: true }] }),
      rule('night', { answer: 'deny' }, { does: 'look', when: [{ fact: 't', op: 'between', from: '22:00', to: '06:00' }] }),
      rule('weekend', { answer: 'deny' }, { does: 'look', when: [{ fact: 'day', op: 'days', days: ['sat', 'sun'] }] }),
    ]));
    const go = (facts: Record<string, unknown>, action = 'go', areaId = 'x') => evaluateDomainAction(rb, tinyReq(action, areaId, facts));
    expect(ids(go({ n: 3 }))).toEqual(['eq']);
    expect(go({ n: 2 }).status).toBe('ALLOW');
    expect(ids(go({ mode: 'b' }, 'look'))).toEqual(['ne']);
    expect(go({ mode: 'a' }, 'look').status).toBe('ALLOW');
    expect(go({ n: 6 })).toMatchObject({ status: 'LIMIT', limits: { speed: 0.5 } });
    expect(go({ n: 5 }).status).toBe('ALLOW');
    expect(go({ n: 6, m: 2.5 })).toMatchObject({ status: 'LIMIT', limits: { speed: 0.4 } });
    expect(ids(go({ n: 0 }, 'go', 'y'))).toEqual(['lt']);
    expect(ids(go({ n: 1, m: 0 }, 'go', 'y'))).toEqual(['le']);
    expect(go({ n: 1, m: 0.1 }, 'go', 'y').status).toBe('ALLOW');
    expect(ids(go({ mode: 'c', flag: true }))).toEqual(['in']);
    expect(go({ mode: 'c', flag: false }).status).toBe('ALLOW');
    expect(ids(go({ t: '23:30' }, 'look'))).toEqual(['night']);
    expect(ids(go({ t: '05:59' }, 'look'))).toEqual(['night']);
    expect(go({ t: '06:00' }, 'look').status).toBe('ALLOW');
    expect(go({ t: '21:59' }, 'look').status).toBe('ALLOW');
    expect(ids(go({ day: 'sun' }, 'look'))).toEqual(['weekend']);
    expect(go({ day: 'fri' }, 'look').status).toBe('ALLOW');
  });

  it('otherwise applies to unknown actions and is wait-for-approval when asked', () => {
    const waiting = compileDomain(tiny([rule('r', { answer: 'deny' }, { does: 'look' })], { otherwise: 'wait-for-approval' }));
    expect(evaluateDomainAction(waiting, tinyReq('fly')).status).toBe('PAUSE');
    expect(evaluateDomainAction(waiting, tinyReq('fly', 'x', { approvedBy: 'me' })).status).toBe('ALLOW');
    const denying = compileDomain(tiny([rule('r', { answer: 'deny' }, { does: 'look' })]));
    expect(ids(evaluateDomainAction(denying, tinyReq('fly')))).toEqual(['unknown_action']);
  });
});

describe('generic rulebook: authority', () => {
  const site = tiny([
    rule('h_deny', { answer: 'deny' }, { setBy: 'high', does: 'look' }),
    rule('l_allow', { answer: 'allow' }, { setBy: 'low', does: 'look', where: 'y' }),
    rule('ask_high', { answer: 'wait', for: 'approval', by: 'high' }, { setBy: 'high', does: 'go', where: 'y' }),
  ]);
  const rb = compileDomain(site);

  it('names a lower authority trying to loosen a higher one, and the lower rule has no effect', () => {
    const f = rb.findings.find(x => x.kind === 'authority-override')!;
    expect(f).toMatchObject({ severity: 'conflict', ruleIds: ['l_allow', 'h_deny'], certainty: 'certain' });
    expect(f.message).toContain('set by low');
    expect(f.message).toContain('set by high');
    expect(ids(evaluateDomainAction(rb, tinyReq('look', 'y')))).toEqual(['h_deny']);
    // The other way round is tightening: allowed, reported for information only.
    const t = compileDomain(tiny([rule('h_allow', { answer: 'allow' }, { setBy: 'high' }), rule('l_deny', { answer: 'deny' }, { setBy: 'low', where: 'y' })]));
    expect(t.findings.map(f => [f.kind, f.severity])).toEqual([['tightening', 'info']]);
    expect(() => compileDomain(t, { strict: true })).not.toThrow();
  });

  it('clears an approval wait only when the approver holds the authority the rule names', () => {
    const req = (approvedBy: unknown) => evaluateDomainAction(rb, tinyReq('go', 'y', { approvedBy }));
    expect(req(undefined).status).toBe('PAUSE');
    expect(req({ id: 'ann', authority: 'high' }).status).toBe('ALLOW');                         // sufficient
    const low = req({ id: 'bob', authority: 'low' });
    expect(low.status).toBe('PAUSE');                                                             // insufficient
    expect(low.reasons[0].reason).toMatch(/approval needs high; bob doesn't hold it/);
    const unqualified = req('carl');
    expect(unqualified.status).toBe('PAUSE');                                                     // plain string, rule names who
    expect(unqualified.reasons[0].reason).toMatch(/names no authority/);
    // A higher authority than the one named is fine; a role or role tag can be named instead.
    const three = compileDomain(tiny([rule('ask_mid', { answer: 'wait', for: 'approval', by: 'mid' })], { authorities: [{ id: 'high' }, { id: 'mid' }, { id: 'low' }] }));
    expect(evaluateDomainAction(three, tinyReq('go', 'x', { approvedBy: { id: 'ann', authority: 'high' } })).status).toBe('ALLOW');
    expect(evaluateDomainAction(three, tinyReq('go', 'x', { approvedBy: { id: 'bob', authority: 'low' } })).status).toBe('PAUSE');
    const byRole = compileDomain(tiny([rule('ask_bot', { answer: 'wait', for: 'approval', by: 'tag:lead' })], { roles: [{ id: 'bot', name: 'Bot', kind: 'robot', actions: ['go', 'look'] }, { id: 'lead', name: 'Lead', kind: 'person', actions: [], tags: ['lead'] }] }));
    expect(evaluateDomainAction(byRole, tinyReq('go', 'x', { approvedBy: { id: 'lee', roleId: 'lead' } })).status).toBe('ALLOW');
    expect(evaluateDomainAction(byRole, tinyReq('go', 'x', { approvedBy: { id: 'lee', roleId: 'bot' } })).status).toBe('PAUSE');
  });

  it('every check says who set the rule, and the rendering shows authorities', () => {
    const d = evaluateDomainAction(rb, tinyReq('look', 'x'));
    expect(d.reasons).toEqual([{ ruleId: 'h_deny', status: 'BLOCK', reason: 'h_deny', setBy: 'high' }]);
    const text = renderDomainRules(rb);
    expect(text).toContain('## Authorities (highest first)');
    expect(text).toContain('(set by high;');
    expect(() => compileDomain(tiny([{ ...rule('x', { answer: 'deny' }), setBy: undefined } as never]))).toThrow(/setBy is required/);
  });
});

describe('generic rulebook: rules at odds', () => {
  const kinds = (input: CompileDomainInput) => checkRulebook(input).map(f => `${f.kind}:${f.certainty}:${f.ruleIds.join('+')}`);

  it('finds a contradiction at the same authority, says who never takes effect, and gives a witness request that matches both rules', () => {
    const certain = tiny([rule('yes', { answer: 'allow' }), rule('no', { answer: 'deny' }, { where: 'y' })]);
    expect(kinds(certain)).toEqual(['contradiction:certain:yes+no']);
    const f = checkRulebook(certain)[0];
    expect(f.severity).toBe('conflict');
    expect(f.message).toContain('`yes` never takes effect there');
    expect(f.message).toContain('every role · every action · Y, always');
    expect(f.witness).toEqual({ participant: { id: 'bot-1', kind: 'robot', roleId: 'bot' }, action: 'go', areaId: 'y', facts: { n: 0, t: '00:00', day: 'mon' } });
    // Conditions on two independent facts (n == 0 and m > 0) can both hold: the analysis is exact, so it is certain, with the smallest values as the witness.
    const partial = tiny([
      rule('yes', { answer: 'allow' }, { when: [{ fact: 'n', op: '==', value: 0 }] }),
      rule('wait', { answer: 'wait', for: 'condition' }, { when: [{ fact: 'm', op: '>', value: 0 }] }),
    ]);
    expect(kinds(partial)).toEqual(['contradiction:certain:yes+wait']);
    const p = checkRulebook(partial)[0];
    expect(p.severity).toBe('warning');
    expect(p.message).toContain('`yes` never takes effect there');
    expect(p.witness?.facts).toEqual({ n: 0, m: 1, t: '00:00', day: 'mon' });
    expect(matchingRules(compileDomain(partial), p.witness!)).toEqual(['yes', 'wait']);
    // A rule on history is not analysed: the overlap on facts is real, the certainty is "possible", and there is no witness.
    const onHistory = tiny([
      rule('yes', { answer: 'allow' }),
      rule('too_many', { answer: 'deny' }, { history: [{ actions: 'look', op: '>=', value: 3 }] }),
    ]);
    expect(kinds(onHistory)).toEqual(['contradiction:possible:yes+too_many']);
    expect(checkRulebook(onHistory)[0].witness).toBeUndefined();
    expect(checkRulebook(onHistory)[0].message).toMatch(/possible, not proven/);
  });

  it('finds shadowed, duplicate and limit disagreements', () => {
    expect(kinds(tiny([rule('big', { answer: 'deny' }), rule('small', { answer: 'wait', for: 'approval' }, { where: 'y', when: [{ fact: 'n', op: '>', value: 2 }] })]))).toEqual(['shadowed:certain:small+big']);
    expect(kinds(tiny([rule('a', { answer: 'deny' }, { does: 'look' }), rule('b', { answer: 'deny' }, { does: 'look' })]))).toEqual(['duplicate:certain:a+b']);
    expect(kinds(tiny([rule('a', { answer: 'deny' }), rule('b', { answer: 'deny' }, { does: 'look', where: 'y' })]))).toEqual(['duplicate:certain:b+a']);
    const limits = tiny([
      rule('fast', { answer: 'limit', limits: { speed: 1 } }, { where: 'x', when: [{ fact: 'n', op: '<', value: 5 }] }),
      rule('slow', { answer: 'limit', limits: { speed: 0.5 } }, { when: [{ fact: 'n', op: '>', value: 2 }] }),
    ]);
    expect(kinds(limits)).toEqual(['limit_disagreement:certain:fast+slow']);
    expect(checkRulebook(limits)[0].message).toContain('The lower value applies');
    expect(checkRulebook(limits)[0].witness?.facts.n).toBe(3);
    // A stricter special case of a looser rule is layering, not a finding.
    expect(kinds(tiny([rule('site', { answer: 'limit', limits: { speed: 1 } }), rule('near', { answer: 'limit', limits: { speed: 0.3 } }, { when: [{ fact: 'n', op: '>', value: 0 }] })]))).toEqual([]);
    expect(kinds(tiny([rule('deny', { answer: 'deny' }, { where: 'y' }), rule('wait', { answer: 'wait', for: 'condition' }, { when: [{ fact: 'n', op: '>', value: 0 }] })]))).toEqual([]);
  });

  it('finds a rule that tries to allow what a never rule forbids', () => {
    const f = checkRulebook(tiny([rule('inv', { answer: 'deny' }, { never: true, when: [{ fact: 'flag', op: '==', value: true }] }), rule('ok', { answer: 'allow' }, { does: 'go' })]));
    expect(f.map(x => x.kind)).toEqual(['never_vs_rule']);
    expect(f[0].message).toContain('Nothing overrides a never rule');
  });

  it('is sound: provably disjoint rules are not reported, and the compiled rulebook carries its findings', () => {
    // Each pair is an allow and a deny on the same scope whose conditions can never both hold.
    const pairs: Array<[Rule['when'], Rule['when']]> = [
      [[{ fact: 'n', op: '<', value: 3 }], [{ fact: 'n', op: '>=', value: 3 }]],
      [[{ fact: 'n', op: '!=', value: 2 }], [{ fact: 'n', op: '==', value: 2 }]],
      [[{ fact: 'n', op: 'in', values: [1, 2] }], [{ fact: 'n', op: 'in', values: [3, 4] }]],
      [[{ fact: 't', op: 'between', from: '09:00', to: '12:00' }], [{ fact: 't', op: 'between', from: '12:00', to: '09:00' }]],
      [[{ fact: 't', op: 'between', from: '22:00', to: '06:00' }], [{ fact: 't', op: '>=', value: '06:00' }, { fact: 't', op: '<', value: '22:00' }]],
      [[{ fact: 'day', op: 'days', days: ['sat'] }], [{ fact: 'day', op: 'days', days: ['mon', 'tue'] }]],
      [[{ fact: 'flag', op: '==', value: true }], [{ fact: 'flag', op: '==', value: false }]],
      [[{ fact: 'mode', op: 'in', values: ['a'] }], [{ fact: 'mode', op: 'in', values: ['b', 'c'] }]],
      [[{ fact: 'mode', op: '!=', value: 'a' }], [{ fact: 'mode', op: '==', value: 'a' }]],
      // Integers: n > 2 and n < 3 cannot both hold.
      [[{ fact: 'n', op: '>', value: 2 }], [{ fact: 'n', op: '<', value: 3 }]],
      // Different facts, one side impossible to share: n >= 3 on sat vs n < 3 on sat.
      [[{ fact: 'day', op: 'days', days: ['sat'] }, { fact: 'n', op: '>=', value: 3 }], [{ fact: 'day', op: 'days', days: ['sat'] }, { fact: 'n', op: '<', value: 3 }]],
    ];
    for (const [whenA, whenB] of pairs) {
      expect(kinds(tiny([rule('a', { answer: 'allow' }, { when: whenA }), rule('b', { answer: 'deny' }, { when: whenB })])), JSON.stringify([whenA, whenB])).toEqual([]);
    }
    // Move one boundary and the overlap appears, with the shared value as the witness.
    const touching = tiny([rule('a', { answer: 'allow' }, { when: [{ fact: 'n', op: '<=', value: 3 }] }), rule('b', { answer: 'deny' }, { when: [{ fact: 'n', op: '>=', value: 3 }] })]);
    expect(kinds(touching)).toEqual(['contradiction:certain:a+b']);
    expect(checkRulebook(touching)[0].witness?.facts.n).toBe(3);
    // Exactness on integers: every whole number in a range excluded is empty, and the gap between two reals is not.
    expect(kinds(tiny([rule('a', { answer: 'allow' }, { when: [{ fact: 'n', op: '>=', value: 1 }, { fact: 'n', op: '<=', value: 2 }, { fact: 'n', op: '!=', value: 1 }] }), rule('b', { answer: 'deny' }, { when: [{ fact: 'n', op: '!=', value: 2 }] })]))).toEqual([]);
    expect(kinds(tiny([rule('a', { answer: 'allow' }, { when: [{ fact: 'm', op: '>', value: 1 }, { fact: 'm', op: '<', value: 2 }] }), rule('b', { answer: 'deny' }, { when: [{ fact: 'm', op: '!=', value: 1.5 }] })]))).toEqual(['contradiction:certain:a+b']);
    const compiled = compileDomain(touching);
    expect(compiled.findings).toEqual(checkRulebook(touching));
    expect(Object.isFrozen(compiled.findings)).toBe(true);
  });

  it('strict mode throws on a conflict, with the findings in the message', () => {
    const conflicting = tiny([rule('yes', { answer: 'allow' }), rule('no', { answer: 'deny' })]);
    expect(() => compileDomain(conflicting)).not.toThrow();
    expect(() => compileDomain(conflicting, { strict: true })).toThrow(/Rules at odds \(1\)/);
    const warningOnly = tiny([rule('yes', { answer: 'allow' }), rule('w', { answer: 'wait', for: 'approval' })]);
    expect(() => compileDomain(warningOnly, { strict: true })).not.toThrow();
  });

  it('the grocery example reports the manager\'s deliberate conflicts', () => {
    const f = grocery.rulebook.findings;
    expect(f.map(x => [x.kind, x.severity, x.ruleIds])).toEqual([
      ['tightening', 'info', ['robot_speed', 'checkout_speed']],
      ['authority-override', 'conflict', ['shopper_photos_entrance', 'glasses_capture']],
      ['contradiction', 'conflict', ['staff_audio_back_room', 'no_audio_back_room_lunch']],
    ]);
    expect(f[1].message).toContain('A lower authority can only tighten');
  });
});

describe('generic rulebook: drafting from plain words', () => {
  const rb = grocery.rulebook;
  const draft = (text: string) => draftRuleFromText(text, rb, { setBy: 'site-manager', id: 'd' });

  it('turns common forms into rules using the rulebook\'s own vocabulary, never adding them', () => {
    const a = draft('no restock robots in aisle 3 on Saturdays between 14:00 and 16:00');
    expect(a.draft).toMatchObject({ who: ['restock_robot'], does: '*', where: ['aisle-3'], then: { answer: 'deny' }, setBy: 'site-manager', source: { kind: 'text' } });
    expect(a.draft!.when).toEqual([{ fact: 'localTime', op: 'between', from: '14:00', to: '16:00' }, { fact: 'day', op: 'days', days: ['sat'] }]);
    expect(a.unmatched).toEqual([]);
    expect(a.confidence).toBe(1);

    const b = draft('robots slow to 0.3 m/s in checkout');
    expect(b.draft).toMatchObject({ who: ['kind:robot'], does: 'tag:movement', where: ['checkout'], then: { answer: 'limit', limits: { maxSpeedMps: 0.3 } } });

    const c = draft('shoppers may not take photos');
    expect(c.draft).toMatchObject({ who: ['shopper'], does: ['camera_capture'], where: '*', then: { answer: 'deny' } });

    const d = draft('robots wait for staff approval to enter the electrical room');
    expect(d.draft).toMatchObject({ who: ['kind:robot'], does: ['enter_zone'], where: ['electrical'], then: { answer: 'wait', for: 'approval', by: 'tag:staff' } });

    const e = draft('robots wait while people are present in the back room');
    expect(e.draft).toMatchObject({ where: ['back-room'], when: [{ fact: 'peopleInZone', op: '>', value: 0 }], then: { answer: 'wait', for: 'condition' } });

    const f = draft('cleaning robots may dock after 22:00 when emergency is not active');
    expect(f.draft).toMatchObject({ who: ['cleaning_robot'], does: ['dock'], then: { answer: 'allow' } });
    expect(f.draft!.when).toEqual(expect.arrayContaining([{ fact: 'localTime', op: '>=', value: '22:00' }, { fact: 'emergency', op: '==', value: false }]));

    expect(rb.rules.some(r => r.id === 'd')).toBe(false);
    // Without setBy the draft says so, and compile would refuse it.
    const noAuthority = draftRuleFromText('shoppers may not take photos', rb);
    expect(noAuthority.notes.join(' ')).toMatch(/Say who sets this rule \(setBy\)/);
    expect(noAuthority.ready).toBe(false);
    // An AI agent holding the declared "agent" authority drafts a ready rule, recorded as its own.
    const byAgent = draftRuleFromText('robots slow to 0.2 m/s in checkout', rb, { setBy: 'agent', source: 'agent', author: 'planner-7', id: 'ag' });
    expect(byAgent.ready).toBe(true);
    expect(byAgent.draft).toMatchObject({ setBy: 'agent', source: { kind: 'agent', ref: 'planner-7: robots slow to 0.2 m/s in checkout' } });
  });

  it('says plainly when text cannot be turned into a rule, and lowers confidence for words it could not place', () => {
    const miss = draft('please be nice to the customers');
    expect(miss.draft).toBeNull();
    expect(miss.confidence).toBe(0);
    expect(miss.notes.join(' ')).toMatch(/Could not find what the rule decides/);
    // 0.5.3: "no dancing" names something that is not a declared action; a rule denying every action is not what it says, so nothing is drafted.
    const vague = draft('no dancing');
    expect(vague.draft).toBeNull();
    expect(vague.unmatched).toEqual(['dancing']);
    expect(vague.notes.join(' ')).toMatch(/No declared action matches "dancing"/);
    expect(draft('robots at most 9 km/h in checkout').notes.join(' ')).toMatch(/declares no matching limit/);
  });

  it('builds a prompt for the operator\'s own model and validates its answer; the model never sets the authority', () => {
    const prompt = buildRuleDraftPrompt('no photos in the restroom', rb);
    expect(prompt).toContain('camera_capture');
    expect(prompt).toContain('restroom');
    expect(prompt).toContain('Answer with JSON only');
    const good = parseRuleDraft('```json\n{"rule":{"id":"no_photos_restroom","text":"No photos in the restroom.","who":"*","does":"camera_capture","where":"restroom","then":{"answer":"deny"},"setBy":"law-and-safety"}}\n```', rb, { setBy: 'site-manager' });
    expect(good.draft).toMatchObject({ id: 'no_photos_restroom', setBy: 'site-manager', source: { kind: 'text' } });
    expect(good.errors).toEqual(['The model tried to set "setBy"; ignored — the caller sets the authority, from the level the space granted the author.']);
    expect(parseRuleDraft('not json', rb, { setBy: 'site-manager' }).errors).toEqual(['The answer is not valid JSON.']);
    expect(parseRuleDraft({ error: 'there is no "laser" action' }, rb, { setBy: 'site-manager' }).errors[0]).toMatch(/no "laser" action/);
    const bad = parseRuleDraft({ rule: { id: 'x', text: 'x', who: 'martian', does: '*', where: '*', then: { answer: 'deny' } } }, rb, { setBy: 'site-manager' });
    expect(bad.draft).toBeNull();
    expect(bad.errors[0]).toMatch(/unknown role "martian"/);
    const badThen = parseRuleDraft({ rule: { id: 'x', text: 'x', who: '*', does: '*', where: '*', then: { answer: 'maybe' } } }, rb, { setBy: 'site-manager' });
    expect(badThen.errors[0]).toMatch(/then.answer must be/);
  });

  it('the builder drafts with its current authority and adds only what is confirmed', () => {
    const b = new DomainRulesBuilder({ id: 's', name: 'S', hours: { open: '08:00', close: '20:00' } })
      .fromTemplate('grocery-store')
      .area({ id: 'a', name: 'Floor', tags: ['public'] })
      .role({ id: 'bot', name: 'Bot', kind: 'robot', actions: ['move'] })
      .role({ id: 'guest', name: 'Guest', kind: 'person', actions: ['camera_capture'] });
    const d = b.as('staff').addRuleFromText('guests may not take photos', { id: 'g' });
    expect(d.draft!.setBy).toBe('staff');
    expect(b.compile().rules.some(r => r.id === 'g')).toBe(false);
    b.confirm(d);
    expect(b.compile().rules.find(r => r.id === 'g')).toMatchObject({ setBy: 'staff', source: { kind: 'text', ref: 'guests may not take photos' } });
    expect(() => b.confirm(draftRuleFromText('be nice', b.compile()))).toThrow(/no draft to confirm/);
    // The company's default answer already blocks capture, so the staff rule adds nothing — said as info, not hidden.
    expect(b.check().filter(f => f.kind !== 'unmatched_selector').map(f => [f.kind, f.severity, f.ruleIds])).toEqual([['duplicate', 'info', ['g', 'glasses_capture']]]);
    // 0.5.3: template rules on area tags this small site does not carry (dock, restricted, …) are named, one warning per rule, never silent.
    expect(b.check().filter(f => f.kind === 'unmatched_selector').every(f => f.severity === 'warning' && f.ruleIds.length === 1 && !f.witness)).toBe(true);
  });
});

// ─── 0.5: whole plans on projected facts, history conditions ────────────────

describe('plans: an AI planner proposes, the rulebook checks every step on projected facts', () => {
  // A tiny site with effects: `pick` loads the robot, `drop` unloads it, `go` moves it; a never rule and a plan rule.
  const planSite = (extraRules: Array<Omit<Rule, 'source' | 'setBy'> & { setBy?: string }> = []): CompileDomainInput => tiny([
    rule('no_load_in_y', { answer: 'deny', instead: 'drop' }, { does: 'go', where: 'y', when: [{ fact: 'loaded', op: '==', value: true }] }),
    rule('ask_before_look', { answer: 'wait', for: 'approval', by: 'high' }, { does: 'look' }),
    ...extraRules,
  ], {
    actions: [
      { id: 'go', kinds: ['robot'], tags: ['movement'], effects: [{ op: 'move' }] },
      { id: 'look', kinds: ['robot'] },
      { id: 'pick', kinds: ['robot'], effects: [{ op: 'set', fact: 'loaded', value: true }, { op: 'add', fact: 'n', value: 1 }] },
      { id: 'drop', kinds: ['robot'], effects: [{ op: 'set', fact: 'loaded', value: false }] },
    ],
    facts: [
      { id: 'n', type: 'number', integer: true, min: 0, max: 2, required: true },
      { id: 'm', type: 'number', min: 0, default: 0 },
      { id: 't', type: 'time', required: true },
      { id: 'mode', type: 'enum', values: ['a', 'b', 'c'], default: 'a' },
      { id: 'flag', type: 'boolean', default: false },
      { id: 'day', type: 'day', required: true },
      { id: 'loaded', type: 'boolean', default: false },
    ],
    roles: [{ id: 'bot', name: 'Bot', kind: 'robot', actions: ['go', 'look', 'pick', 'drop'] }],
    planRules: [
      { id: 'end_in_x', text: 'Every plan ends in X.', who: '*', check: { kind: 'ends_in', areas: 'x' }, setBy: 'high', source: { kind: 'manual', ref: 'end_in_x' } },
      { id: 'look_before_pick', text: 'Look before you pick, in the same area.', who: 'bot', check: { kind: 'before', first: 'look', then: 'pick', sameArea: true }, setBy: 'low', source: { kind: 'manual', ref: 'look_before_pick' } },
      { id: 'one_pick', text: 'At most one pick per plan.', who: '*', check: { kind: 'at_most', actions: 'pick', count: 1 }, setBy: 'low', source: { kind: 'manual', ref: 'one_pick' } },
    ],
  });
  const bot = { id: 'b', kind: 'robot', roleId: 'bot' };
  const start = { n: 0, t: '10:00', day: 'mon' };

  it('projects declared effects step by step and rejects at the first step a rule refuses, naming rule, reason and authority', () => {
    const rb = compileDomain(planSite());
    // pick in x (loaded := true), then go to y while loaded: refused at step 2 (index 1) by the manager's rule, with its instead hint.
    const v1 = evaluatePlan(rb, { participant: bot, initialFacts: start, steps: [{ action: 'look', area: 'x', facts: { approvedBy: { id: 'ann', authority: 'high' } } }, { action: 'pick' }, { action: 'go', area: 'y' }, { action: 'drop' }] });
    expect(v1.status).toBe('BLOCK');
    expect(v1.steps.map(s => s.decision.status)).toEqual(['ALLOW', 'ALLOW', 'BLOCK']);     // nothing is projected past the refusal
    expect(v1.steps[2].facts.loaded).toBe(true);
    expect(v1.steps[2].decision.then).toBe('drop');
    expect(v1.firstViolation).toEqual({ stepIndex: 2, ruleId: 'no_load_in_y', reason: expect.any(String), setBy: 'high', from: 'step' });
    expect(v1.planChecks.map(c => `${c.ruleId}:${c.status}`)).toEqual(['end_in_x:BLOCK', 'look_before_pick:ALLOW', 'one_pick:ALLOW']);
    expect(v1.finalArea).toBe('y');
    expect(v1.fingerprint).toBe(rb.fingerprint);
    expect(v1.planDigest).toMatch(/^[0-9a-f]{64}$/);
    // Same plan, dropped before moving and back to x at the end: every step passes, the count fact went up by the pick.
    const v2 = evaluatePlan(rb, { participant: bot, initialFacts: start, steps: [{ action: 'look', area: 'x', facts: { approvedBy: { id: 'ann', authority: 'high' } } }, { action: 'pick' }, { action: 'drop' }, { action: 'go', area: 'y' }, { action: 'go', area: 'x' }] });
    expect(v2.status).toBe('ALLOW');
    expect(v2.steps).toHaveLength(5);
    expect(v2.finalFacts).toMatchObject({ n: 1, loaded: false });
    expect(v2.finalArea).toBe('x');
    expect(v2.firstViolation).toBeUndefined();
  });

  it('plan rules judge the whole plan: what comes before what, how many, where it ends; a PAUSE collects the approvals a planner needs up front', () => {
    const rb = compileDomain(planSite());
    const r = evaluatePlan(rb, { participant: bot, initialFacts: start, steps: [{ action: 'pick', area: 'x' }, { action: 'drop' }, { action: 'look' }, { action: 'pick' }, { action: 'go', area: 'y' }] });
    expect(r.status).toBe('BLOCK');
    expect(r.planChecks.filter(c => c.status === 'BLOCK').map(c => `${c.ruleId}@${c.setBy}#${c.stepIndex}`)).toEqual(['end_in_x@high#4', 'look_before_pick@low#0', 'one_pick@low#3']);
    expect(r.firstViolation?.ruleId).toBe('look_before_pick');
    expect(r.firstViolation?.from).toBe('plan');
    // The steps themselves: the look needs an approval (listed so the planner can get it signed first); the second pick loads the robot, so the move to y is refused.
    expect(r.steps.map(s => s.decision.status)).toEqual(['ALLOW', 'ALLOW', 'PAUSE', 'ALLOW', 'BLOCK']);
    expect(r.approvalRequests.map(a => `${a.ruleId}@${a.by}`)).toEqual(['ask_before_look@high']);
    // History before the plan counts for "before"; a plan that ends on a step with no move effect stays where it was.
    const withHistory = evaluatePlan(rb, { participant: bot, initialFacts: start, history: [{ action: 'look', areaId: 'x' }], steps: [{ action: 'pick', area: 'x' }, { action: 'drop' }] });
    expect(withHistory.status).toBe('ALLOW');
    expect(withHistory.finalArea).toBe('x');
  });

  it('a projected fact outside its declared range is a refusal, never a guess; a malformed plan is BLOCK, never a throw; the clock advances per step', () => {
    const rb = compileDomain(planSite());
    const approved = { approvedBy: { id: 'ann', authority: 'high' } };
    // n has max 2: the second pick pushes it to 3, and the step after it is refused as required_facts (the plan as described cannot happen).
    const r = evaluatePlan(rb, { participant: bot, initialFacts: { ...start, n: 1 }, steps: [{ action: 'look', area: 'x', facts: approved }, { action: 'pick' }, { action: 'drop' }, { action: 'pick' }, { action: 'drop' }, { action: 'pick' }] });
    expect(r.steps.map(s => s.decision.status)).toEqual(['ALLOW', 'ALLOW', 'ALLOW', 'ALLOW', 'BLOCK']);
    expect(r.steps[4].decision.reasons[0].ruleId).toBe('required_facts');
    expect(r.steps[4].facts.n).toBe(3);
    expect(evaluatePlan(rb, { participant: bot, initialFacts: start, steps: [] }).firstViolation?.ruleId).toBe('required_facts');
    expect(evaluatePlan(rb, { participant: bot, initialFacts: start, steps: [{ action: 'look' }] }).status).toBe('BLOCK');
    expect(evaluatePlan(rb, { participant: bot, initialFacts: start, clock: 'nope', steps: [{ action: 'look', area: 'x' }] }).status).toBe('BLOCK');
    const timed = evaluatePlan(compileDomain(planSite([rule('no_night', { answer: 'deny' }, { when: [{ fact: 't', op: 'between', from: '22:00', to: '06:00' }] })])), {
      participant: bot, initialFacts: start, clock: 't', startTime: '21:58', stepDurationSeconds: 90, steps: [{ action: 'drop', area: 'x' }, { action: 'drop' }, { action: 'drop' }],
    });
    expect(timed.steps.map(s => `${s.facts.t}:${s.decision.status}`)).toEqual(['21:58:ALLOW', '21:59:ALLOW', '22:01:BLOCK']);
  });

  it('rejects effects and plan rules that name what the site did not declare', () => {
    expect(() => compileDomain(planSite([]), {})).not.toThrow();
    const bad = (patch: (i: CompileDomainInput) => void, re: RegExp) => { const i = planSite(); patch(i); expect(() => compileDomain(i)).toThrow(re); };
    bad(i => { i.actions![2].effects = [{ op: 'set', fact: 'nope', value: 1 }]; }, /unknown fact "nope"/);
    bad(i => { i.actions![2].effects = [{ op: 'add', fact: 'loaded', value: 1 }]; }, /applies to number facts/);
    bad(i => { i.actions![2].effects = [{ op: 'set', fact: 'n', value: 1.5 }]; }, /whole number/);
    bad(i => { i.planRules![0].check = { kind: 'ends_in', areas: 'roof' }; }, /unknown area "roof"/);
    bad(i => { i.planRules![0].setBy = 'king'; }, /unknown authority "king"/);
    bad(i => { i.planRules![2].check = { kind: 'at_most', actions: 'pick', count: -1 }; }, /whole number, 0 or more/);
    bad(i => { i.planRules![1].id = 'no_load_in_y'; }, /declared twice/);
    const rb = compileDomain(planSite());
    expect(rb.planRules).toHaveLength(3);
    expect(renderDomainRules(rb)).toContain('## Plan rules');
    expect(renderDomainRules(rb)).toContain('loaded := true');
    expect(checkRulebook(compileDomain({ ...planSite(), planRules: [...planSite().planRules!, { ...planSite().planRules![2], id: 'one_pick_again' }] })).map(f => `${f.kind}:${f.ruleIds.join('+')}`)).toContain('duplicate:one_pick+one_pick_again');
  });
});

describe('history conditions: what the participant did recently, as the caller reports it', () => {
  const site = tiny([
    rule('five_looks_an_hour', { answer: 'deny' }, { does: 'look', history: [{ actions: 'look', withinMinutes: 60, op: '>=', value: 5 }] }),
    rule('not_right_after_go', { answer: 'wait', for: 'condition' }, { does: 'look', history: [{ actions: 'go', sameArea: true, withinMinutes: 15, op: '>=', value: 1 }] }),
  ]);
  const rb = compileDomain(site);
  const stamp = (m: number, day = '2026-10-13') => `${day}T${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}:00Z`;
  const looks = (n: number, from = 9 * 60) => Array.from({ length: n }, (_, i) => ({ action: 'look', areaId: 'x', at: stamp(from + i) }));
  const at = (m: number, r: DomainRequest): DomainRequest => ({ ...r, now: stamp(m) });

  it('counts matching entries in the window before now, on absolute time; missing history or now is required_facts, never permission', () => {
    expect(ids(evaluateDomainAction(rb, at(600, { ...tinyReq('look'), history: looks(4) })))).toEqual(['role_permits_action']);
    expect(ids(evaluateDomainAction(rb, at(600, { ...tinyReq('look'), history: looks(5) })))).toEqual(['five_looks_an_hour']);
    // Five looks, but the oldest is outside the hour: four count.
    expect(evaluateDomainAction(rb, at(605, { ...tinyReq('look', 'x', { t: '10:05' }), history: looks(5) })).status).toBe('ALLOW');
    // Overnight: 23:55 yesterday then 00:03 today is eight minutes later.
    expect(evaluateDomainAction(rb, at(3, { ...tinyReq('look', 'x', { t: '00:03' }), history: [{ action: 'go', areaId: 'x', at: stamp(23 * 60 + 55, '2026-10-12') }] })).status).toBe('PAUSE');
    expect(evaluateDomainAction(rb, at(3, { ...tinyReq('look', 'x', { t: '00:03' }), history: [{ action: 'go', areaId: 'y', at: stamp(23 * 60 + 55, '2026-10-12') }] })).status).toBe('ALLOW');
    // The midnight bug of /2: 09:50 YESTERDAY is not ten minutes before 10:00 today.
    expect(evaluateDomainAction(rb, at(600, { ...tinyReq('look', 'x', { t: '10:00' }), history: [{ action: 'go', areaId: 'x', at: stamp(590, '2026-10-12') }] })).status).toBe('ALLOW');
    expect(evaluateDomainAction(rb, at(600, { ...tinyReq('look', 'x', { t: '10:00' }), history: [{ action: 'go', areaId: 'x', at: stamp(590) }] })).status).toBe('PAUSE');
    const missing = evaluateDomainAction(rb, at(600, tinyReq('look')));
    expect(missing.status).toBe('BLOCK');
    expect(missing.reasons[0].ruleId).toBe('required_facts');
    expect(missing.reasons[0].reason).toContain('history is required');
    // No now, with a window in scope: incomplete.
    expect(evaluateDomainAction(rb, { ...tinyReq('look'), history: looks(4) }).reasons[0].reason).toContain('now is required');
    // An entry without a time, or with a /2 "HH:MM" time (no date), when a rule uses a window, is incomplete.
    expect(evaluateDomainAction(rb, at(600, { ...tinyReq('look'), history: [{ action: 'look', areaId: 'x' }] })).reasons[0].ruleId).toBe('required_facts');
    expect(evaluateDomainAction(rb, at(600, { ...tinyReq('look'), history: [{ action: 'look', areaId: 'x', at: '09:45' }] })).reasons[0].reason).toContain('timestamp with a date');
    // A request the history rules do not reach (action go) needs no history at all.
    expect(evaluateDomainAction(rb, tinyReq('go')).status).toBe('ALLOW');
  });

  it('rejects history conditions that are not declared exactly, including the /2 clock', () => {
    const bad = (history: unknown, re: RegExp) => expect(() => compileDomain(tiny([rule('r', { answer: 'deny' }, { history: history as Rule['history'] })]))).toThrow(re);
    bad([{ actions: 'fly', op: '>=', value: 1 }], /unknown action "fly"/);
    bad([{ actions: 'go', withinMinutes: 10, clock: 't', op: '>=', value: 1 }], /clock was removed in robot-domain-rules\/3/);
    bad([{ actions: 'go', withinMinutes: 0, op: '>=', value: 1 }], /between 1 and 1440/);
    bad([{ actions: 'go', op: '>=', value: 1.5 }], /whole number/);
    bad([{ actions: 'go', op: '~', value: 1 }], /history op/);
  });

  it('parses timestamps deterministically: no offset is UTC, offsets apply, calendar nonsense is refused', () => {
    expect(parseTimestamp('2026-10-12T10:00')).toBe(Date.UTC(2026, 9, 12, 10, 0));
    expect(parseTimestamp('2026-10-12T12:00:00+02:00')).toBe(Date.UTC(2026, 9, 12, 10, 0));
    expect(parseTimestamp('2026-10-12T09:30:15.250Z')).toBe(Date.UTC(2026, 9, 12, 9, 30, 15, 250));
    for (const bad of ['10:00', '2026-02-30T10:00', '2026-13-01T10:00', '2026-10-12T24:00', '2026-10-12 10:00', 12, null]) expect(parseTimestamp(bad)).toBeNull();
  });
});

// ─── 0.4: soundness of the conflict check, under a seeded random generator ──

describe('backtest: what a rulebook would have decided for recorded activity', () => {
  it('replays the grocery day deterministically, names the rules that never fired, and refuses a malformed log or a comparison across different logs', () => {
    const events = grocery.day.map(([, request], i) => ({ at: `2026-10-05T${String(9 + i).padStart(2, '0')}:00`, request, ...(i % 2 ? { outcome: 'happened' as const } : {}) }));
    const a = backtest(grocery.rulebook, events), b = backtest(grocery.rulebook, events);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    expect(a.fingerprint).toBe(grocery.rulebook.fingerprint);
    expect(a.totals.ALLOW + a.totals.LIMIT + a.totals.PAUSE + a.totals.BLOCK + a.totals.missingFacts).toBe(events.length);
    expect(a.neverFired).toContain('no_carrying_through_checkout');
    expect(a.rows.map(r => r.status)).toEqual(events.map(e => evaluateDomainAction(grocery.rulebook, e.request).status));
    expect(a.conflictsOccurred.map(c => c.ruleIds.join('+'))).toContain('shopper_photos_entrance+glasses_capture');
    expect(a.differences.every(d => d.outcome === 'happened' && (d.status === 'BLOCK' || d.status === 'PAUSE'))).toBe(true);
    expect(compareBacktests(a, b).changed).toBe(0);
    expect(() => compareBacktests(a, backtest(grocery.rulebook, events.slice(1)))).toThrow(DomainRulesError);
    expect(() => backtest(grocery.rulebook, [{ at: '', request: events[0].request }])).toThrow(DomainRulesError);
    expect(() => backtest(grocery.rulebook, [{ at: '09:00', request: events[0].request }])).toThrow(/timestamp with a date/);
    expect(() => backtest(grocery.rulebook, events, { clock: 'peopleInZone' } as unknown as { examples: number })).toThrow(/clock option was removed/);
  });

  it('builds each participant\'s history from the earlier events of the same log, timed by each event\'s at, and never from another participant', () => {
    const rb = compileDomain({
      site: { id: 's', name: 'S' }, authorities: [{ id: 'site' }],
      actions: [{ id: 'scan', kinds: ['robot'] }], facts: [{ id: 'time', type: 'time', required: true }],
      areas: [{ id: 'a', name: 'A' }], roles: [{ id: 'bot', name: 'Bot', kind: 'robot', actions: ['scan'] }],
      rules: [{ id: 'two_scans_an_hour', text: 'two', who: '*', does: 'scan', where: '*', history: [{ actions: 'scan', withinMinutes: 60, op: '>=', value: 2 }], then: { answer: 'wait', for: 'condition' }, setBy: 'site', source: { kind: 'manual', ref: 'x' } }],
    });
    const scan = (id: string, time: string, day = '2026-10-05') => ({ at: `${day}T${time}`, request: { participant: { id, kind: 'robot', roleId: 'bot' }, action: 'scan', areaId: 'a', facts: { time } } });
    const r = backtest(rb, [scan('r-1', '09:00'), scan('r-2', '09:10'), scan('r-1', '09:20'), scan('r-1', '09:30'), scan('r-1', '10:25'), scan('r-1', '09:50', '2026-10-06')]);
    // The last scan is the next day at 09:50: on absolute time nothing of the day before is within the hour.
    expect(r.rows.map(x => x.status)).toEqual(['ALLOW', 'ALLOW', 'ALLOW', 'PAUSE', 'ALLOW', 'ALLOW']);
    expect(r.wouldStall).toEqual([{ ruleId: 'two_scans_an_hour', setBy: 'site', status: 'PAUSE', count: 1, examples: ['2026-10-05T09:30'] }]);
  });
});

describe('conflict check exactness: "disjoint" is never a lie, and every witness is real', () => {
  it('whenever the checker reports no overlap, no generated request matches both; whenever it reports one, its witness matches both', () => {
    // A small deterministic PRNG (mulberry32) so a failure is reproducible from the seed.
    let seed = 0x5eed2026;
    const rnd = () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
    const pick = <T,>(xs: readonly T[]): T => xs[Math.floor(rnd() * xs.length)];
    const int = (lo: number, hi: number) => lo + Math.floor(rnd() * (hi - lo + 1));
    const hhmm = () => `${String(int(0, 23)).padStart(2, '0')}:${String(pick([0, 15, 30, 45])).padStart(2, '0')}`;
    const days = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const;
    const modes = ['a', 'b', 'c'];
    const condition = (): Condition => {
      switch (int(0, 7)) {
        case 0: return { fact: 'n', op: pick(['==', '!=', '>', '>=', '<', '<='] as const), value: int(0, 6) };
        case 1: return { fact: 'n', op: 'in', values: [int(0, 6), int(0, 6)] };
        case 2: return { fact: 'm', op: pick(['>', '>=', '<', '<='] as const), value: int(0, 8) / 2 };
        case 3: return { fact: 't', op: 'between', from: hhmm(), to: hhmm() };
        case 4: return { fact: 't', op: pick(['>=', '<'] as const), value: hhmm() };
        case 5: return { fact: 'day', op: 'days', days: [pick(days), pick(days)] };
        case 6: return pick([true, false]) ? { fact: 'mode', op: pick(['==', '!='] as const), value: pick(modes) } : { fact: 'mode', op: 'in', values: [pick(modes), pick(modes)] };
        default: return { fact: 'flag', op: '==', value: pick([true, false]) };
      }
    };
    const selector = (ids: string[]): Rule['who'] => (rnd() < 0.4 ? '*' : [pick(ids)]);
    // Always an allow against a deny: when those overlap the checker MUST report a contradiction, so "no finding" is a claim of provable disjointness.
    const randomRule = (id: string, then: Rule['then']): Omit<Rule, 'source' | 'setBy'> & { setBy?: string } => ({
      id, text: id, who: '*', does: selector(['go', 'look']), where: selector(['x', 'y']),
      when: Array.from({ length: int(0, 3) }, condition),
      then,
    });
    const randomFacts = () => ({ n: int(0, 7), m: int(0, 9) / 2, t: hhmm(), day: pick(days), mode: pick(modes), flag: pick([true, false]) });

    let pairs = 0, disjointPairs = 0, requests = 0, witnesses = 0;
    for (let round = 0; round < 800; round++) {
      let input: CompileDomainInput;
      try { input = tiny([randomRule('a', { answer: 'allow' }), randomRule('b', { answer: 'deny' })]); compileDomain(input); } catch { continue; }   // impossible conditions are refused at compile time; skip them
      const rb = compileDomain(input);
      const found = rb.findings.find(f => f.ruleIds.includes('a') && f.ruleIds.includes('b'));
      pairs++;
      if (found) {
        // A finding was reported: the checker claims the overlap is real and its witness is a request that matches both. Check it.
        expect(found.certainty).toBe('certain');
        expect(matchingRules(rb, found.witness!).sort(), `witness does not match both: ${JSON.stringify({ rules: input.rules, witness: found.witness })}`).toEqual(['a', 'b']);
        witnesses++;
        continue;
      }
      disjointPairs++;
      // No finding for an allow against a deny: the checker is claiming the two rules are provably disjoint. Try to refute it.
      for (let k = 0; k < 60; k++) {
        const facts = randomFacts();
        for (const action of ['go', 'look']) for (const areaId of ['x', 'y']) {
          requests++;
          const d = evaluateDomainAction(rb, tinyReq(action, areaId, facts));
          const hit = new Set(d.trace.map(c => c.ruleId));
          expect(hit.has('a') && hit.has('b'), `seed-generated pair claimed disjoint but request matched both: ${JSON.stringify({ rules: input.rules, action, areaId, facts })}`).toBe(false);
        }
      }
    }
    expect(pairs).toBeGreaterThan(200);
    expect(disjointPairs).toBeGreaterThan(20);
    expect(witnesses).toBeGreaterThan(100);
    expect(requests).toBeGreaterThan(5000);
  });
});

// ─── 0.5.2: the audit fixes ───────────────────────────────────────────────────

describe('0.5.2: canonical JSON is RFC 8785 and the fingerprint is SHA-256 over UTF-8', () => {
  it('reproduces the FIPS 180-4 vectors and agrees with the platform hash on long and non-ASCII input', async () => {
    expect(sha256Utf8('')).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
    expect(sha256Utf8('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
    expect(sha256Utf8('abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq')).toBe('248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1');
    expect(sha256Utf8('a'.repeat(1_000_000))).toBe('cdc76e5c9914fb9281a1c7e284d73e67f1809a48a497200e046d39ccc7112cd0');
    for (const text of ['é ∑ 🤖', 'x'.repeat(55), 'y'.repeat(56), 'z'.repeat(64), 'w'.repeat(119)]) {
      const platform = [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)))].map(b => b.toString(16).padStart(2, '0')).join('');
      expect(sha256Utf8(text)).toBe(platform);
    }
  });

  it('canonicalises as JCS: sorted keys, ES number form, undefined dropped, non-finite refused; the fingerprint leaves findings out', () => {
    expect(canonicalJson({ b: 1, a: [1, { d: undefined, c: 2 }], e: -0, f: 1e21, g: 1e-7, h: 'é🤖' })).toBe('{"a":[1,{"c":2}],"b":1,"e":0,"f":1e+21,"g":1e-7,"h":"é🤖"}');
    expect(() => canonicalJson({ a: Infinity })).toThrow(/not a JSON number/);
    expect(fingerprint({ a: 1 })).toMatch(/^[0-9a-f]{64}$/);
    const { fingerprint: fp, findings, ...body } = grocery.rulebook;
    expect(findings.length).toBeGreaterThan(0);
    expect(fingerprint(body)).toBe(fp);
    expect(fingerprint({ ...body, findings })).not.toBe(fp);
    expect(verifyFingerprint({ ...grocery.rulebook, findings: [] })).toBe(true);   // reworded or dropped findings do not change identity
  });
});

describe('0.5.2: a compiled rulebook shares nothing with the caller\'s input', () => {
  it('does not freeze or alias the caller\'s rule.source (0.5.1 did)', () => {
    const input = tiny([rule('r', { answer: 'deny' })]);
    const source = input.rules![0].source;
    const rb = compileDomain(input);
    expect(Object.isFrozen(source)).toBe(false);
    expect(rb.rules.find(r => r.id === 'r')!.source).not.toBe(source);
    source.ref = 'changed by the caller afterwards';
    expect(rb.rules.find(r => r.id === 'r')!.source.ref).toBe('r');
  });
});

describe('0.5.2: plans', () => {
  const bot = { id: 'b', kind: 'robot', roleId: 'bot' };
  it('evaluatePlan(undefined) and other non-objects are BLOCK, never a throw', () => {
    const rb = compileDomain(tiny([]));
    for (const bad of [undefined, null, 42, 'plan', []]) {
      const r = evaluatePlan(rb, bad as unknown as Parameters<typeof evaluatePlan>[1]);
      expect(r.status).toBe('BLOCK');
      expect(r.firstViolation?.ruleId).toBe('required_facts');
    }
  });

  it('the plan digest ignores approvals, so collecting them does not change the plan\'s identity', () => {
    const plan = { participant: bot, initialFacts: { n: 0, t: '10:00', day: 'mon' }, steps: [{ action: 'go', area: 'x' }, { action: 'look' }] };
    const approved = { ...plan, steps: [plan.steps[0], { ...plan.steps[1], facts: { approvedBy: 'ann' } }], consumedApprovals: ['n-1'] };
    expect(planDigestOf(approved)).toBe(planDigestOf(plan));
    expect(planDigestOf({ ...plan, steps: [plan.steps[0]] })).not.toBe(planDigestOf(plan));
  });

  it('a step that names another area without an action that moves there is refused; now advances per step and times the history it appends', () => {
    const rb = compileDomain(tiny([rule('not_right_after_go', { answer: 'wait', for: 'condition' }, { does: 'look', history: [{ actions: 'go', withinMinutes: 2, op: '>=', value: 1 }] })], {
      actions: [{ id: 'go', kinds: ['robot'], tags: ['movement'], effects: [{ op: 'move' }] }, { id: 'look', kinds: ['robot'] }],
    }));
    const r = evaluatePlan(rb, { participant: bot, initialFacts: { n: 0, t: '10:00', day: 'mon' }, now: '2026-10-12T10:00:00Z', steps: [{ action: 'look', area: 'x' }, { action: 'look', area: 'y' }] });
    expect(r.status).toBe('BLOCK');
    expect(r.firstViolation).toMatchObject({ stepIndex: 1, ruleId: 'plan_area_continuity', setBy: 'builtin', from: 'step' });
    expect(r.steps[1].decision.reasons[0].reason).toContain('does not move it');
    // With `now`, the go at step 0 is one minute before the look at step 1 (within 2 min: PAUSE), and three minutes before step 3 (ALLOW).
    const timed = evaluatePlan(rb, { participant: bot, initialFacts: { n: 0, t: '10:00', day: 'mon' }, now: '2026-10-12T10:00:00Z', stepDurationSeconds: 60, clock: 't', steps: [{ action: 'go', area: 'x' }, { action: 'look' }, { action: 'look' }, { action: 'look' }] });
    expect(timed.steps.map(s => s.decision.status)).toEqual(['ALLOW', 'PAUSE', 'PAUSE', 'ALLOW']);
    expect(timed.steps[3].facts.t).toBe('10:03');   // startTime defaulted from now
  });
});

describe('0.5.2: the drafter refuses to guess', () => {
  it('"max 2 robots in aisle 5" is a count, never a speed: mapped to a declared count fact, or refused', () => {
    const noCountFact = draftRuleFromText('max 2 robots in aisle 5', grocery.rulebook, { setBy: 'site-manager', id: 'c' });
    expect(noCountFact.draft).toBeNull();
    expect(noCountFact.ready).toBe(false);
    expect(noCountFact.notes.join(' ')).toMatch(/count of robots, not a speed/);
    const withCountFact = draftRuleFromText('max 2 robots in aisle 5', sampleSite(2).rulebook, { setBy: 'site-manager', id: 'c' });
    expect(withCountFact.draft).toMatchObject({ who: ['kind:robot'], where: ['aisle-5'], when: [{ fact: 'robotsInZone', op: '>=', value: 2 }], then: { answer: 'wait', for: 'condition' } });
    expect(withCountFact.draft!.then).not.toMatchObject({ answer: 'limit' });
    expect(withCountFact.confidence).toBeLessThan(1);
    expect(withCountFact.notes.join(' ')).toMatch(/read as a count on the fact "robotsInZone"/);
  });

  it('"Don\'t let robots block the fire exit" is not drafted: "block" is a verb the drafter does not model, and a rule on every action is not what it says', () => {
    const d = draftRuleFromText("Don't let robots block the fire exit", grocery.rulebook, { setBy: 'site-manager', id: 'b' });
    expect(d.confidentDraft).toBe(false);
    expect(d.draft).toBeNull();
    expect(d.notes.join(' ')).toMatch(/"block" is a verb the drafter does not model/);
    expect(d.notes.join(' ')).toMatch(/buildRuleDraftPrompt/);
    // A bare number with no unit, no speed word and nothing to count is refused too.
    expect(draftRuleFromText('robots at most 2 in checkout', grocery.rulebook, { setBy: 'site-manager', id: 'n' }).draft).toBeNull();
  });
});

describe('0.5.2: approvals are authorisation, separate from the operational facts', () => {
  const SEED = '0001020304050607080910111213141516171819202122232425262728293031';   // TEST ONLY
  const NOW = '2026-10-12T09:05:00Z';
  async function signedSite() {
    const pub = await publicKeyOf(SEED);
    return compileDomain(tiny([
      rule('ask_high', { answer: 'wait', for: 'approval', by: 'high' }, { does: 'go', where: 'y' }),
      rule('crowd', { answer: 'wait', for: 'condition' }, { does: 'go', when: [{ fact: 'n', op: '>=', value: 3 }] }),
      rule('night', { answer: 'deny' }, { when: [{ fact: 't', op: 'between', from: '22:00', to: '06:00' }] }),
    ], { trustedKeys: [{ keyId: 'k', publicKey: pub, authority: 'high' }] }));
  }
  const ask = (rb: Rulebook, facts: Record<string, unknown> = {}, extra: Partial<DomainRequest> = {}): DomainRequest => ({ ...tinyReq('go', 'y', facts), now: NOW, ...extra });

  it('verifyAndEvaluate verifies then evaluates; the approval clears only its wait, once, within its window, under its rulebook', async () => {
    const rb = await signedSite();
    const bind = { id: 'ann', authority: 'high', ruleId: 'ask_high', rulebookFingerprint: rb.fingerprint, participantId: 'b', action: 'go', areaId: 'y', nonce: 'n-1', issuedAt: '2026-10-12T09:00:00Z', expiresAt: '2026-10-12T09:30:00Z' };
    const signed = await signApproval(bind, { keyId: 'k', privateKey: SEED });
    expect(signed.spec).toBe('robot-domain-rules-approval/3');
    expect((await verifyApproval(signed, rb)).ok).toBe(true);
    const pause = await verifyAndEvaluate(rb, ask(rb));
    expect(pause.status).toBe('PAUSE');
    expect(pause.approvalRequests![0]).toMatchObject({ ruleId: 'ask_high', by: 'high', participantId: 'b', action: 'go', areaId: 'y', rulebookFingerprint: rb.fingerprint });
    const ok = await verifyAndEvaluate(rb, ask(rb, { approvedBy: signed }));
    expect(ok.status).toBe('ALLOW');
    expect(ok.approvalsUsed).toEqual([{ ruleId: 'ask_high', nonce: 'n-1' }]);
    // (a) occupancy rose after the approval: the condition wait holds on the facts current now; the approval does not override it.
    const crowded = await verifyAndEvaluate(rb, ask(rb, { approvedBy: signed, n: 3 }));
    expect(crowded.status).toBe('PAUSE');
    expect(ids(crowded)).toEqual(['crowd']);
    expect(crowded.approvalRequests).toBeUndefined();
    // (f) a current BLOCK stays BLOCK whatever approval is presented.
    expect(ids(await verifyAndEvaluate(rb, ask(rb, { approvedBy: signed, t: '23:00' })))).toEqual(['night']);
    // (b) expired, (c) replayed, (d) altered scope, (e) other rulebook: refused, each with its reason.
    const reasonFor = async (facts: Record<string, unknown>, extra: Partial<DomainRequest> = {}) => { const d = await verifyAndEvaluate(rb, ask(rb, facts, extra)); expect(d.status).toBe('PAUSE'); return d.reasons[0].reason; };
    expect(await reasonFor({ approvedBy: signed }, { now: '2026-10-12T09:30:00Z' })).toMatch(/expired at 2026-10-12T09:30:00Z/);
    expect(await reasonFor({ approvedBy: signed }, { consumedApprovals: ['n-1'] })).toMatch(/already used/);
    expect(await reasonFor({ approvedBy: await signApproval({ ...bind, areaId: 'x', nonce: 'n-2' }, { keyId: 'k', privateKey: SEED }) })).toMatch(/for area "x"/);
    expect(await reasonFor({ approvedBy: await signApproval({ ...bind, participantId: 'other', nonce: 'n-3' }, { keyId: 'k', privateKey: SEED }) })).toMatch(/for participant "other"/);
    expect(await reasonFor({ approvedBy: await signApproval({ ...bind, rulebookFingerprint: '1'.repeat(64), nonce: 'n-4' }, { keyId: 'k', privateKey: SEED }) })).toMatch(/another rulebook/);
    // A tampered signature is passed through unverified and does not count.
    expect(await reasonFor({ approvedBy: { ...signed, nonce: 'n-5' } })).toMatch(/only approvals verified against its trusted keys/);
    // A /2 approval is refused by name, not reinterpreted.
    const v2 = { id: 'ann', authority: 'high', requestDigest: 'a972a032bcabeaaf', rulebookFingerprint: '96be85f891da7c40', issuedAt: '2026-10-12T09:00:00Z', keyId: 'k', signature: 'ab'.repeat(64) };
    expect((await verifyApproval(v2, rb)).reason).toMatch(/robot-domain-rules\/2 approval .* re-issued/);
    expect(await reasonFor({ approvedBy: { ...v2, verified: true } })).toMatch(/robot-domain-rules\/2 approval/);
    // No now: the window cannot be judged, so required_facts.
    expect(ids(await verifyAndEvaluate(rb, { ...ask(rb, { approvedBy: signed }), now: undefined }))).toEqual(['required_facts']);
  });
});

describe('0.5.2: the conflict check', () => {
  it('compares limit rules on every shared limit name', () => {
    const site = tiny([rule('company', { answer: 'limit', limits: { speed: 1, load: 3 } }), rule('site', { answer: 'limit', limits: { speed: 1, load: 5 } }, { setBy: 'low' })], { limits: [{ id: 'speed', unit: 'm/s' }, { id: 'load', unit: 'kg' }] });
    expect(checkRulebook(site).map(f => [f.kind, f.ruleIds])).toEqual([['authority-override', ['site', 'company']]]);
    expect(checkRulebook(site)[0].message).toMatch(/load 5.*load 3/);
  });

  it('subset is exact for every pair of constraint shapes (property test against brute force on a small integer domain)', () => {
    // Facts: n integer in 0..5. Each rule's constraint on n is a random condition list; subset is checked by enumeration.
    let seed = 7;
    const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
    const int = (lo: number, hi: number) => lo + Math.floor(rnd() * (hi - lo + 1));
    const cond = (): Condition => {
      const k = int(0, 3);
      if (k === 0) return { fact: 'n', op: 'in', values: Array.from({ length: int(1, 3) }, () => int(0, 5)) };
      if (k === 1) return { fact: 'n', op: '==', value: int(0, 5) };
      return { fact: 'n', op: (['>', '>=', '<', '<=', '!='] as const)[int(0, 4)], value: int(0, 5) };
    };
    const holds = (when: Condition[], v: number) => when.every(c => {
      if (c.op === 'in') return c.values.includes(v);
      if (c.op === 'between' || c.op === 'days') return false;
      const x = c.value as number;
      return c.op === '==' ? v === x : c.op === '!=' ? v !== x : c.op === '>' ? v > x : c.op === '>=' ? v >= x : c.op === '<' ? v < x : v <= x;
    });
    let checked = 0;
    for (let round = 0; round < 800; round++) {
      const a = Array.from({ length: int(1, 2) }, cond), b = Array.from({ length: int(1, 2) }, cond);
      const site = tiny([rule('a', { answer: 'deny' }, { when: a }), rule('b', { answer: 'deny' }, { when: b })], { facts: [{ id: 'n', type: 'number', integer: true, min: 0, max: 5, required: true }, { id: 't', type: 'time', required: true }, { id: 'day', type: 'day', required: true }] });
      let findings;
      try { findings = checkRulebook(site); } catch { continue; }   // impossible conditions are refused at compile time
      const A = [0, 1, 2, 3, 4, 5].filter(v => holds(a, v)), B = [0, 1, 2, 3, 4, 5].filter(v => holds(b, v));
      const overlap = A.some(v => B.includes(v));
      const aInB = A.every(v => B.includes(v)), bInA = B.every(v => A.includes(v));
      // Same answer and authority: a duplicate with [a, b] when a ⊆ b, [b, a] when only b ⊆ a, nothing otherwise.
      const want = !overlap ? [] : aInB ? [['a', 'b']] : bInA ? [['b', 'a']] : [];
      expect(findings.map(f => f.ruleIds), JSON.stringify({ a, b, A, B })).toEqual(want);
      checked++;
    }
    expect(checked).toBeGreaterThan(300);
  });
});

// ─── 0.5.3: the second audit ─────────────────────────────────────────────────

describe('0.5.3: nothing in a request can assert that an approval was verified', () => {
  const SEED = '0001020304050607080910111213141516171819202122232425262728293031';   // TEST ONLY
  const OTHER = '2222222222222222222222222222222222222222222222222222222222222222';  // TEST ONLY, not trusted
  const NOW = '2026-10-12T09:05:00Z';
  async function signedSite(extra: Array<Omit<Rule, 'source' | 'setBy'> & { setBy?: string }> = []) {
    const pub = await publicKeyOf(SEED);
    return compileDomain(tiny([rule('ask_high', { answer: 'wait', for: 'approval', by: 'high' }, { does: 'go', where: 'y' }), ...extra], { trustedKeys: [{ keyId: 'k', publicKey: pub, authority: 'high' }] }));
  }
  const ask = (facts: Record<string, unknown> = {}, extra: Partial<DomainRequest> = {}): DomainRequest => ({ ...tinyReq('go', 'y', facts), now: NOW, ...extra });
  const bindFor = (rb: Rulebook, nonce = 'n-1') => ({ id: 'ann', authority: 'high', ruleId: 'ask_high', rulebookFingerprint: rb.fingerprint, participantId: 'b', action: 'go', areaId: 'y', nonce, issuedAt: '2026-10-12T09:00:00Z', expiresAt: '2026-10-12T09:30:00Z' });

  it('an unsigned object with the bound fields and verified: true clears nothing, through evaluateDomainAction and through verifyAndEvaluate (the 0.5.2 bypass)', async () => {
    const rb = await signedSite();
    const forged = { spec: 'robot-domain-rules-approval/3', ...bindFor(rb), keyId: 'k', verified: true };   // no signature at all
    const pure = evaluateDomainAction(rb, ask({ approvedBy: forged }));
    expect(pure.status).toBe('PAUSE');
    expect(pure.reasons[0].reason).toMatch(/nothing in a request can assert that/);
    const viaTrusted = await verifyAndEvaluate(rb, ask({ approvedBy: forged }));
    expect(viaTrusted.status).toBe('PAUSE');
    // A bogus signature: the same.
    const bogus = { ...forged, signature: 'ab'.repeat(64) };
    expect((await verifyAndEvaluate(rb, ask({ approvedBy: bogus }))).status).toBe('PAUSE');
    expect(evaluateDomainAction(rb, ask({ approvedBy: bogus })).status).toBe('PAUSE');
    // Signed by a key the rulebook does not trust, marked verified: the same.
    const stranger = { ...await signApproval(bindFor(rb), { keyId: 'k', privateKey: OTHER }), verified: true };
    expect((await verifyAndEvaluate(rb, ask({ approvedBy: stranger }))).status).toBe('PAUSE');
  });

  it('a valid signature clears the wait only through verifyAndEvaluate (or the object verifyApproval returned); the pure evaluator says so', async () => {
    const rb = await signedSite();
    const signed = await signApproval(bindFor(rb), { keyId: 'k', privateKey: SEED });
    const pure = evaluateDomainAction(rb, ask({ approvedBy: signed }));
    expect(pure.status).toBe('PAUSE');
    expect(pure.reasons[0].reason).toMatch(/use verifyAndEvaluate/);
    expect(evaluateDomainAction(rb, ask({ approvedBy: { ...signed, verified: true } })).status).toBe('PAUSE');   // the flag is ignored
    const ok = await verifyAndEvaluate(rb, ask({ approvedBy: signed }));
    expect(ok.status).toBe('ALLOW');
    expect(ok.approvalsUsed).toEqual([{ ruleId: 'ask_high', nonce: 'n-1' }]);
    // The object verifyApproval returned is the handle; a copy of it is not.
    const r = await verifyApproval(signed, rb);
    expect(r.ok && isVerified(r.approval)).toBe(true);
    expect(isVerified({ ...r.approval })).toBe(false);
    expect(evaluateDomainAction(rb, ask({ approvedBy: r.approval })).status).toBe('ALLOW');
    expect(evaluateDomainAction(rb, ask({ approvedBy: { ...r.approval } })).status).toBe('PAUSE');
    expect(evaluateDomainAction(rb, ask({ approvedBy: JSON.parse(JSON.stringify(r.approval)) })).status).toBe('PAUSE');
  });

  it('a /2 approval is refused by name with or without trusted keys', async () => {
    const plain = compileDomain(tiny([rule('ask', { answer: 'wait', for: 'approval' }, { does: 'go', where: 'y' })]));
    const v2 = { id: 'ann', authority: 'high', requestDigest: 'a972a032bcabeaaf', rulebookFingerprint: '96be85f891da7c40', issuedAt: '2026-10-12T09:00:00Z', keyId: 'k', signature: 'ab'.repeat(64) };
    const d = evaluateDomainAction(plain, ask({ approvedBy: v2 }));
    expect(d.status).toBe('PAUSE');
    expect(d.reasons[0].reason).toMatch(/robot-domain-rules\/2 approval/);
    expect(evaluateDomainAction(plain, ask({ approvedBy: { id: 'ann', spec: 'robot-domain-rules-approval/4' } })).reasons[0].reason).toMatch(/declares spec "robot-domain-rules-approval\/4"/);
    expect(evaluateDomainAction(plain, ask({ approvedBy: { id: 'ann' } })).status).toBe('ALLOW');   // a plain approval still clears a plain wait (development only)
  });

  it('approvedBy may be a list; each approval clears at most one wait, so two waits need two approvals', async () => {
    const rb = await signedSite([rule('ask_again', { answer: 'wait', for: 'approval', by: 'high' }, { does: 'go', where: 'y' })]);
    const a1 = await signApproval(bindFor(rb, 'n-1'), { keyId: 'k', privateKey: SEED });
    const a2 = await signApproval({ ...bindFor(rb, 'n-2'), ruleId: 'ask_again' }, { keyId: 'k', privateKey: SEED });
    const one = await verifyAndEvaluate(rb, ask({ approvedBy: a1 }));
    expect(one.status).toBe('PAUSE');
    expect(one.approvalRequests!.map(a => a.ruleId)).toEqual(['ask_again']);
    const both = await verifyAndEvaluate(rb, ask({ approvedBy: [a1, a2] }));
    expect(both.status).toBe('ALLOW');
    expect(both.approvalsUsed).toEqual([{ ruleId: 'ask_high', nonce: 'n-1' }, { ruleId: 'ask_again', nonce: 'n-2' }]);
    // Without trusted keys, two plain approvals in a list are each spent on one wait; one plain approval cannot clear two.
    const plain = compileDomain(tiny([rule('a', { answer: 'wait', for: 'approval' }, { does: 'go' }), rule('b', { answer: 'wait', for: 'approval' }, { does: 'go' })]));
    expect(evaluateDomainAction(plain, ask({ approvedBy: 'ann' })).status).toBe('PAUSE');
    expect(evaluateDomainAction(plain, ask({ approvedBy: ['ann', 'bob'] })).status).toBe('ALLOW');
    expect(ids(evaluateDomainAction(plain, ask({ approvedBy: [] })))).toEqual(['required_facts']);
  });

  it('a plan consumes approvals step by step: one single-use approval clears one step, and approvalsUsed is reported at plan level', async () => {
    const rb = await signedSite();
    const signed = await signApproval(bindFor(rb), { keyId: 'k', privateKey: SEED });
    const plan = { participant: { id: 'b', kind: 'robot', roleId: 'bot' }, initialFacts: { n: 0, t: '10:00', day: 'mon', approvedBy: signed }, now: NOW, steps: [{ action: 'go', area: 'y' }, { action: 'go' }, { action: 'go' }] };
    const p = await verifyAndEvaluatePlan(rb, plan);
    expect(p.steps.map(s => s.decision.status)).toEqual(['ALLOW', 'PAUSE', 'PAUSE']);
    expect(p.steps[1].decision.reasons[0].reason).toMatch(/already used/);
    expect(p.approvalsUsed).toEqual([{ ruleId: 'ask_high', nonce: 'n-1' }]);
    // A nonce the caller already consumed is spent before the first step.
    expect((await verifyAndEvaluatePlan(rb, { ...plan, consumedApprovals: ['n-1'] })).steps.map(s => s.decision.status)).toEqual(['PAUSE', 'PAUSE', 'PAUSE']);
    // The pure evaluator never clears a trusted-keys wait inside a plan either.
    expect(evaluatePlan(rb, plan).steps.map(s => s.decision.status)).toEqual(['PAUSE', 'PAUSE', 'PAUSE']);
  });

  it('signApproval refuses a window that ends before it starts', async () => {
    const rb = await signedSite();
    await expect(signApproval({ ...bindFor(rb), issuedAt: '2026-10-12T09:30:00Z', expiresAt: '2026-10-12T09:00:00Z' }, { keyId: 'k', privateKey: SEED })).rejects.toThrow(/expiresAt .* must be later than issuedAt/);
    await expect(signApproval({ ...bindFor(rb), expiresAt: '2026-10-12T09:00:00Z' }, { keyId: 'k', privateKey: SEED })).rejects.toThrow(/later than/);
  });

  it('the glasses bridge blocks every approval wait under trusted keys: a confirmation on the device is not a signed approval', async () => {
    const pub = await publicKeyOf(SEED);
    const site = (trustedKeys?: CompileDomainInput['trustedKeys']): CompileDomainInput => ({
      site: { id: 'g', name: 'G' }, authorities: [{ id: 'manager' }], kinds: ['person'], actions: [{ id: 'camera_capture', kinds: ['person'] }], facts: [],
      areas: [{ id: 'a', name: 'A' }], roles: [{ id: 'wearer', name: 'Wearer', kind: 'person', actions: ['camera_capture'] }],
      rules: [{ id: 'r', text: 'r', who: '*', does: 'camera_capture', where: '*', then: { answer: 'wait', for: 'approval' }, setBy: 'manager', source: { kind: 'manual', ref: 'r' } }],
      ...(trustedKeys ? { trustedKeys } : {}),
    });
    expect(glassesZoneRules(compileDomain(site()), 'a', 'wearer').camera).toBe('confirm_each');
    expect(glassesZoneRules(compileDomain(site([{ keyId: 'k', publicKey: pub, authority: 'manager' }])), 'a', 'wearer').camera).toBe('blocked');
    expect(glassesZoneRules(compileDomain(site([{ keyId: 'k', publicKey: pub, authority: 'manager' }])), 'a', 'wearer', { wearerAuthority: 'manager' }).camera).toBe('blocked');
  });
});

describe('0.5.3: a rulebook of another format is refused by name at every door', () => {
  const v3 = compileDomain(tiny([rule('no_y', { answer: 'deny' }, { where: 'y' })]));
  const v2 = { ...JSON.parse(JSON.stringify(v3)), format: 'neuroverse-domain-rules/2', fingerprint: '5f8c2e1a9b3d4c70' } as Rulebook;
  const message = rulebookVersionProblem(v2)!;
  it('evaluate, evaluatePlan, matchingRules, check, backtest and the glasses bridge all refuse it with validation\'s exact message', () => {
    expect(validateRulebook(v2)).toEqual([message]);
    expect(message).toMatch(/robot-domain-rules\/2.*recompile/i);
    const d = evaluateDomainAction(v2, tinyReq('go', 'x'));
    expect(d.status).toBe('BLOCK');
    expect(d.reasons).toEqual([{ ruleId: 'rulebook_version', status: 'BLOCK', reason: `This rulebook cannot be decided with: ${message}`, setBy: 'builtin' }]);
    expect(d.fingerprint).toBe('5f8c2e1a9b3d4c70');
    const p = evaluatePlan(v2, { participant: { id: 'b', kind: 'robot', roleId: 'bot' }, initialFacts: { n: 0, t: '10:00', day: 'mon' }, steps: [{ action: 'go', area: 'x' }] });
    expect(p.status).toBe('BLOCK');
    expect(p.firstViolation).toMatchObject({ ruleId: 'rulebook_version', setBy: 'builtin', from: 'plan' });
    expect(matchingRules(v2, tinyReq('go', 'x'))).toEqual([]);
    expect(() => checkRulebook(v2)).toThrow(message);
    expect(() => backtest(v2, [])).toThrow(message);
    expect(() => glassesZoneRules(v2, 'x', 'bot', { kind: 'robot' })).toThrow(message);
    // An unknown format string is refused the same way; a /3 rulebook is decided.
    expect(evaluateDomainAction({ ...v3, format: 'neuroverse-domain-rules/9' } as unknown as Rulebook, tinyReq()).reasons[0].ruleId).toBe('rulebook_version');
    expect(evaluateDomainAction(v3, tinyReq('go', 'y')).reasons[0].ruleId).toBe('no_y');
  });
});

describe('0.5.3: validation re-derives what is derived', () => {
  const wire = () => JSON.parse(JSON.stringify(grocery.rulebook)) as Rulebook;
  const refingerprint = (rb: Rulebook) => { const { fingerprint: _f, findings: _x, ...body } = rb; rb.fingerprint = fingerprint(body); return rb; };
  it('a stripped or altered area role-limit never rule is invalid even with a recomputed fingerprint', () => {
    expect(validateRulebook(grocery.rulebook)).toEqual([]);
    const area = grocery.rulebook.areas.find(a => a.allowRoles)!;
    const stripped = refingerprint(wire());
    stripped.rules = stripped.rules.filter(r => r.id !== `area_role_limits:${area.id}`);
    refingerprint(stripped);
    expect(verifyFingerprint(stripped)).toBe(true);
    expect(validateRulebook(stripped).join(' ')).toMatch(new RegExp(`Rule "area_role_limits:${area.id}" is missing`));
    // Before this check the stripped rulebook decided ALLOW for a role the area excludes.
    const altered = wire();
    const r = altered.rules.find(x => x.id === `area_role_limits:${area.id}`)!;
    r.who = [area.allowRoles![0]];
    refingerprint(altered);
    expect(validateRulebook(altered).join(' ')).toMatch(/was altered/);
    const impostor = wire();
    impostor.rules.push({ ...r, id: 'area_role_limits:nowhere' });
    refingerprint(impostor);
    expect(validateRulebook(impostor).join(' ')).toMatch(/no area declares it/);
  });

  it('emptied or altered findings are invalid; reworded ones are not', () => {
    const emptied = wire();
    emptied.findings = [];
    expect(verifyFingerprint(emptied)).toBe(true);
    expect(validateRulebook(emptied).join(' ')).toMatch(/findings do not match.*missing/);
    const reworded = wire();
    reworded.findings = reworded.findings.map(f => ({ ...f, message: 'a port may word this differently' }));
    expect(validateRulebook(reworded)).toEqual([]);
    const downgraded = wire();
    downgraded.findings = downgraded.findings.map(f => (f.kind === 'authority-override' ? { ...f, severity: 'info' as const } : f));
    expect(validateRulebook(downgraded).join(' ')).toMatch(/not found by the check/);
    const badWitness = wire();
    const w = badWitness.findings.find(f => f.witness)!;
    w.witness = { ...w.witness!, areaId: 'nowhere' };
    expect(validateRulebook(badWitness).join(' ')).toMatch(/witness .* does not match both/);
  });
});

describe('0.5.3: a plan\'s clock starts at the wall-clock time `now` names, in its own offset', () => {
  const rb = compileDomain(tiny([rule('no_night', { answer: 'deny' }, { when: [{ fact: 't', op: 'between', from: '22:00', to: '06:00' }] })]));
  const bot = { id: 'b', kind: 'robot', roleId: 'bot' };
  it('21:00-05:00 is 21:00 on site (not 02:00 UTC); 05:00+09:00 is 05:00 on site (not 20:00 UTC)', () => {
    expect(timeOfDay('2026-10-12T21:00:00-05:00')).toBe('21:00');
    expect(timeOfDay('2026-10-12T05:00:00+09:00')).toBe('05:00');
    expect(timeOfDay('2026-10-12T14:30Z')).toBe('14:30');
    const at = (now: string) => evaluatePlan(rb, { participant: bot, initialFacts: { n: 0, t: '10:00', day: 'mon' }, clock: 't', now, steps: [{ action: 'go', area: 'x' }] });
    expect(at('2026-10-12T21:00:00-05:00').steps[0].facts.t).toBe('21:00');
    expect(at('2026-10-12T21:00:00-05:00').status).toBe('ALLOW');          // 0.5.2 read 02:00 and refused the step
    expect(at('2026-10-12T05:00:00+09:00').steps[0].facts.t).toBe('05:00');
    expect(at('2026-10-12T05:00:00+09:00').status).toBe('BLOCK');          // 0.5.2 read 20:00 and allowed it
    expect(at('2026-10-12T05:00:00+09:00').firstViolation?.ruleId).toBe('no_night');
  });
});

describe('0.5.3: smaller corrections', () => {
  const bot = { id: 'b', kind: 'robot', roleId: 'bot' };
  it('finalArea after a continuity refusal is where the plan left the participant, not the refused destination', () => {
    const rb = compileDomain(tiny([], { actions: [{ id: 'go', kinds: ['robot'], tags: ['movement'], effects: [{ op: 'move' }] }, { id: 'look', kinds: ['robot'] }] }));
    const p = evaluatePlan(rb, { participant: bot, initialFacts: { n: 0, t: '10:00', day: 'mon' }, steps: [{ action: 'go', area: 'y' }, { action: 'look', area: 'x' }] });
    expect(p.firstViolation?.ruleId).toBe('plan_area_continuity');
    expect(p.finalArea).toBe('y');
    expect(p.steps[1].areaId).toBe('x');
  });

  it('evaluatePlan never throws on NaN or Infinity in stepDurationSeconds or facts: BLOCK, with a digest', () => {
    const rb = compileDomain(tiny([]));
    for (const plan of [
      { participant: bot, initialFacts: { n: 0, t: '10:00', day: 'mon' }, stepDurationSeconds: NaN, steps: [{ action: 'go', area: 'x' }] },
      { participant: bot, initialFacts: { n: Infinity, t: '10:00', day: 'mon' }, steps: [{ action: 'go', area: 'x' }] },
      { participant: bot, initialFacts: { n: 0, t: '10:00', day: 'mon' }, steps: [{ action: 'go', area: 'x', facts: { n: NaN } }] },
    ]) {
      const p = evaluatePlan(rb, plan);
      expect(p.status).toBe('BLOCK');
      expect(p.firstViolation?.ruleId).toBe('required_facts');
      expect(p.planDigest).toMatch(/^[0-9a-f]{64}$/);
    }
  });

  it('years 0000–0099 are those years; fractions past the millisecond are truncated, so a port with finer ticks compares the same', () => {
    const d = new Date(parseTimestamp('0050-06-15T12:00:00Z')!);
    expect(d.getUTCFullYear()).toBe(50);
    expect(parseTimestamp('2026-10-12T09:30:00.0009Z')).toBe(parseTimestamp('2026-10-12T09:30:00.000Z'));
    expect(parseTimestamp('2026-10-12T09:30:00.1239999Z')).toBe(parseTimestamp('2026-10-12T09:30:00.123Z'));
    expect(parseTimestamp('2026-02-30T00:00Z')).toBeNull();
    expect(parseTimestamp('2026-04-31T00:00Z')).toBeNull();
  });

  it('canonicalJson refuses lone surrogates and non-JSON values with a clear error', () => {
    expect(() => canonicalJson({ s: '\uD800' })).toThrow(/lone surrogate/);
    expect(() => canonicalJson({ s: 'ok \uDC00 no' })).toThrow(/lone surrogate/);
    expect(() => canonicalJson({ ['\uD800']: 1 })).toThrow(/lone surrogate/);
    expect(canonicalJson({ s: '🤖' })).toBe('{"s":"🤖"}');
    expect(() => canonicalJson({ f: () => 1 })).toThrow(/function is not a JSON value/);
    expect(() => canonicalJson([() => 1])).toThrow(/not a JSON value/);
    expect(() => canonicalJson({ b: 10n })).toThrow(/bigint is not a JSON value/);
    expect(canonicalJson({ a: undefined, b: 1 })).toBe('{"b":1}');   // JSON has no undefined: the member is dropped, as JSON.stringify does
  });

  it('deepFreeze reaches inside already-frozen parts: two rulebooks from one template share no mutable limits', () => {
    const site = (): CompileDomainInput => ({ site: { id: 's', name: 'S', hours: { open: '08:00', close: '20:00' } }, template: GROCERY_STORE, areas: [{ id: 'a', name: 'A', tags: ['public'] }], roles: [{ id: 'bot', name: 'Bot', kind: 'robot', actions: ['move'] }] });
    const a = compileDomain(site()), b = compileDomain(site());
    const limitRule = a.rules.find(r => r.then.answer === 'limit')!;
    const limits = (limitRule.then as { limits: Record<string, number> }).limits;
    expect(Object.isFrozen(limits)).toBe(true);
    expect(() => { limits.maxSpeedMps = 99; }).toThrow();
    expect((b.rules.find(r => r.id === limitRule.id)!.then as { limits: Record<string, number> }).limits).not.toBe(limits);
    // A frozen object with an unfrozen child is frozen all the way down.
    const shared = { limits: { x: 1 } };
    Object.freeze(shared);
    const frozen = compileDomain(tiny([rule('r', { answer: 'limit', limits: { speed: 1 } })]));
    expect(Object.isFrozen((frozen.rules[0].then as { limits: object }).limits)).toBe(true);
    expect(Object.isFrozen(shared.limits)).toBe(false);
  });
});

describe('0.5.3: a selector that matches nothing is a finding', () => {
  it('a rule on tag:staff-only where the area is tagged Staff-only is a warning naming the near miss; tags match exactly, case included', () => {
    const site = tiny([rule('no_bots', { answer: 'deny' }, { where: 'tag:staff-only' })], { areas: [{ id: 'x', name: 'X' }, { id: 'y', name: 'Aisle 5', tags: ['Staff-only'] }], tags: { areas: ['staff-only'] } });
    const rb = compileDomain(site);
    expect(rb.findings.map(f => [f.kind, f.severity, f.ruleIds, f.certainty, f.witness])).toEqual([['unmatched_selector', 'warning', ['no_bots'], 'certain', undefined]]);
    expect(rb.findings[0].message).toMatch(/tag "staff-only", which no area carries — tags match exactly, case included; Aisle 5 carries "Staff-only"/);
    expect(rb.findings[0].message).toMatch(/binds nothing/);
    expect(evaluateDomainAction(rb, tinyReq('go', 'y')).status).toBe('ALLOW');   // it binds nothing, as the finding says
    // A partly empty selector: one entry matches nothing, the rule still binds the rest.
    const partly = compileDomain(tiny([rule('r', { answer: 'deny' }, { where: ['tag:staff-only', 'x'] })], { tags: { areas: ['staff-only'] } }));
    expect(partly.findings[0].message).toMatch(/binds less than it reads/);
    expect(evaluateDomainAction(partly, tinyReq('go', 'x')).status).toBe('BLOCK');
    // A kind no action has, and an exclusion that empties the set.
    expect(compileDomain(tiny([rule('r', { answer: 'deny' }, { who: 'kind:drone' })], { kinds: ['drone'] })).findings[0].message).toMatch(/kind "drone", which no role has/);
    expect(compileDomain(tiny([rule('r', { answer: 'deny' }, { where: ['*', '!x', '!y'] })])).findings[0].message).toMatch(/where resolves to no area at all/);
    expect(compileDomain(tiny([rule('r', { answer: 'deny' }, { where: 'x' })])).findings).toEqual([]);
  });
});

describe('0.5.3: a never rule whose conditions can never fail is unconditional for reachability', () => {
  it('a clash entirely behind `never when people >= 0` (min 0) is unreachable, exactly as behind a never rule with no conditions', () => {
    const behind = (when: Condition[] | undefined) => checkRulebook(tiny([rule('inv', { answer: 'deny' }, { never: true, where: 'y', ...(when ? { when } : {}) }), rule('yes', { answer: 'allow' }, { where: 'y' }), rule('no', { answer: 'deny' }, { where: 'y' })])).map(f => `${f.kind}:${f.ruleIds.join('+')}`);
    expect(behind(undefined)).toEqual(['never_vs_rule:yes+inv']);
    expect(behind([{ fact: 'n', op: '>=', value: 0 }])).toEqual(['never_vs_rule:yes+inv']);                 // 0.5.2 also reported contradiction:yes+no
    expect(behind([{ fact: 'mode', op: 'in', values: ['a', 'b', 'c'] }])).toEqual(['never_vs_rule:yes+inv']);
    expect(behind([{ fact: 'n', op: '>=', value: 1 }])).toEqual(['never_vs_rule:yes+inv', 'contradiction:yes+no']);   // a real condition: the clash is reachable when n is 0
  });
});

describe('0.5.3: the drafter and the four audit sentences', () => {
  const rb = grocery.rulebook;
  const draft = (text: string, book = rb) => draftRuleFromText(text, book, { setBy: 'site-manager', id: 'd' });
  it('"Robots may not go faster than 1 m/s" is a 1 m/s limit on movement, never deny-everything', () => {
    const d = draft('Robots may not go faster than 1 m/s');
    expect(d.draft).toMatchObject({ who: ['kind:robot'], does: 'tag:movement', then: { answer: 'limit', limits: { maxSpeedMps: 1 } } });
    expect(d.confidentDraft).toBe(true);
    expect(d.ready).toBe(d.confidentDraft);
  });
  it('"Never enter aisle 5 unless there is an emergency" is not drafted: "unless" is an exception the drafter cannot carry', () => {
    const d = draft('Never enter aisle 5 unless there is an emergency');
    expect(d.draft).toBeNull();
    expect(d.confidentDraft).toBe(false);
    expect(d.notes.join(' ')).toMatch(/"unless" carves an exception/);
    expect(draft('robots may dock except in checkout').draft).toBeNull();
    expect(draft('robots may dock but not in checkout').draft).toBeNull();
  });
  it('"No scanning while people are present" is not drafted: "scanning" is not a declared action, and a rule on every action is not what it says', () => {
    const d = draft('No scanning while people are present');
    expect(d.draft).toBeNull();
    expect(d.notes.join(' ')).toMatch(/No declared action matches "scanning"/);
    // The same sentence with the declared verb is a condition wait on scan alone.
    const ok = draft('robots may not scan while people are present');
    expect(ok.draft).toMatchObject({ who: ['kind:robot'], does: ['scan'], when: [{ fact: 'peopleInZone', op: '>', value: 0 }], then: { answer: 'deny' } });
    // A "while" the drafter could not read as a condition is refused, not dropped.
    expect(draft('robots may not scan while the band plays').draft).toBeNull();
    expect(draft('robots may not scan while the band plays').notes.join(' ')).toMatch(/"while \.\.\." is a condition the drafter could not read/);
  });
  it('"At most 2 robots in aisle 5" with a count fact binds entering only: robots already inside can act and leave', () => {
    const d = draft('At most 2 robots in aisle 5', sampleSite(2).rulebook);
    expect(d.draft).toMatchObject({ who: ['kind:robot'], does: ['enter_zone', 'dock'], where: ['aisle-5'], when: [{ fact: 'robotsInZone', op: '>=', value: 2 }], then: { answer: 'wait', for: 'condition' } });
    expect(d.notes.join(' ')).toMatch(/entering \(enter_zone, dock\) waits while robotsInZone >= 2; other actions, including leaving, are not bound/);
    const compiled = new DomainRulesBuilder({ id: 's', name: 'S', hours: { open: '08:00', close: '20:00' } }).fromTemplate('grocery-store')
      .area({ id: 'aisle-5', name: 'Aisle 5', tags: ['public'] }).role({ id: 'bot', name: 'Bot', kind: 'robot', actions: ['enter_zone', 'move', 'scan', 'dock'] })
      .fact({ id: 'robotsInZone', type: 'number', integer: true, min: 0, required: true }).as('site-manager');
    compiled.confirm(compiled.addRuleFromText('At most 2 robots in aisle 5', { id: 'cap' }));
    const book = compiled.compile();
    const inside = (action: string) => evaluateDomainAction(book, { participant: { id: 'r', kind: 'robot', roleId: 'bot' }, action, areaId: 'aisle-5', facts: { peopleInZone: 0, localTime: '10:00', robotsInZone: 2 } }).status;
    expect(inside('enter_zone')).toBe('PAUSE');
    expect(inside('move')).toBe('LIMIT');   // the template's speed cap, not the count: a robot inside may move (and leave)
    expect(inside('scan')).toBe('ALLOW');
  });
  it('a comparison the drafter cannot turn into a limit is refused, and unmatched words keep a draft from being confident', () => {
    expect(draft('robots may not go faster than the staff').draft).toBeNull();
    expect(draft('robots may not go faster than the staff').notes.join(' ')).toMatch(/"faster than" is a comparison/);
    const loose = draft('robots may dock quietly after 22:00');
    expect(loose.draft).not.toBeNull();
    expect(loose.unmatched).toEqual(['quietly']);
    expect(loose.confidentDraft).toBe(false);
    expect(loose.notes.join(' ')).toMatch(/Not a confident draft/);
  });
});

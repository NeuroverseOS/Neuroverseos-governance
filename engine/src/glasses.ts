/**
 * Glasses bridge — the per-area ZoneRules a person's smart glasses enforce
 * on-device, derived from the rulebook.
 *
 * ZoneRules has no conditions, so the bridge reads the rulebook statically
 * and conservatively: for each glasses capability it looks at every rule
 * that could apply to this role, this action, this area — as if its
 * conditions held — and takes the most restrictive answer. The result only
 * ever tightens the base passed in (most restrictive wins).
 *
 * Waits, read conservatively:
 *   - a condition wait ("no camera while children are present") → `blocked`.
 *     The device cannot re-evaluate the condition; a per-use confirmation
 *     would let the wearer confirm through it.
 *   - an approval wait → `confirm_each` only when the WEARER is someone the
 *     rule accepts as approver: the rule names nobody, or the wearer's role
 *     (or its tag), or an authority the wearer holds (`options.wearerAuthority`,
 *     that authority or higher). Otherwise `blocked`: the device has no way to
 *     obtain a third party's approval on its own.
 *   - under a rulebook that declares `trustedKeys`, every approval wait →
 *     `blocked`: only a signed, verified approval clears such a wait, and an
 *     on-device confirmation is not one — whoever the rule names.
 */

import type { Rulebook } from './types';
import { DomainRulesError, authorityRank, resolveSelector, vocabularyOf } from './vocabulary';
import { rulebookVersionProblem } from './version';
import { mergeRules, type ZoneRules } from './zone-rules';

/** Least-restrictive spatial ZoneRules: the default base, so the rulebook alone decides. */
export const OPEN_ZONE_RULES: ZoneRules = {
  camera: 'allowed',
  microphone: 'allowed',
  aiDataSend: 'allowed',
  aiActions: 'allowed',
  aiRecommendations: 'allowed',
  locationSharing: 'allowed',
  aiOverlay: 'allowed',
  dataRetention: 'allowed',
  commercialAI: 'allowed',
  bystanderProtection: 'standard',
};

/** Which rulebook action governs which ZoneRules field. Override for a site with its own action names. */
export const GLASSES_ACTION_FIELDS: Readonly<Record<string, 'camera' | 'microphone' | 'aiOverlay' | 'locationSharing'>> = {
  camera_capture: 'camera',
  record_audio: 'microphone',
  ai_overlay: 'aiOverlay',
  share_location: 'locationSharing',
};

export interface GlassesBridgeOptions {
  /** Pass a stricter base (for example a spatial package's retail template) to layer under the rulebook. */
  base?: ZoneRules;
  /** Which participant kind wears glasses. Default "person". */
  kind?: string;
  /** Action → ZoneRules field. Default GLASSES_ACTION_FIELDS. */
  fields?: Record<string, 'camera' | 'microphone' | 'aiOverlay' | 'locationSharing'>;
  /** The authority the wearer holds, if any. Lets an approval wait "by <authority>" become confirm_each when the wearer may approve it. */
  wearerAuthority?: string;
}

/**
 * The ZoneRules a person's glasses should apply in one area. Compatible with
 * `ZoneRules` in `@neuroverseos/governance/spatial` (optional, not a dependency).
 */
export function glassesZoneRules(rulebook: Rulebook, areaId: string, roleId: string, baseOrOptions: ZoneRules | GlassesBridgeOptions = {}): ZoneRules {
  const options: GlassesBridgeOptions = 'camera' in baseOrOptions ? { base: baseOrOptions } : baseOrOptions;
  const base = options.base ?? OPEN_ZONE_RULES;
  const kind = options.kind ?? 'person';
  const fields = options.fields ?? GLASSES_ACTION_FIELDS;
  const versionProblem = rulebookVersionProblem(rulebook);
  if (versionProblem) throw new DomainRulesError(versionProblem);
  const vocab = vocabularyOf(rulebook);
  const area = vocab.areas.get(areaId);
  if (!area) throw new DomainRulesError(`Area "${areaId}" is not declared in this rulebook.`);
  const role = vocab.roles.get(roleId);
  if (!role || role.kind !== kind) throw new DomainRulesError(`"${roleId}" is not a declared ${kind} role.`);

  // With trusted keys declared, a confirmation on the device cannot satisfy an approval wait: only a verified signed approval can.
  const signedOnly = (rulebook.trustedKeys?.length ?? 0) > 0;
  const overlay: ZoneRules = { ...base };
  for (const [action, field] of Object.entries(fields)) {
    if (!vocab.actions.has(action)) continue;
    let level: 'allowed' | 'confirm_each' | 'blocked' = role.actions.includes(action) ? 'allowed' : 'blocked';
    if (level === 'allowed') {
      for (const r of rulebook.rules) {
        if (!resolveSelector(r.who, 'who', vocab).has(role.id)) continue;
        if (!resolveSelector(r.does, 'does', vocab).has(action)) continue;
        if (!resolveSelector(r.where, 'where', vocab).has(area.id)) continue;
        if (r.then.answer === 'deny') { level = 'blocked'; break; }
        if (r.then.answer === 'wait') {
          if (r.then.for === 'condition' || signedOnly || !wearerMayApprove(r.then.by, role, options.wearerAuthority, vocab)) { level = 'blocked'; break; }
          level = 'confirm_each';
        }
      }
    }
    if (field === 'camera' || field === 'microphone') overlay[field] = level;
    else if (field === 'locationSharing') overlay.locationSharing = level;
    else overlay.aiOverlay = level === 'allowed' ? base.aiOverlay : 'blocked';
  }
  return mergeRules(base, overlay);
}

/** Is the wearer someone the rule accepts as approver? Nobody named: yes. A role or role tag: the wearer's role. An authority: the wearer's, that or higher. */
function wearerMayApprove(by: string | undefined, role: { id: string; tags?: string[] }, wearerAuthority: string | undefined, vocab: ReturnType<typeof vocabularyOf>): boolean {
  if (!by) return true;
  if (by.startsWith('tag:')) return role.tags?.includes(by.slice(4)) ?? false;
  const need = authorityRank(vocab, by);
  if (need >= 0) { const has = wearerAuthority ? authorityRank(vocab, wearerAuthority) : -1; return has >= 0 && has <= need; }
  return role.id === by;
}

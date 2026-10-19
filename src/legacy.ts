/**
 * 0.2 input shape → 0.3 input. Deprecated; kept so a 0.2 site file still
 * compiles and decides the same way through the grocery-store template.
 *
 *   { site: { domainId, name, hours }, zones: [{ zoneId, kind, maxSpeedMps, allowRoles, denyRoles }],
 *     roles: [{ roleId, kind, actions, inherits, isStaff, afterHours }], answers }
 *
 * Zone kinds become area tags ("staff_only" → "staff-only"). A zone speed cap
 * becomes a limit rule `zone_speed_cap:<zone>`. `isStaff` becomes the role
 * tag "staff"; `afterHours` becomes "after-hours".
 */

import type { CompileDomainInput } from './compile';
import type { AreaDef, RoleDef, Rule } from './types';
import { DomainRulesError } from './vocabulary';
import { GROCERY_STORE } from './templates/grocery-store';

export interface LegacyZone {
  zoneId: string;
  name: string;
  kind: 'public' | 'staff_only' | 'restricted' | 'dock';
  maxSpeedMps?: number;
  allowRoles?: string[];
  denyRoles?: string[];
}

export interface LegacyRole {
  roleId: string;
  name: string;
  kind: 'robot' | 'person';
  actions: string[];
  inherits?: string;
  isStaff?: boolean;
  afterHours?: boolean;
}

/** @deprecated The 0.2 input shape. Use CompileDomainInput. */
export interface LegacyCompileInput {
  site: { domainId: string; name: string; spatialDomainId?: string; hours: { open: string; close: string } };
  zones: LegacyZone[];
  roles: LegacyRole[];
  answers?: Record<string, string>;
}

export function isLegacyInput(input: unknown): input is LegacyCompileInput {
  return !!input && typeof input === 'object' && Array.isArray((input as { zones?: unknown }).zones);
}

const KIND_TAG: Record<string, string> = { public: 'public', staff_only: 'staff-only', restricted: 'restricted', dock: 'dock' };

export function fromLegacyInput(input: LegacyCompileInput): CompileDomainInput {
  const setBy = 'site-manager';
  const rules: Rule[] = [];
  const seen = new Set<string>();
  const areas: AreaDef[] = input.zones.map(z => {
    if (seen.has(z.zoneId)) throw new DomainRulesError(`Zone "${z.zoneId}" is declared twice.`);
    seen.add(z.zoneId);
    if (!(z.kind in KIND_TAG)) throw new DomainRulesError(`Zone "${z.zoneId}" has unknown kind "${z.kind}". Kinds: ${Object.keys(KIND_TAG).join(', ')}.`);
    if (z.maxSpeedMps !== undefined) {
      if (!(z.maxSpeedMps >= 0)) throw new DomainRulesError(`Zone "${z.zoneId}" maxSpeedMps must be 0 or more.`);
      rules.push({
        id: `zone_speed_cap:${z.zoneId}`, setBy,
        text: `Robots move at most ${z.maxSpeedMps} m/s in ${z.name}.`,
        who: 'kind:robot', does: 'tag:movement', where: z.zoneId,
        then: { answer: 'limit', limits: { maxSpeedMps: z.maxSpeedMps } },
        reason: `Robots move at most ${z.maxSpeedMps} m/s in ${z.name}.`,
        source: { kind: 'declaration', ref: `zone:${z.zoneId}.maxSpeedMps` },
      });
    }
    const area: AreaDef = { id: z.zoneId, name: z.name, tags: [KIND_TAG[z.kind]] };
    if (z.allowRoles !== undefined) area.allowRoles = z.allowRoles;
    if (z.denyRoles !== undefined) area.denyRoles = z.denyRoles;
    return area;
  });
  const roles: RoleDef[] = input.roles.map(r => {
    const tags = [r.isStaff ? 'staff' : '', r.afterHours ? 'after-hours' : ''].filter(Boolean);
    const role: RoleDef = { id: r.roleId, name: r.name, kind: r.kind, actions: r.actions };
    if (r.inherits !== undefined) role.inherits = r.inherits;
    if (tags.length) role.tags = tags;
    return role;
  });
  const site: CompileDomainInput['site'] = { id: input.site.domainId, name: input.site.name, hours: input.site.hours };
  if (input.site.spatialDomainId !== undefined) site.spatialDomainId = input.site.spatialDomainId;
  return { site, template: GROCERY_STORE, areas, roles, answers: input.answers ?? {}, rules };
}

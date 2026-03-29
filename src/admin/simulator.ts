/**
 * Policy Simulator — "What happens if I change this?"
 *
 * Runs the governance engine against proposed policy changes before they deploy.
 * Uses the existing simulateWorld() engine and intent taxonomy to produce
 * a full matrix of what would be allowed, blocked, paused, or modified.
 *
 * This is the enterprise "measure twice, cut once" tool.
 */

import { evaluateGuard } from '../engine/guard-engine';
import {
  MENTRA_INTENT_TAXONOMY,
} from '../worlds/mentraos-intent-taxonomy';
import type { MentraIntentDefinition } from '../worlds/mentraos-intent-taxonomy';
import type { WorldDefinition } from '../types';
import type { GuardEvent, GuardVerdict } from '../contracts/guard-contract';
import type {
  OrgRole,
  OrgZone,
  ZoneRuleSet,
  ZonePolicyLevel,
  PolicySimulationRequest,
  PolicySimulationResult,
  IntentVerdict,
  PolicyConflict,
  PolicyDiff,
} from './types';

// ─── Zone-to-Verdict Mapping ────────────────────────────────────────────────

function zonePolicyToVerdict(
  policy: ZonePolicyLevel,
): 'allow' | 'block' | 'pause' {
  switch (policy) {
    case 'allow': return 'allow';
    case 'block': return 'block';
    case 'confirm_each': return 'pause';
  }
}

function intentMatchesPattern(intent: string, pattern: string): boolean {
  if (pattern.endsWith('*')) {
    return intent.startsWith(pattern.slice(0, -1));
  }
  return intent === pattern;
}

// ─── Evaluate a Single Intent ───────────────────────────────────────────────

function evaluateIntentAgainstZone(
  intentDef: MentraIntentDefinition,
  zone: OrgZone,
): 'allow' | 'block' | 'pause' {
  const rules = zone.rules;
  const domain = intentDef.domain;

  // Check custom rules first (most specific)
  for (const custom of rules.customRules) {
    if (intentMatchesPattern(intentDef.intent, custom.intentPattern)) {
      return custom.action === 'confirm' ? 'pause' : custom.action;
    }
  }

  // Map domain to zone policy
  if (domain === 'camera') return zonePolicyToVerdict(rules.camera);
  if (domain === 'microphone') return zonePolicyToVerdict(rules.microphone);
  if (domain === 'ai_data' || domain === 'ai_action') {
    if (intentDef.intent.includes('auto_purchase') || intentDef.intent.includes('auto_respond')) {
      return zonePolicyToVerdict(rules.aiActions);
    }
    if (intentDef.intent.includes('retain') || intentDef.intent.includes('share')) {
      return zonePolicyToVerdict(rules.dataRetention);
    }
    return zonePolicyToVerdict(rules.aiDataSend);
  }
  if (domain === 'location') return zonePolicyToVerdict(rules.locationSharing);

  return 'allow';
}

function evaluateIntentAgainstRole(
  intentDef: MentraIntentDefinition,
  role: OrgRole,
): 'allow' | 'block' | 'pause' {
  const def = role.definition;

  // Check cannotDo first
  for (const pattern of def.cannotDo) {
    if (
      intentDef.intent.includes(pattern) ||
      intentDef.description.toLowerCase().includes(pattern.toLowerCase()) ||
      intentDef.domain === pattern
    ) {
      return 'block';
    }
  }

  // Check requiresApproval
  if (def.requiresApproval) {
    return 'pause';
  }

  // Check canDo (if specified, act as allowlist)
  if (def.canDo.length > 0) {
    const allowed = def.canDo.some(
      (pattern) =>
        intentDef.intent.includes(pattern) ||
        intentDef.description.toLowerCase().includes(pattern.toLowerCase()) ||
        intentDef.domain === pattern,
    );
    if (!allowed) return 'block';
  }

  return 'allow';
}

// Most restrictive wins
function mergeVerdicts(
  ...verdicts: Array<'allow' | 'block' | 'pause' | 'modify'>
): 'allow' | 'block' | 'pause' | 'modify' {
  if (verdicts.includes('block')) return 'block';
  if (verdicts.includes('pause')) return 'pause';
  if (verdicts.includes('modify')) return 'modify';
  return 'allow';
}

// ─── Simulation Runner ──────────────────────────────────────────────────────

export function simulatePolicy(
  request: PolicySimulationRequest,
  currentRoles: OrgRole[],
  currentZones: OrgZone[],
  platformWorld?: WorldDefinition,
): PolicySimulationResult {
  const intentsToTest = request.intents
    ? MENTRA_INTENT_TAXONOMY.filter((i) => request.intents!.includes(i.intent))
    : MENTRA_INTENT_TAXONOMY;

  const verdicts: IntentVerdict[] = [];
  const conflicts: PolicyConflict[] = [];

  for (const intentDef of intentsToTest) {
    // ── Current policy verdict ──────────────────────────────────────────

    let currentVerdict: 'allow' | 'block' | 'pause' | 'modify' | undefined;

    if (request.type !== 'full_matrix') {
      const currentVerdictParts: Array<'allow' | 'block' | 'pause' | 'modify'> = [];

      // Evaluate against current zone (if specified)
      if (request.targetZoneId) {
        const currentZone = currentZones.find((z) => z.id === request.targetZoneId);
        if (currentZone) {
          currentVerdictParts.push(evaluateIntentAgainstZone(intentDef, currentZone));
        }
      }

      // Evaluate against current role (if specified)
      if (request.targetRoleId) {
        const currentRole = currentRoles.find((r) => r.id === request.targetRoleId);
        if (currentRole) {
          currentVerdictParts.push(evaluateIntentAgainstRole(intentDef, currentRole));
        }
      }

      currentVerdict = currentVerdictParts.length > 0
        ? mergeVerdicts(...currentVerdictParts)
        : 'allow';
    }

    // ── Proposed policy verdict ─────────────────────────────────────────

    const proposedParts: Array<'allow' | 'block' | 'pause' | 'modify'> = [];

    // Evaluate against proposed zone
    if (request.proposed?.zone) {
      proposedParts.push(evaluateIntentAgainstZone(intentDef, request.proposed.zone));
    } else if (request.targetZoneId) {
      const existingZone = currentZones.find((z) => z.id === request.targetZoneId);
      if (existingZone) {
        proposedParts.push(evaluateIntentAgainstZone(intentDef, existingZone));
      }
    }

    // Evaluate against proposed role
    if (request.proposed?.role) {
      proposedParts.push(evaluateIntentAgainstRole(intentDef, request.proposed.role));
    } else if (request.targetRoleId) {
      const existingRole = currentRoles.find((r) => r.id === request.targetRoleId);
      if (existingRole) {
        proposedParts.push(evaluateIntentAgainstRole(intentDef, existingRole));
      }
    }

    // If evaluating full matrix with no proposed changes, evaluate all roles × all zones
    if (request.type === 'full_matrix') {
      for (const zone of currentZones) {
        proposedParts.push(evaluateIntentAgainstZone(intentDef, zone));
      }
      for (const role of currentRoles) {
        proposedParts.push(evaluateIntentAgainstRole(intentDef, role));
      }
    }

    // Also run through platform world guard engine if available
    if (platformWorld) {
      try {
        const event: GuardEvent = {
          intent: intentDef.intent,
          scope: intentDef.domain,
          actionCategory: intentDef.action_category,
        };
        const guardResult = evaluateGuard(event, platformWorld, {});
        if (guardResult.status !== 'ALLOW') {
          proposedParts.push(
            guardResult.status === 'BLOCK' ? 'block' :
            guardResult.status === 'PAUSE' ? 'pause' :
            guardResult.status === 'MODIFY' ? 'modify' : 'allow',
          );
        }
      } catch {
        // Guard evaluation failed — don't block on it
      }
    }

    const proposedVerdict = proposedParts.length > 0
      ? mergeVerdicts(...proposedParts)
      : 'allow';

    const changed = currentVerdict !== undefined && currentVerdict !== proposedVerdict;

    verdicts.push({
      intent: intentDef.intent,
      description: intentDef.description,
      currentVerdict,
      proposedVerdict,
      changed,
      reason: buildReason(intentDef, proposedVerdict, request),
    });

    // ── Conflict detection ──────────────────────────────────────────────

    if (changed && currentVerdict === 'allow' && proposedVerdict === 'block') {
      conflicts.push({
        description: `"${intentDef.description}" was allowed but would now be blocked`,
        severity: intentDef.base_risk === 'low' ? 'warning' : 'error',
        intent: intentDef.intent,
        suggestion: `Verify that blocking ${intentDef.intent} won't break apps that depend on it`,
      });
    }
  }

  const summary = {
    total: verdicts.length,
    allowed: verdicts.filter((v) => v.proposedVerdict === 'allow').length,
    blocked: verdicts.filter((v) => v.proposedVerdict === 'block').length,
    paused: verdicts.filter((v) => v.proposedVerdict === 'pause').length,
    modified: verdicts.filter((v) => v.proposedVerdict === 'modify').length,
  };

  const diff: PolicyDiff[] | undefined = request.type !== 'full_matrix'
    ? verdicts
        .filter((v) => v.changed)
        .map((v) => ({
          intent: v.intent,
          from: v.currentVerdict!,
          to: v.proposedVerdict,
          explanation: `${v.description}: ${v.currentVerdict} → ${v.proposedVerdict}`,
        }))
    : undefined;

  return {
    request,
    timestamp: Date.now(),
    verdicts,
    summary,
    conflicts,
    diff,
  };
}

// ─── Full Matrix ────────────────────────────────────────────────────────────

/**
 * Generate a complete role × zone × intent matrix.
 * Shows every combination: what each role can do in each zone.
 */
export function simulateFullMatrix(
  roles: OrgRole[],
  zones: OrgZone[],
  platformWorld?: WorldDefinition,
): Map<string, Map<string, IntentVerdict[]>> {
  const matrix = new Map<string, Map<string, IntentVerdict[]>>();

  for (const role of roles) {
    const roleResults = new Map<string, IntentVerdict[]>();

    for (const zone of zones) {
      const result = simulatePolicy(
        {
          type: 'full_matrix',
          proposed: { role, zone },
        },
        [],
        [],
        platformWorld,
      );
      roleResults.set(zone.id, result.verdicts);
    }

    matrix.set(role.id, roleResults);
  }

  return matrix;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function buildReason(
  intentDef: MentraIntentDefinition,
  verdict: string,
  request: PolicySimulationRequest,
): string {
  if (verdict === 'block') {
    if (request.proposed?.zone) {
      return `Blocked by zone "${request.proposed.zone.name}" policy`;
    }
    if (request.proposed?.role) {
      return `Blocked by role "${request.proposed.role.name}" restrictions`;
    }
    return 'Blocked by combined policy';
  }
  if (verdict === 'pause') {
    return 'Requires user confirmation before proceeding';
  }
  if (verdict === 'modify') {
    return 'Allowed with modifications';
  }
  return 'Allowed by current policy';
}

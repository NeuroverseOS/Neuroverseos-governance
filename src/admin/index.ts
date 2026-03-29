/**
 * @neuroverseos/governance/admin
 *
 * Enterprise governance management layer for MentraOS.
 * Roles, zones, authority chains, device assignments, and policy simulation.
 *
 * Usage:
 *   import { GovernanceAdmin, InMemoryStorage } from '@neuroverseos/governance/admin';
 *
 *   const admin = new GovernanceAdmin(new InMemoryStorage(), platformWorld);
 *   await admin.createRole(role, actorId, actorRoleId);
 *   const sim = await admin.simulateZoneChange(zoneId, newRules, roleId, actorId, actorRoleId);
 */

export { GovernanceAdmin, GovernanceAdminError } from './manager';
export type { AdminErrorCode } from './manager';
export { InMemoryStorage } from './storage';
export { simulatePolicy, simulateFullMatrix } from './simulator';

export type {
  // Core entities
  OrgRole,
  OrgZone,
  RoleAssignment,
  AuthorityChain,
  AuthorityGrant,
  AuthorityLevel,
  // Zone config
  ZoneDiscoveryMethod,
  ZonePolicyLevel,
  ZoneRuleSet,
  CustomZoneRule,
  // Simulation
  PolicySimulationRequest,
  PolicySimulationResult,
  IntentVerdict,
  PolicyConflict,
  PolicyDiff,
  // Audit
  AuditEntry,
  AuditAction,
  // Storage interface
  AdminStorage,
} from './types';

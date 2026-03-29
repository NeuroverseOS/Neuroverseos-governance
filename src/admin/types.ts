/**
 * Admin Layer — Type Definitions
 *
 * Types for enterprise governance management: roles, zones, authority,
 * assignments, and policy simulation.
 *
 * These types sit on top of the core governance engine. The engine handles
 * evaluation. This layer handles who has what role, where zones are,
 * and who can change what.
 */

import type { WorldRoleDefinition, WorldDefinition } from '../types';

// ─── Roles ──────────────────────────────────────────────────────────────────

export interface OrgRole {
  /** Unique role identifier (e.g., 'floor-associate', 'shift-supervisor') */
  id: string;
  /** Human-readable name */
  name: string;
  /** Description of what this role is for */
  description: string;
  /** The governance role definition fed to the guard engine */
  definition: WorldRoleDefinition;
  /** Who created this role */
  createdBy: string;
  /** When this role was created */
  createdAt: number;
  /** Last modification */
  updatedAt: number;
  /** Whether this role is currently active */
  active: boolean;
}

export interface RoleAssignment {
  /** Unique assignment ID */
  id: string;
  /** Device or employee identifier */
  deviceId: string;
  /** Optional human name for readability */
  employeeName?: string;
  /** The role assigned */
  roleId: string;
  /** Who made this assignment */
  assignedBy: string;
  /** When assigned */
  assignedAt: number;
  /** Optional expiration (e.g., vendor visit ends at 5pm) */
  expiresAt?: number;
  /** Why this assignment was made */
  reason?: string;
}

// ─── Zones ──────────────────────────────────────────────────────────────────

export type ZoneDiscoveryMethod =
  | { type: 'ble_beacon'; beaconId: string }
  | { type: 'geofence'; lat: number; lng: number; radiusMeters: number }
  | { type: 'auki_anchor'; anchorId: string; confidence?: number }
  | { type: 'manual'; label: string };

export type ZonePolicyLevel = 'allow' | 'confirm_each' | 'block';

export interface ZoneRuleSet {
  camera: ZonePolicyLevel;
  microphone: ZonePolicyLevel;
  aiDataSend: ZonePolicyLevel;
  aiActions: ZonePolicyLevel;
  aiRecommendations: ZonePolicyLevel;
  locationSharing: ZonePolicyLevel;
  dataRetention: ZonePolicyLevel;
  bystanderProtection: 'standard' | 'elevated' | 'maximum';
  /** Custom rules targeting specific intents */
  customRules: CustomZoneRule[];
}

export interface CustomZoneRule {
  /** Rule identifier */
  id: string;
  /** Human description */
  description: string;
  /** Intent pattern to match (e.g., 'ai_auto_purchase', 'camera_*') */
  intentPattern: string;
  /** What to do */
  action: 'allow' | 'block' | 'confirm';
  /** Why this rule exists */
  rationale: string;
}

export interface OrgZone {
  /** Unique zone identifier */
  id: string;
  /** Human-readable name (e.g., 'Pharmacy', 'Loading Dock') */
  name: string;
  /** Description */
  description: string;
  /** Location/store this zone belongs to */
  locationId: string;
  /** How devices discover this zone */
  discovery: ZoneDiscoveryMethod;
  /** The governance rules for this zone */
  rules: ZoneRuleSet;
  /** Who created this zone */
  createdBy: string;
  /** When created */
  createdAt: number;
  /** Last modification */
  updatedAt: number;
  /** Whether this zone is currently active */
  active: boolean;
}

// ─── Authority ──────────────────────────────────────────────────────────────

export type AuthorityLevel =
  | 'viewer'       // Can see governance state, can't change anything
  | 'operator'     // Can assign existing roles to devices
  | 'supervisor'   // Can assign roles + grant temporary zone access
  | 'manager'      // Can create/modify zones and roles for their location
  | 'admin';       // Can do everything including modify authority chain

export interface AuthorityGrant {
  /** The role this authority applies to */
  roleId: string;
  /** What level of admin authority this role carries */
  authorityLevel: AuthorityLevel;
  /** Optional: restrict authority to specific location(s) */
  locationScope?: string[];
}

export interface AuthorityChain {
  /** Ordered list of authority grants (highest authority first) */
  grants: AuthorityGrant[];
  /** Can emergency override bypass authority chain? Always true for wearer safety. */
  emergencyOverrideAlwaysAllowed: true;
}

// ─── Audit ──────────────────────────────────────────────────────────────────

export type AuditAction =
  | 'role_created'
  | 'role_updated'
  | 'role_deleted'
  | 'role_assigned'
  | 'role_unassigned'
  | 'zone_created'
  | 'zone_updated'
  | 'zone_deleted'
  | 'authority_updated'
  | 'simulation_run'
  | 'policy_deployed';

export interface AuditEntry {
  /** Unique entry ID */
  id: string;
  /** What happened */
  action: AuditAction;
  /** Who did it */
  actorId: string;
  /** Actor's role at time of action */
  actorRole: string;
  /** When */
  timestamp: number;
  /** What was affected */
  targetType: 'role' | 'zone' | 'assignment' | 'authority' | 'simulation';
  /** Target identifier */
  targetId: string;
  /** What changed (before/after for updates) */
  changes?: {
    before?: Record<string, unknown>;
    after?: Record<string, unknown>;
  };
  /** Human-readable description */
  summary: string;
}

// ─── Simulation ─────────────────────────────────────────────────────────────

export interface PolicySimulationRequest {
  /** What are we simulating? */
  type: 'role_change' | 'zone_change' | 'authority_change' | 'full_matrix';
  /** The proposed change (new or modified role/zone) */
  proposed?: {
    role?: OrgRole;
    zone?: OrgZone;
    authority?: AuthorityGrant;
  };
  /** Which role to evaluate against (for zone changes) */
  targetRoleId?: string;
  /** Which zone to evaluate in (for role changes) */
  targetZoneId?: string;
  /** Specific intents to test (defaults to all 61) */
  intents?: string[];
}

export interface PolicySimulationResult {
  /** Request that produced this result */
  request: PolicySimulationRequest;
  /** When the simulation ran */
  timestamp: number;
  /** Per-intent verdicts */
  verdicts: IntentVerdict[];
  /** Summary stats */
  summary: {
    total: number;
    allowed: number;
    blocked: number;
    paused: number;
    modified: number;
  };
  /** Conflicts detected (things that might break) */
  conflicts: PolicyConflict[];
  /** Comparison with current policy (if this is a change) */
  diff?: PolicyDiff[];
}

export interface IntentVerdict {
  /** The intent evaluated */
  intent: string;
  /** Human description of the intent */
  description: string;
  /** Current verdict (before proposed change) */
  currentVerdict?: 'allow' | 'block' | 'pause' | 'modify';
  /** Proposed verdict (after change) */
  proposedVerdict: 'allow' | 'block' | 'pause' | 'modify';
  /** Whether this changed */
  changed: boolean;
  /** Why this verdict was reached */
  reason: string;
}

export interface PolicyConflict {
  /** What's conflicting */
  description: string;
  /** Severity */
  severity: 'warning' | 'error';
  /** Which intent is affected */
  intent: string;
  /** What the admin should consider */
  suggestion: string;
}

export interface PolicyDiff {
  /** The intent that changed */
  intent: string;
  /** Old verdict */
  from: string;
  /** New verdict */
  to: string;
  /** Human explanation */
  explanation: string;
}

// ─── Storage Interface ──────────────────────────────────────────────────────

/**
 * Pluggable storage backend. Mentra provides the database.
 * We provide the interface.
 */
export interface AdminStorage {
  // Roles
  getRoles(): Promise<OrgRole[]>;
  getRole(id: string): Promise<OrgRole | null>;
  saveRole(role: OrgRole): Promise<void>;
  deleteRole(id: string): Promise<void>;

  // Assignments
  getAssignments(): Promise<RoleAssignment[]>;
  getAssignmentsByDevice(deviceId: string): Promise<RoleAssignment[]>;
  getAssignmentsByRole(roleId: string): Promise<RoleAssignment[]>;
  saveAssignment(assignment: RoleAssignment): Promise<void>;
  deleteAssignment(id: string): Promise<void>;

  // Zones
  getZones(): Promise<OrgZone[]>;
  getZone(id: string): Promise<OrgZone | null>;
  getZonesByLocation(locationId: string): Promise<OrgZone[]>;
  saveZone(zone: OrgZone): Promise<void>;
  deleteZone(id: string): Promise<void>;

  // Authority
  getAuthorityChain(): Promise<AuthorityChain>;
  saveAuthorityChain(chain: AuthorityChain): Promise<void>;

  // Audit
  getAuditLog(options?: { limit?: number; offset?: number; action?: AuditAction }): Promise<AuditEntry[]>;
  appendAudit(entry: AuditEntry): Promise<void>;
}

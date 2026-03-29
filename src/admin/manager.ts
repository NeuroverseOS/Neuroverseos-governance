/**
 * Governance Admin Manager
 *
 * The management layer for enterprise governance. Handles CRUD for roles,
 * zones, authority chains, and device assignments. Enforces authority
 * levels — not everyone can change everything.
 *
 * Every mutation is audited. Every change can be simulated before deployment.
 */

import type { WorldDefinition } from '../types';
import type {
  AdminStorage,
  OrgRole,
  OrgZone,
  RoleAssignment,
  AuthorityChain,
  AuthorityGrant,
  AuthorityLevel,
  AuditEntry,
  AuditAction,
  PolicySimulationRequest,
  PolicySimulationResult,
} from './types';
import { simulatePolicy, simulateFullMatrix } from './simulator';
import type { IntentVerdict } from './types';

// ─── Authority Hierarchy ────────────────────────────────────────────────────

const AUTHORITY_RANK: Record<AuthorityLevel, number> = {
  viewer: 0,
  operator: 1,
  supervisor: 2,
  manager: 3,
  admin: 4,
};

function hasAuthority(
  actorLevel: AuthorityLevel,
  requiredLevel: AuthorityLevel,
): boolean {
  return AUTHORITY_RANK[actorLevel] >= AUTHORITY_RANK[requiredLevel];
}

// ─── Admin Manager ──────────────────────────────────────────────────────────

export class GovernanceAdmin {
  private storage: AdminStorage;
  private platformWorld?: WorldDefinition;

  constructor(storage: AdminStorage, platformWorld?: WorldDefinition) {
    this.storage = storage;
    this.platformWorld = platformWorld;
  }

  // ── Authority Check ───────────────────────────────────────────────────

  private async getActorAuthority(
    actorRoleId: string,
  ): Promise<AuthorityLevel> {
    const chain = await this.storage.getAuthorityChain();
    const grant = chain.grants.find((g) => g.roleId === actorRoleId);
    return grant?.authorityLevel ?? 'viewer';
  }

  private async checkAuthority(
    actorRoleId: string,
    requiredLevel: AuthorityLevel,
    locationId?: string,
  ): Promise<void> {
    const chain = await this.storage.getAuthorityChain();
    const grant = chain.grants.find((g) => g.roleId === actorRoleId);

    if (!grant || !hasAuthority(grant.authorityLevel, requiredLevel)) {
      throw new GovernanceAdminError(
        `Insufficient authority. Requires ${requiredLevel}, ` +
        `role "${actorRoleId}" has ${grant?.authorityLevel ?? 'viewer'}`,
        'INSUFFICIENT_AUTHORITY',
      );
    }

    // Check location scope if applicable
    if (locationId && grant.locationScope && grant.locationScope.length > 0) {
      if (!grant.locationScope.includes(locationId)) {
        throw new GovernanceAdminError(
          `Role "${actorRoleId}" does not have authority over location "${locationId}"`,
          'LOCATION_SCOPE_DENIED',
        );
      }
    }
  }

  private async audit(
    action: AuditAction,
    actorId: string,
    actorRole: string,
    targetType: AuditEntry['targetType'],
    targetId: string,
    summary: string,
    changes?: AuditEntry['changes'],
  ): Promise<void> {
    await this.storage.appendAudit({
      id: `audit_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      action,
      actorId,
      actorRole,
      timestamp: Date.now(),
      targetType,
      targetId,
      changes,
      summary,
    });
  }

  // ── Roles ─────────────────────────────────────────────────────────────

  async createRole(
    role: OrgRole,
    actorId: string,
    actorRoleId: string,
  ): Promise<OrgRole> {
    await this.checkAuthority(actorRoleId, 'manager');

    const existing = await this.storage.getRole(role.id);
    if (existing) {
      throw new GovernanceAdminError(
        `Role "${role.id}" already exists`,
        'ROLE_EXISTS',
      );
    }

    const now = Date.now();
    const newRole: OrgRole = {
      ...role,
      createdBy: actorId,
      createdAt: now,
      updatedAt: now,
      active: true,
    };

    await this.storage.saveRole(newRole);
    await this.audit(
      'role_created', actorId, actorRoleId, 'role', role.id,
      `Created role "${role.name}"`,
      { after: newRole as unknown as Record<string, unknown> },
    );

    return newRole;
  }

  async updateRole(
    roleId: string,
    updates: Partial<Pick<OrgRole, 'name' | 'description' | 'definition' | 'active'>>,
    actorId: string,
    actorRoleId: string,
  ): Promise<OrgRole> {
    await this.checkAuthority(actorRoleId, 'manager');

    const existing = await this.storage.getRole(roleId);
    if (!existing) {
      throw new GovernanceAdminError(`Role "${roleId}" not found`, 'ROLE_NOT_FOUND');
    }

    const updated: OrgRole = {
      ...existing,
      ...updates,
      id: roleId, // prevent ID mutation
      updatedAt: Date.now(),
    };

    await this.storage.saveRole(updated);
    await this.audit(
      'role_updated', actorId, actorRoleId, 'role', roleId,
      `Updated role "${roleId}"`,
      {
        before: existing as unknown as Record<string, unknown>,
        after: updated as unknown as Record<string, unknown>,
      },
    );

    return updated;
  }

  async deleteRole(
    roleId: string,
    actorId: string,
    actorRoleId: string,
  ): Promise<void> {
    await this.checkAuthority(actorRoleId, 'admin');

    const existing = await this.storage.getRole(roleId);
    if (!existing) {
      throw new GovernanceAdminError(`Role "${roleId}" not found`, 'ROLE_NOT_FOUND');
    }

    // Check if any devices are assigned to this role
    const assignments = await this.storage.getAssignmentsByRole(roleId);
    if (assignments.length > 0) {
      throw new GovernanceAdminError(
        `Cannot delete role "${roleId}" — ${assignments.length} device(s) still assigned. ` +
        `Unassign them first.`,
        'ROLE_IN_USE',
      );
    }

    await this.storage.deleteRole(roleId);
    await this.audit(
      'role_deleted', actorId, actorRoleId, 'role', roleId,
      `Deleted role "${existing.name}"`,
      { before: existing as unknown as Record<string, unknown> },
    );
  }

  async listRoles(): Promise<OrgRole[]> {
    return this.storage.getRoles();
  }

  async getRole(roleId: string): Promise<OrgRole | null> {
    return this.storage.getRole(roleId);
  }

  // ── Assignments ───────────────────────────────────────────────────────

  async assignRole(
    assignment: Omit<RoleAssignment, 'id' | 'assignedAt'>,
    actorId: string,
    actorRoleId: string,
  ): Promise<RoleAssignment> {
    await this.checkAuthority(actorRoleId, 'operator');

    // Verify the role exists
    const role = await this.storage.getRole(assignment.roleId);
    if (!role) {
      throw new GovernanceAdminError(
        `Role "${assignment.roleId}" not found`,
        'ROLE_NOT_FOUND',
      );
    }

    const full: RoleAssignment = {
      ...assignment,
      id: `assign_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      assignedAt: Date.now(),
    };

    await this.storage.saveAssignment(full);
    await this.audit(
      'role_assigned', actorId, actorRoleId, 'assignment', full.id,
      `Assigned role "${assignment.roleId}" to device "${assignment.deviceId}"` +
      (assignment.employeeName ? ` (${assignment.employeeName})` : ''),
    );

    return full;
  }

  async unassignRole(
    assignmentId: string,
    actorId: string,
    actorRoleId: string,
  ): Promise<void> {
    await this.checkAuthority(actorRoleId, 'operator');

    await this.storage.deleteAssignment(assignmentId);
    await this.audit(
      'role_unassigned', actorId, actorRoleId, 'assignment', assignmentId,
      `Removed role assignment "${assignmentId}"`,
    );
  }

  async getDeviceRole(deviceId: string): Promise<RoleAssignment | null> {
    const assignments = await this.storage.getAssignmentsByDevice(deviceId);
    // Filter expired assignments
    const now = Date.now();
    const active = assignments.filter(
      (a) => !a.expiresAt || a.expiresAt > now,
    );
    // Return most recent active assignment
    return active.sort((a, b) => b.assignedAt - a.assignedAt)[0] ?? null;
  }

  async listAssignments(): Promise<RoleAssignment[]> {
    return this.storage.getAssignments();
  }

  // ── Zones ─────────────────────────────────────────────────────────────

  async createZone(
    zone: OrgZone,
    actorId: string,
    actorRoleId: string,
  ): Promise<OrgZone> {
    await this.checkAuthority(actorRoleId, 'manager', zone.locationId);

    const existing = await this.storage.getZone(zone.id);
    if (existing) {
      throw new GovernanceAdminError(
        `Zone "${zone.id}" already exists`,
        'ZONE_EXISTS',
      );
    }

    const now = Date.now();
    const newZone: OrgZone = {
      ...zone,
      createdBy: actorId,
      createdAt: now,
      updatedAt: now,
      active: true,
    };

    await this.storage.saveZone(newZone);
    await this.audit(
      'zone_created', actorId, actorRoleId, 'zone', zone.id,
      `Created zone "${zone.name}" at location "${zone.locationId}"`,
      { after: newZone as unknown as Record<string, unknown> },
    );

    return newZone;
  }

  async updateZone(
    zoneId: string,
    updates: Partial<Pick<OrgZone, 'name' | 'description' | 'rules' | 'discovery' | 'active'>>,
    actorId: string,
    actorRoleId: string,
  ): Promise<OrgZone> {
    const existing = await this.storage.getZone(zoneId);
    if (!existing) {
      throw new GovernanceAdminError(`Zone "${zoneId}" not found`, 'ZONE_NOT_FOUND');
    }

    await this.checkAuthority(actorRoleId, 'manager', existing.locationId);

    const updated: OrgZone = {
      ...existing,
      ...updates,
      id: zoneId,
      updatedAt: Date.now(),
    };

    await this.storage.saveZone(updated);
    await this.audit(
      'zone_updated', actorId, actorRoleId, 'zone', zoneId,
      `Updated zone "${zoneId}"`,
      {
        before: existing as unknown as Record<string, unknown>,
        after: updated as unknown as Record<string, unknown>,
      },
    );

    return updated;
  }

  async deleteZone(
    zoneId: string,
    actorId: string,
    actorRoleId: string,
  ): Promise<void> {
    const existing = await this.storage.getZone(zoneId);
    if (!existing) {
      throw new GovernanceAdminError(`Zone "${zoneId}" not found`, 'ZONE_NOT_FOUND');
    }

    await this.checkAuthority(actorRoleId, 'admin', existing.locationId);

    await this.storage.deleteZone(zoneId);
    await this.audit(
      'zone_deleted', actorId, actorRoleId, 'zone', zoneId,
      `Deleted zone "${existing.name}"`,
      { before: existing as unknown as Record<string, unknown> },
    );
  }

  async listZones(locationId?: string): Promise<OrgZone[]> {
    if (locationId) {
      return this.storage.getZonesByLocation(locationId);
    }
    return this.storage.getZones();
  }

  async getZone(zoneId: string): Promise<OrgZone | null> {
    return this.storage.getZone(zoneId);
  }

  // ── Authority ─────────────────────────────────────────────────────────

  async updateAuthority(
    chain: AuthorityChain,
    actorId: string,
    actorRoleId: string,
  ): Promise<AuthorityChain> {
    await this.checkAuthority(actorRoleId, 'admin');

    const previous = await this.storage.getAuthorityChain();

    // Emergency override is always allowed — enforce this invariant
    const enforced: AuthorityChain = {
      ...chain,
      emergencyOverrideAlwaysAllowed: true,
    };

    await this.storage.saveAuthorityChain(enforced);
    await this.audit(
      'authority_updated', actorId, actorRoleId, 'authority', 'chain',
      'Updated authority chain',
      {
        before: previous as unknown as Record<string, unknown>,
        after: enforced as unknown as Record<string, unknown>,
      },
    );

    return enforced;
  }

  async getAuthority(): Promise<AuthorityChain> {
    return this.storage.getAuthorityChain();
  }

  // ── Simulation ────────────────────────────────────────────────────────

  async simulate(
    request: PolicySimulationRequest,
    actorId: string,
    actorRoleId: string,
  ): Promise<PolicySimulationResult> {
    // Viewers and above can run simulations (read-only)
    const roles = await this.storage.getRoles();
    const zones = await this.storage.getZones();

    const result = simulatePolicy(
      request,
      roles,
      zones,
      this.platformWorld,
    );

    await this.audit(
      'simulation_run', actorId, actorRoleId, 'simulation', request.type,
      `Ran ${request.type} simulation: ${result.summary.total} intents evaluated, ` +
      `${result.summary.blocked} blocked, ${result.conflicts.length} conflicts`,
    );

    return result;
  }

  async simulateMatrix(
    actorId: string,
    actorRoleId: string,
  ): Promise<Map<string, Map<string, IntentVerdict[]>>> {
    const roles = await this.storage.getRoles();
    const zones = await this.storage.getZones();

    const result = simulateFullMatrix(roles, zones, this.platformWorld);

    await this.audit(
      'simulation_run', actorId, actorRoleId, 'simulation', 'full_matrix',
      `Ran full matrix simulation: ${roles.length} roles × ${zones.length} zones`,
    );

    return result;
  }

  /**
   * Simulate a proposed role change and return only what would break.
   * The "measure twice" before deploying.
   */
  async simulateRoleChange(
    roleId: string,
    proposedDefinitionUpdates: Partial<OrgRole['definition']>,
    actorId: string,
    actorRoleId: string,
  ): Promise<PolicySimulationResult> {
    const existing = await this.storage.getRole(roleId);
    if (!existing) {
      throw new GovernanceAdminError(`Role "${roleId}" not found`, 'ROLE_NOT_FOUND');
    }

    const proposedRole: OrgRole = {
      ...existing,
      definition: { ...existing.definition, ...proposedDefinitionUpdates },
    };

    return this.simulate(
      {
        type: 'role_change',
        proposed: { role: proposedRole },
        targetRoleId: roleId,
      },
      actorId,
      actorRoleId,
    );
  }

  /**
   * Simulate a proposed zone rule change and return impact.
   */
  async simulateZoneChange(
    zoneId: string,
    proposedRuleUpdates: Partial<OrgZone['rules']>,
    targetRoleId: string,
    actorId: string,
    actorRoleId: string,
  ): Promise<PolicySimulationResult> {
    const existing = await this.storage.getZone(zoneId);
    if (!existing) {
      throw new GovernanceAdminError(`Zone "${zoneId}" not found`, 'ZONE_NOT_FOUND');
    }

    const proposedZone: OrgZone = {
      ...existing,
      rules: {
        ...existing.rules,
        ...proposedRuleUpdates,
        customRules: proposedRuleUpdates.customRules ?? existing.rules.customRules,
      },
    };

    return this.simulate(
      {
        type: 'zone_change',
        proposed: { zone: proposedZone },
        targetRoleId,
        targetZoneId: zoneId,
      },
      actorId,
      actorRoleId,
    );
  }

  // ── Audit Log ─────────────────────────────────────────────────────────

  async getAuditLog(options?: {
    limit?: number;
    offset?: number;
    action?: AuditAction;
  }): Promise<AuditEntry[]> {
    return this.storage.getAuditLog(options);
  }
}

// ─── Errors ─────────────────────────────────────────────────────────────────

export type AdminErrorCode =
  | 'INSUFFICIENT_AUTHORITY'
  | 'LOCATION_SCOPE_DENIED'
  | 'ROLE_EXISTS'
  | 'ROLE_NOT_FOUND'
  | 'ROLE_IN_USE'
  | 'ZONE_EXISTS'
  | 'ZONE_NOT_FOUND';

export class GovernanceAdminError extends Error {
  code: AdminErrorCode;
  constructor(message: string, code: AdminErrorCode) {
    super(message);
    this.name = 'GovernanceAdminError';
    this.code = code;
  }
}

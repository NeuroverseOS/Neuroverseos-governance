/**
 * In-Memory Storage — Reference Implementation
 *
 * Ships with the package for development and testing.
 * Mentra (or any integrator) replaces this with their own database adapter
 * by implementing the AdminStorage interface.
 */

import type {
  AdminStorage,
  OrgRole,
  RoleAssignment,
  OrgZone,
  AuthorityChain,
  AuditEntry,
  AuditAction,
} from './types';

export class InMemoryStorage implements AdminStorage {
  private roles = new Map<string, OrgRole>();
  private assignments = new Map<string, RoleAssignment>();
  private zones = new Map<string, OrgZone>();
  private authority: AuthorityChain = {
    grants: [],
    emergencyOverrideAlwaysAllowed: true,
  };
  private audit: AuditEntry[] = [];

  // ── Roles ───────────────────────────────────────────────────────────────

  async getRoles(): Promise<OrgRole[]> {
    return Array.from(this.roles.values());
  }

  async getRole(id: string): Promise<OrgRole | null> {
    return this.roles.get(id) ?? null;
  }

  async saveRole(role: OrgRole): Promise<void> {
    this.roles.set(role.id, role);
  }

  async deleteRole(id: string): Promise<void> {
    this.roles.delete(id);
  }

  // ── Assignments ─────────────────────────────────────────────────────────

  async getAssignments(): Promise<RoleAssignment[]> {
    return Array.from(this.assignments.values());
  }

  async getAssignmentsByDevice(deviceId: string): Promise<RoleAssignment[]> {
    return Array.from(this.assignments.values()).filter(
      (a) => a.deviceId === deviceId,
    );
  }

  async getAssignmentsByRole(roleId: string): Promise<RoleAssignment[]> {
    return Array.from(this.assignments.values()).filter(
      (a) => a.roleId === roleId,
    );
  }

  async saveAssignment(assignment: RoleAssignment): Promise<void> {
    this.assignments.set(assignment.id, assignment);
  }

  async deleteAssignment(id: string): Promise<void> {
    this.assignments.delete(id);
  }

  // ── Zones ───────────────────────────────────────────────────────────────

  async getZones(): Promise<OrgZone[]> {
    return Array.from(this.zones.values());
  }

  async getZone(id: string): Promise<OrgZone | null> {
    return this.zones.get(id) ?? null;
  }

  async getZonesByLocation(locationId: string): Promise<OrgZone[]> {
    return Array.from(this.zones.values()).filter(
      (z) => z.locationId === locationId,
    );
  }

  async saveZone(zone: OrgZone): Promise<void> {
    this.zones.set(zone.id, zone);
  }

  async deleteZone(id: string): Promise<void> {
    this.zones.delete(id);
  }

  // ── Authority ───────────────────────────────────────────────────────────

  async getAuthorityChain(): Promise<AuthorityChain> {
    return this.authority;
  }

  async saveAuthorityChain(chain: AuthorityChain): Promise<void> {
    this.authority = chain;
  }

  // ── Audit ───────────────────────────────────────────────────────────────

  async getAuditLog(options?: {
    limit?: number;
    offset?: number;
    action?: AuditAction;
  }): Promise<AuditEntry[]> {
    let entries = this.audit;
    if (options?.action) {
      entries = entries.filter((e) => e.action === options.action);
    }
    const offset = options?.offset ?? 0;
    const limit = options?.limit ?? 100;
    return entries.slice(offset, offset + limit);
  }

  async appendAudit(entry: AuditEntry): Promise<void> {
    this.audit.push(entry);
  }
}

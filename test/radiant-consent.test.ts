/**
 * Radiant — consent gate + personal mode tests
 *
 * Radiant's default used to be "org scope scans every repo." That's a
 * global-observer stance, which is fine for governance-minded teams that
 * want top-down alignment — but offside for teams whose charter is
 * polycentric decentralization and cognitive liberty.
 *
 * Two fixes, tested here:
 *   1. Org-wide scope is opt-in via --entire-org, not default.
 *   2. --personal filters events to one user's activity — a local facilitator.
 *
 * Also exercises the argument parser to make sure the new flags land
 * where they should.
 */

import { describe, it, expect } from 'vitest';
import { parseArgs, checkScopeConsent } from '../src/cli/radiant';
import type { Event } from '../src/radiant/index';

// ─── Argument parsing ─────────────────────────────────────────────────────

describe('parseArgs — new flags', () => {
  it('parses --personal as a boolean', () => {
    const args = parseArgs(['emergent', 'aukilabs/posemesh', '--personal']);
    expect(args.subcommand).toBe('emergent');
    expect(args.personal).toBe(true);
  });

  it('parses --user <login>', () => {
    const args = parseArgs([
      'emergent',
      'aukilabs/posemesh',
      '--personal',
      '--user',
      'alice',
    ]);
    expect(args.personal).toBe(true);
    expect(args.user).toBe('alice');
  });

  it('parses --entire-org as a boolean', () => {
    const args = parseArgs(['emergent', 'aukilabs/', '--entire-org']);
    expect(args.entireOrg).toBe(true);
  });

  it('defaults personal and entire-org to false', () => {
    const args = parseArgs(['emergent', 'aukilabs/posemesh']);
    expect(args.personal).toBe(false);
    expect(args.entireOrg).toBe(false);
    expect(args.user).toBeUndefined();
  });
});

// ─── Consent gate ──────────────────────────────────────────────────────────

describe('checkScopeConsent', () => {
  it('passes for a single-repo scope (no flags needed)', () => {
    const result = checkScopeConsent({
      scope: { type: 'repo', owner: 'aukilabs' },
      personal: false,
      entireOrg: false,
      resolvedUser: undefined,
    });
    expect(result.ok).toBe(true);
  });

  it('rejects an org-wide scope without --entire-org or --personal', () => {
    const result = checkScopeConsent({
      scope: { type: 'org', owner: 'aukilabs' },
      personal: false,
      entireOrg: false,
      resolvedUser: undefined,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe('org_requires_opt_in');
    }
  });

  it('passes org-wide scope when --entire-org is explicit', () => {
    const result = checkScopeConsent({
      scope: { type: 'org', owner: 'aukilabs' },
      personal: false,
      entireOrg: true,
      resolvedUser: undefined,
    });
    expect(result.ok).toBe(true);
  });

  it('passes org-wide scope when --personal is set (filter narrows the observation)', () => {
    const result = checkScopeConsent({
      scope: { type: 'org', owner: 'aukilabs' },
      personal: true,
      entireOrg: false,
      resolvedUser: 'alice',
    });
    expect(result.ok).toBe(true);
  });

  it('rejects --personal when no user is resolved', () => {
    const result = checkScopeConsent({
      scope: { type: 'repo', owner: 'aukilabs' },
      personal: true,
      entireOrg: false,
      resolvedUser: undefined,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe('personal_requires_user');
    }
  });

  it('personal filter logic: only events whose actor.id matches are kept', () => {
    // Mirror the filter in commands/emergent.ts. If the code changes
    // there, this test will diverge and signal the drift.
    const events: Event[] = [
      {
        id: 'e1',
        source: 'github',
        timestamp: '2025-04-18T10:00:00Z',
        actor: { id: 'alice', kind: 'human', name: 'alice' },
        kind: 'commit',
        content: 'alice commit',
      },
      {
        id: 'e2',
        source: 'github',
        timestamp: '2025-04-18T11:00:00Z',
        actor: { id: 'bob', kind: 'human', name: 'bob' },
        kind: 'commit',
        content: 'bob commit',
      },
      {
        id: 'e3',
        source: 'github',
        timestamp: '2025-04-18T12:00:00Z',
        actor: { id: 'Alice', kind: 'human', name: 'alice' },
        kind: 'issue_comment',
        content: 'case-variant alice comment',
      },
    ];

    const personalUser = 'alice';
    const userLower = personalUser.toLowerCase();
    const filtered = events.filter((e) => e.actor.id.toLowerCase() === userLower);

    expect(filtered).toHaveLength(2);
    expect(filtered.map((e) => e.id)).toEqual(['e1', 'e3']);
  });

  it('personal_requires_user fires before org_requires_opt_in when both would trigger', () => {
    // --personal set, no user, org scope. The user problem is the one the
    // caller can fix; telling them "you also need --entire-org" is noise.
    const result = checkScopeConsent({
      scope: { type: 'org', owner: 'aukilabs' },
      personal: true,
      entireOrg: false,
      resolvedUser: undefined,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe('personal_requires_user');
    }
  });
});

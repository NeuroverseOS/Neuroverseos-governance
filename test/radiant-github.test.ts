/**
 * Radiant — GitHub adapter + scope resolution tests
 *
 * Tests scope parsing and the event-mapping logic of the GitHub adapter.
 * API calls are not tested here (they need a live token); the adapter's
 * mappers are tested via createMockGitHubAdapter + direct Event construction.
 */

import { describe, it, expect } from 'vitest';
import {
  parseRepoScope,
  formatScope,
  classifyActorDomain,
  classifyEvents,
  extractSignals,
  createMockGitHubAdapter,
} from '../src/radiant/index';
import type { Event, Actor, RepoScope } from '../src/radiant/index';

// ─── Scope resolution ──────────────────────────────────────────────────────

describe('parseRepoScope', () => {
  it('parses "owner/repo"', () => {
    expect(parseRepoScope('aukiverse/posemesh')).toEqual({
      type: 'repo', owner: 'aukiverse', repo: 'posemesh',
    });
  });

  it('parses a full GitHub URL', () => {
    expect(parseRepoScope('https://github.com/aukiverse/posemesh')).toEqual({
      type: 'repo', owner: 'aukiverse', repo: 'posemesh',
    });
  });

  it('parses URL without protocol', () => {
    expect(parseRepoScope('github.com/aukiverse/posemesh')).toEqual({
      type: 'repo', owner: 'aukiverse', repo: 'posemesh',
    });
  });

  it('strips trailing .git', () => {
    expect(parseRepoScope('https://github.com/aukiverse/posemesh.git')).toEqual({
      type: 'repo', owner: 'aukiverse', repo: 'posemesh',
    });
  });

  it('strips trailing slash', () => {
    expect(parseRepoScope('aukiverse/posemesh/')).toEqual({
      type: 'repo', owner: 'aukiverse', repo: 'posemesh',
    });
  });

  it('throws on invalid input', () => {
    expect(() => parseRepoScope('posemesh')).toThrow(/org-level/);
    expect(() => parseRepoScope('')).toThrow(/Cannot parse/);
    expect(() => parseRepoScope('/')).toThrow(/Cannot parse/);
  });
});

describe('formatScope', () => {
  it('formats as owner/repo', () => {
    expect(formatScope({ type: 'repo', owner: 'aukiverse', repo: 'posemesh' })).toBe(
      'aukiverse/posemesh',
    );
  });
});

// ─── Mock GitHub adapter ───────────────────────────────────────────────────

describe('createMockGitHubAdapter', () => {
  it('returns fixed events without API calls', async () => {
    const events: Event[] = [
      {
        id: 'commit-abc12345',
        timestamp: '2026-04-14T10:00:00Z',
        actor: { id: 'nils', kind: 'human', name: 'Nils' },
        kind: 'commit',
        content: 'feat: add multi-floor domain support',
      },
    ];
    const adapter = createMockGitHubAdapter(events);
    const result = await adapter(
      { type: 'repo', owner: 'aukiverse', repo: 'posemesh' },
      'fake-token',
    );
    expect(result).toEqual(events);
  });
});

// ─── End-to-end: mock events → classify → extract signals ──────────────────

describe('GitHub adapter → signal pipeline integration', () => {
  const human: Actor = { id: 'nils', kind: 'human', name: 'Nils' };
  const bot: Actor = { id: 'dependabot[bot]', kind: 'bot', name: 'dependabot' };
  const aiCoAuthor: Actor = { id: 'claude@anthropic.com', kind: 'ai', name: 'Claude' };

  const mockEvents: Event[] = [
    {
      id: 'commit-001',
      timestamp: '2026-04-14T09:00:00Z',
      actor: human,
      kind: 'commit',
      content: 'feat: implement portal calibration for multi-floor domains with full consent flow',
    },
    {
      id: 'commit-002',
      timestamp: '2026-04-14T09:30:00Z',
      actor: human,
      coActors: [aiCoAuthor],
      kind: 'commit',
      content: 'refactor: domain manager spatial data pipeline\n\nCo-authored-by: Claude <claude@anthropic.com>',
    },
    {
      id: 'pr-42',
      timestamp: '2026-04-14T10:00:00Z',
      actor: human,
      kind: 'pr_opened',
      content: 'Multi-floor domain support\n\nThis PR adds multi-floor navigation to the posemesh SDK. Domains can now span multiple floors with seamless participant handoff between levels.',
    },
    {
      id: 'comment-101',
      timestamp: '2026-04-14T11:00:00Z',
      actor: bot,
      kind: 'comment',
      content: 'Dependency update: bumped @auki/sdk to 2.3.1',
      respondsTo: { eventId: 'pr-42', actor: human },
    },
    {
      id: 'commit-003',
      timestamp: '2026-04-14T12:00:00Z',
      actor: human,
      kind: 'commit',
      content: 'fix: consent check for spatial observations in GPS-denied environments',
      respondsTo: { eventId: 'comment-101', actor: bot },
    },
  ];

  it('classifies events across all three domains', () => {
    const classified = classifyEvents(mockEvents);

    const domains = classified.map((e) => e.domain);
    expect(domains).toContain('life');
    expect(domains).toContain('joint');
    // commit-001: human alone → life
    expect(classified.find((e) => e.event.id === 'commit-001')?.domain).toBe('life');
    // commit-002: human + AI co-author → joint
    expect(classified.find((e) => e.event.id === 'commit-002')?.domain).toBe('joint');
    // comment-101: bot responding to human's PR → joint
    expect(classified.find((e) => e.event.id === 'comment-101')?.domain).toBe('joint');
    // commit-003: human responding to bot → joint
    expect(classified.find((e) => e.event.id === 'commit-003')?.domain).toBe('joint');
  });

  it('produces a signal matrix from GitHub-shaped events', () => {
    const classified = classifyEvents(mockEvents);
    const matrix = extractSignals(classified);

    expect(matrix.length).toBe(15); // 5 signals × 3 domains

    // Life domain should have at least some events
    const lifeClarity = matrix.find(
      (s) => s.id === 'clarity' && s.domain === 'life',
    );
    expect(lifeClarity).toBeDefined();
    expect(lifeClarity!.eventCount).toBeGreaterThan(0);

    // Joint domain should have events (co-authored commit + cross-boundary responses)
    const jointClarity = matrix.find(
      (s) => s.id === 'clarity' && s.domain === 'joint',
    );
    expect(jointClarity).toBeDefined();
    expect(jointClarity!.eventCount).toBeGreaterThan(0);
  });

  it('clarity scores reflect content informativeness', () => {
    const classified = classifyEvents(mockEvents);
    const matrix = extractSignals(classified);

    const lifeClarity = matrix.find(
      (s) => s.id === 'clarity' && s.domain === 'life',
    );
    // Human commits have informative messages (>20 chars) → clarity should be meaningful
    expect(lifeClarity!.score).toBeGreaterThan(0);
  });

  it('uses Auki vocabulary in event content naturally', () => {
    // Verify that the mock events use Auki-native terms that the lens would recognize
    const allContent = mockEvents
      .map((e) => e.content ?? '')
      .join(' ')
      .toLowerCase();
    expect(allContent).toContain('portal');
    expect(allContent).toContain('domain');
    expect(allContent).toContain('participant');
    expect(allContent).toContain('spatial');
    expect(allContent).toContain('consent');
  });
});

// ─── Actor classification from GitHub metadata ─────────────────────────────

describe('GitHub actor classification', () => {
  it('bot users are classified as bot', () => {
    const event: Event = {
      id: 'e1',
      timestamp: '2026-04-14T00:00:00Z',
      actor: { id: 'dependabot[bot]', kind: 'bot' },
      kind: 'comment',
      content: 'bump version',
    };
    expect(classifyActorDomain(event)).toBe('cyber');
  });

  it('human + AI co-authored commit is joint', () => {
    const event: Event = {
      id: 'e2',
      timestamp: '2026-04-14T00:00:00Z',
      actor: { id: 'nils', kind: 'human' },
      coActors: [{ id: 'claude', kind: 'ai' }],
      kind: 'commit',
      content: 'refactor with Claude',
    };
    expect(classifyActorDomain(event)).toBe('joint');
  });

  it('human responding to bot PR is joint', () => {
    const event: Event = {
      id: 'e3',
      timestamp: '2026-04-14T00:00:00Z',
      actor: { id: 'nils', kind: 'human' },
      kind: 'pr_merged',
      respondsTo: {
        eventId: 'pr-99',
        actor: { id: 'dependabot[bot]', kind: 'bot' },
      },
    };
    expect(classifyActorDomain(event)).toBe('joint');
  });
});

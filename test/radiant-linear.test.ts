/**
 * Radiant — Linear adapter tests
 *
 * Tests the signal-formatter and shape of LinearSignals. The fetch
 * pipeline itself hits api.linear.app and needs a live LINEAR_API_KEY,
 * so it's not covered here — same pattern as radiant-github.test.ts.
 */

import { describe, it, expect } from 'vitest';
import {
  formatLinearSignalsForPrompt,
  type LinearSignals,
} from '../src/radiant/index';

const emptySignals: LinearSignals = {
  issuesCreated: 0,
  issuesCompleted: 0,
  issuesOpen: 0,
  issuesStalled: 0,
  cycleCompletionRate: null,
  uniqueAssignees: 0,
  commentsTotal: 0,
  topProjects: [],
};

describe('formatLinearSignalsForPrompt', () => {
  it('returns empty string when no activity', () => {
    expect(formatLinearSignalsForPrompt(emptySignals)).toBe('');
  });

  it('reports creation and completion counts', () => {
    const out = formatLinearSignalsForPrompt({
      ...emptySignals,
      issuesCreated: 12,
      issuesCompleted: 7,
      issuesOpen: 23,
    });
    expect(out).toContain('12 issues created');
    expect(out).toContain('7 completed');
    expect(out).toContain('23 issues still open');
  });

  it('surfaces stalled issues as a distinct line', () => {
    const out = formatLinearSignalsForPrompt({
      ...emptySignals,
      issuesOpen: 10,
      issuesStalled: 4,
    });
    expect(out).toContain("4 in-progress issues haven't moved in 14+ days");
  });

  it('reports cycle completion rate as a percentage', () => {
    const out = formatLinearSignalsForPrompt({
      ...emptySignals,
      issuesOpen: 5,
      cycleCompletionRate: 0.62,
    });
    expect(out).toContain('completed 62%');
  });

  it('omits cycle completion when null', () => {
    const out = formatLinearSignalsForPrompt({
      ...emptySignals,
      issuesOpen: 5,
      cycleCompletionRate: null,
    });
    expect(out).not.toContain('Cycles ended in window completed');
  });

  it('includes the stated-vs-shipped framing so the lens can detect drift', () => {
    const out = formatLinearSignalsForPrompt({
      ...emptySignals,
      issuesCreated: 3,
      issuesCompleted: 1,
    });
    expect(out).toContain('Linear is where the team states what it will build.');
    expect(out).toContain('GitHub is where the team reveals what actually got built.');
  });

  it('lists top projects when present', () => {
    const out = formatLinearSignalsForPrompt({
      ...emptySignals,
      issuesCreated: 2,
      topProjects: ['Sovereign Conduit', 'Radiant', 'Exocortex'],
    });
    expect(out).toContain('Most active projects: Sovereign Conduit, Radiant, Exocortex');
  });
});

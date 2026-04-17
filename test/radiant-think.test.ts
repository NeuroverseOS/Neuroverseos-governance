/**
 * Radiant — think command tests
 *
 * Covers:
 *   - System prompt composition (pure function)
 *   - Voice check / forbidden phrase detection
 *   - The think command end-to-end with mocked AI
 *   - Edge cases: unknown lens, empty worldmodel, voice violations
 */

import { describe, it, expect } from 'vitest';
import {
  composeSystemPrompt,
  checkForbiddenPhrases,
  think,
  createMockAI,
  aukiBuilderLens,
} from '../src/radiant/index';
import type {
  RenderingLens,
  ThinkResult,
} from '../src/radiant/index';

// ─── System prompt composition ─────────────────────────────────────────────

describe('composeSystemPrompt', () => {
  const sampleWorldmodel = '# Core Model Geometry\n\n## Mission\nBuild the posemesh.';

  it('includes the worldmodel content', () => {
    const prompt = composeSystemPrompt(sampleWorldmodel, aukiBuilderLens);
    expect(prompt).toContain('Build the posemesh');
  });

  it('includes the lens name', () => {
    const prompt = composeSystemPrompt(sampleWorldmodel, aukiBuilderLens);
    expect(prompt).toContain('auki-builder');
  });

  it('includes evaluation questions from the primary frame', () => {
    const prompt = composeSystemPrompt(sampleWorldmodel, aukiBuilderLens);
    for (const q of aukiBuilderLens.primary_frame.evaluation_questions) {
      expect(prompt).toContain(q);
    }
  });

  it('includes overlap emergent states', () => {
    const prompt = composeSystemPrompt(sampleWorldmodel, aukiBuilderLens);
    expect(prompt).toContain('Inspiration');
    expect(prompt).toContain('Trust');
    expect(prompt).toContain('Hope');
  });

  it('includes the center identity', () => {
    const prompt = composeSystemPrompt(sampleWorldmodel, aukiBuilderLens);
    expect(prompt).toContain('Collective Vanguard Leader');
  });

  it('includes the scoring rubric', () => {
    const prompt = composeSystemPrompt(sampleWorldmodel, aukiBuilderLens);
    expect(prompt).toContain(aukiBuilderLens.primary_frame.scoring_rubric.slice(0, 40));
  });

  it('includes the output translation discipline', () => {
    const prompt = composeSystemPrompt(sampleWorldmodel, aukiBuilderLens);
    expect(prompt).toContain('Translate before output');
  });

  it('includes jargon translations', () => {
    const prompt = composeSystemPrompt(sampleWorldmodel, aukiBuilderLens);
    expect(prompt).toContain('your strategy file');
  });

  it('includes voice register', () => {
    const prompt = composeSystemPrompt(sampleWorldmodel, aukiBuilderLens);
    expect(prompt).toContain('diagnosis mode');
  });

  it('includes voice directives', () => {
    const prompt = composeSystemPrompt(sampleWorldmodel, aukiBuilderLens);
    expect(prompt).toContain('Active voice');
    expect(prompt).toContain('required');
    expect(prompt).toContain('Honesty about failure');
  });

  it('includes forbidden phrases as guardrails', () => {
    const prompt = composeSystemPrompt(sampleWorldmodel, aukiBuilderLens);
    expect(prompt).toContain('it may be beneficial to consider');
    expect(prompt).toContain('future foresight');
    expect(prompt).toContain('stakeholders');
  });

  it('includes strategic decision patterns', () => {
    const prompt = composeSystemPrompt(sampleWorldmodel, aukiBuilderLens);
    expect(prompt).toContain('Skip the bottleneck');
    expect(prompt).toContain('Coalition before standard');
  });

  it('is deterministic — same input produces same output', () => {
    const a = composeSystemPrompt(sampleWorldmodel, aukiBuilderLens);
    const b = composeSystemPrompt(sampleWorldmodel, aukiBuilderLens);
    expect(a).toBe(b);
  });

  it('handles empty worldmodel content gracefully', () => {
    const prompt = composeSystemPrompt('', aukiBuilderLens);
    expect(prompt).toContain('Worldmodel');
    expect(prompt).toContain('auki-builder');
  });
});

// ─── Voice check ───────────────────────────────────────────────────────────

describe('checkForbiddenPhrases', () => {
  it('returns empty array for clean text', () => {
    const violations = checkForbiddenPhrases(
      aukiBuilderLens,
      'The strategic thinking is strong here.',
    );
    expect(violations).toEqual([]);
  });

  it('catches a single forbidden phrase', () => {
    const violations = checkForbiddenPhrases(
      aukiBuilderLens,
      'It may be beneficial to consider a new approach.',
    );
    expect(violations).toHaveLength(1);
    expect(violations[0].phrase).toBe('it may be beneficial to consider');
  });

  it('catches bucket names as forbidden labels', () => {
    const violations = checkForbiddenPhrases(
      aukiBuilderLens,
      'Future Foresight is strong in this area.',
    );
    expect(violations.length).toBeGreaterThanOrEqual(1);
    expect(violations[0].phrase).toBe('future foresight');
  });

  it('matches are case-insensitive', () => {
    const violations = checkForbiddenPhrases(
      aukiBuilderLens,
      'THERE APPEARS TO BE a problem.',
    );
    expect(violations).toHaveLength(1);
    expect(violations[0].phrase).toBe('there appears to be');
  });

  it('reports multiple violations in order of appearance', () => {
    const violations = checkForbiddenPhrases(
      aukiBuilderLens,
      'Going forward, stakeholders should consider the unparalleled synergy.',
    );
    expect(violations.length).toBeGreaterThanOrEqual(4);
    const phrases = violations.map((v) => v.phrase);
    expect(phrases).toContain('going forward');
    expect(phrases).toContain('stakeholders');
    expect(phrases).toContain('unparalleled');
    expect(phrases).toContain('synergy');
    // Ordered by offset
    for (let i = 1; i < violations.length; i++) {
      expect(violations[i].offset).toBeGreaterThanOrEqual(violations[i - 1].offset);
    }
  });

  it('detects repeated violations', () => {
    const violations = checkForbiddenPhrases(
      aukiBuilderLens,
      'Synergy here. More synergy there.',
    );
    expect(violations.filter((v) => v.phrase === 'synergy')).toHaveLength(2);
  });

  it('returns empty for text that uses allowed vocabulary', () => {
    const violations = checkForbiddenPhrases(
      aukiBuilderLens,
      'The architectural thinking is clear. Partnership development across modules is the move. Trust will emerge when both happen together.',
    );
    expect(violations).toEqual([]);
  });
});

// ─── think command ─────────────────────────────────────────────────────────

describe('think', () => {
  const worldmodelContent = '# Core Model Geometry\n\n## Mission\nMake the world machine-readable.';

  it('returns a response from the AI, lens name, and voice check', async () => {
    const result = await think({
      worldmodelContent,
      lensId: 'auki-builder',
      query: 'What is the biggest risk right now?',
      ai: createMockAI('Partnership development is weak. Force cross-module ownership.'),
    });
    expect(result.response).toContain('Partnership development');
    expect(result.lens).toBe('auki-builder');
    expect(result.voiceClean).toBe(true);
    expect(result.voiceViolations).toEqual([]);
    expect(result.systemPrompt).toContain('auki-builder');
  });

  it('detects voice violations in the AI response', async () => {
    const result = await think({
      worldmodelContent,
      lensId: 'auki-builder',
      query: 'What should we do?',
      ai: createMockAI(
        'It may be beneficial to consider leveraging our synergies going forward.',
      ),
    });
    expect(result.voiceClean).toBe(false);
    expect(result.voiceViolations.length).toBeGreaterThan(0);
    const phrases = result.voiceViolations.map((v) => v.phrase);
    expect(phrases).toContain('it may be beneficial to consider');
    expect(phrases).toContain('synergies');
    expect(phrases).toContain('going forward');
  });

  it('detects bucket-name leaks in the AI response', async () => {
    const result = await think({
      worldmodelContent,
      lensId: 'auki-builder',
      query: 'Evaluate this PR.',
      ai: createMockAI('Narrative Dynamics is strong in this PR.'),
    });
    expect(result.voiceClean).toBe(false);
    expect(result.voiceViolations.some((v) => v.phrase === 'narrative dynamics')).toBe(true);
  });

  it('throws on unknown lens id', async () => {
    await expect(
      think({
        worldmodelContent,
        lensId: 'does-not-exist',
        query: 'test',
        ai: createMockAI('response'),
      }),
    ).rejects.toThrow(/not found/);
  });

  it('includes the system prompt in the result for transparency', async () => {
    const result = await think({
      worldmodelContent,
      lensId: 'auki-builder',
      query: 'test',
      ai: createMockAI('The systems design is clear.'),
    });
    expect(result.systemPrompt).toContain('Guardrails');
  });

  it('passes the composed system prompt to the AI', async () => {
    let capturedSystemPrompt = '';
    const spyAI = {
      async complete(systemPrompt: string, _query: string): Promise<string> {
        capturedSystemPrompt = systemPrompt;
        return 'Clean response.';
      },
    };
    await think({
      worldmodelContent,
      lensId: 'auki-builder',
      query: 'Should we merge PR #247?',
      ai: spyAI,
    });
    expect(capturedSystemPrompt).toContain('auki-builder');
    expect(capturedSystemPrompt).toContain('Make the world machine-readable');
  });

  it('passes the user query to the AI', async () => {
    let capturedQuery = '';
    const spyAI = {
      async complete(_systemPrompt: string, query: string): Promise<string> {
        capturedQuery = query;
        return 'Clean response.';
      },
    };
    await think({
      worldmodelContent,
      lensId: 'auki-builder',
      query: 'Should we merge PR #247?',
      ai: spyAI,
    });
    expect(capturedQuery).toBe('Should we merge PR #247?');
  });
});

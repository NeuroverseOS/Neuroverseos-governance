/**
 * Radiant — declared vocabulary tests
 *
 * Covers the fidelity loop: the AI must use canonical names the worldmodel
 * already declares, not invent new ones. The vocabulary extractor parses
 * worldmodel markdown into DeclaredPattern entries, and the matcher
 * decides whether an AI-emitted candidate is really a declared pattern
 * wearing a different name.
 */

import { describe, it, expect } from 'vitest';
import {
  extractDeclaredVocabulary,
  matchDeclaredPattern,
} from '../src/radiant/core/vocabulary';

// ─── Extraction ────────────────────────────────────────────────────────────

describe('extractDeclaredVocabulary', () => {
  it('pulls pure-prose bullets from both sections and auto-snake-cases them', () => {
    const worldmodel = `
# Example

## Aligned Behaviors
- ships partial-but-working features
- writes decisions down before acting

## Drift Behaviors
- dependency on AI presenting as integration
- shipping pace outruns strategic decision-making
`;
    const vocab = extractDeclaredVocabulary(worldmodel);

    expect(vocab.aligned).toHaveLength(2);
    expect(vocab.drift).toHaveLength(2);
    expect(vocab.aligned[0].name).toBe('ships_partial_but_working_features');
    expect(vocab.drift[0].name).toBe('dependency_on_ai_presenting_as_integration');
    expect(vocab.drift[0].kind).toBe('drift');
    expect(vocab.drift[0].prose).toBe(
      'dependency on AI presenting as integration',
    );
    expect(vocab.allNames).toEqual([
      ...vocab.aligned.map((p) => p.name),
      ...vocab.drift.map((p) => p.name),
    ]);
  });

  it('accepts explicit `canonical_name — prose` bullets', () => {
    const worldmodel = `
## Drift Behaviors
- \`ai_dependency\` — decision ownership diffusing to AI without explicit delegation
- fallback_form still gets parsed by prose
`;
    const vocab = extractDeclaredVocabulary(worldmodel);

    expect(vocab.drift).toHaveLength(2);
    expect(vocab.drift[0].name).toBe('ai_dependency');
    expect(vocab.drift[0].prose).toBe(
      'decision ownership diffusing to AI without explicit delegation',
    );
    expect(vocab.drift[1].name).toBe('fallback_form_still_gets_parsed_by_prose');
  });

  it('returns empty arrays when sections are missing', () => {
    const worldmodel = `
# No behaviors here

## Mission

Do the thing.

## Signals
- some_signal
`;
    const vocab = extractDeclaredVocabulary(worldmodel);
    expect(vocab.aligned).toEqual([]);
    expect(vocab.drift).toEqual([]);
    expect(vocab.allNames).toEqual([]);
  });

  it('skips HTML comment lines inside sections', () => {
    const worldmodel = `
## Drift Behaviors

<!-- add one per line -->
- real drift behavior
`;
    const vocab = extractDeclaredVocabulary(worldmodel);
    expect(vocab.drift).toHaveLength(1);
    expect(vocab.drift[0].name).toBe('real_drift_behavior');
  });

  it('caps auto-snake-cased names on a word boundary when bullets are long', () => {
    const worldmodel = `
## Drift Behaviors
- a very long drift behavior description that goes on and on and keeps going past sixty characters to stress the truncation logic
`;
    const vocab = extractDeclaredVocabulary(worldmodel);
    const name = vocab.drift[0].name;
    expect(name.length).toBeLessThanOrEqual(60);
    // Name must be well-formed snake_case with no trailing underscore.
    expect(name).toMatch(/^[a-z][a-z0-9_]*[a-z0-9]$/);
  });
});

// ─── Matching ──────────────────────────────────────────────────────────────

describe('matchDeclaredPattern', () => {
  const worldmodel = `
## Aligned Behaviors
- ships partial-but-working features rather than waiting for the full stack

## Drift Behaviors
- dependency on AI presenting as integration
- shipping pace outruns strategic decision-making
`;
  const vocab = extractDeclaredVocabulary(worldmodel);

  it('matches a candidate whose description overlaps a declared drift prose', () => {
    const match = matchDeclaredPattern(
      'velocity_without_declared_target',
      'The team is shipping pace that outruns strategic decisions — architecture ahead of direction.',
      vocab,
    );
    expect(match).not.toBeNull();
    expect(match?.name).toBe('shipping_pace_outruns_strategic_decision_making');
  });

  it('matches when candidate name tokens overlap even if description is abstract', () => {
    const match = matchDeclaredPattern(
      'ai_dependency_pattern',
      'The system increasingly relies on AI output being presented as a real integration.',
      vocab,
    );
    expect(match).not.toBeNull();
    expect(match?.name).toBe('dependency_on_ai_presenting_as_integration');
  });

  it('returns null when there is no meaningful overlap', () => {
    const match = matchDeclaredPattern(
      'unrelated_pattern',
      'The backup restore timing was faster than expected.',
      vocab,
    );
    expect(match).toBeNull();
  });

  it('returns null when vocabulary is empty', () => {
    const empty = extractDeclaredVocabulary('# Nothing declared\n');
    const match = matchDeclaredPattern(
      'something',
      'arbitrary description of something',
      empty,
    );
    expect(match).toBeNull();
  });

  it('picks the highest-coverage declared pattern when several are close', () => {
    const m = `
## Drift Behaviors
- shipping pace outruns strategic decision-making
- shipping defects go unnoticed for weeks at a time
`;
    const v = extractDeclaredVocabulary(m);
    const match = matchDeclaredPattern(
      'some_label',
      'shipping pace is outrunning our strategic decisions again this week',
      v,
    );
    expect(match?.name).toBe('shipping_pace_outruns_strategic_decision_making');
  });
});

// ─── End-to-end: fidelity reclassification ────────────────────────────────

describe('fidelity reclassification (end-to-end)', () => {
  it('rewrites an AI-invented candidate name to the declared canonical name', async () => {
    const { interpretPatterns } = await import('../src/radiant/core/patterns');
    const { aukiBuilderLens } = await import('../src/radiant/lenses/index');
    const { createMockAI } = await import('../src/radiant/core/ai');

    const worldmodel = `
## Drift Behaviors
- dependency on AI presenting as integration
- shipping pace outruns strategic decision-making
`;
    const vocabulary = extractDeclaredVocabulary(worldmodel);

    // Mock AI returns a candidate with an invented name but a description
    // that semantically matches one of the declared drift behaviors.
    const mockResponse = JSON.stringify({
      patterns: [
        {
          name: 'velocity_without_declared_target',
          type: 'candidate',
          description:
            'Shipping pace is outrunning strategic decision-making; architecture ships faster than direction is set.',
          evidence: { signals: [], events: [], cited_invariant: null },
          confidence: 0.7,
        },
      ],
      meaning: 'The team is shipping faster than it decides.',
      move: 'Declare direction before the next sprint.',
    });

    const ai = createMockAI(mockResponse);

    const result = await interpretPatterns({
      signals: [],
      events: [],
      worldmodelContent: worldmodel,
      lens: aukiBuilderLens,
      ai,
      declaredVocabulary: vocabulary,
    });

    expect(result.patterns).toHaveLength(1);
    expect(result.patterns[0].type).toBe('canonical');
    expect(result.patterns[0].name).toBe(
      'shipping_pace_outruns_strategic_decision_making',
    );
    expect(result.patterns[0].declaredAs).toBe(
      'shipping_pace_outruns_strategic_decision_making',
    );
  });

  it('leaves genuinely-new candidates alone when nothing declared matches', async () => {
    const { interpretPatterns } = await import('../src/radiant/core/patterns');
    const { aukiBuilderLens } = await import('../src/radiant/lenses/index');
    const { createMockAI } = await import('../src/radiant/core/ai');

    const worldmodel = `
## Drift Behaviors
- centralized cloud choices where DePIN would serve the same function
`;
    const vocabulary = extractDeclaredVocabulary(worldmodel);

    const mockResponse = JSON.stringify({
      patterns: [
        {
          name: 'novel_emergent_concern',
          type: 'candidate',
          description:
            'A recurring ticket type is appearing that nobody has language for yet.',
          evidence: { signals: [], events: [], cited_invariant: null },
          confidence: 0.6,
        },
      ],
      meaning: 'Something new is appearing.',
      move: 'Name it.',
    });

    const ai = createMockAI(mockResponse);

    const result = await interpretPatterns({
      signals: [],
      events: [],
      worldmodelContent: worldmodel,
      lens: aukiBuilderLens,
      ai,
      declaredVocabulary: vocabulary,
    });

    expect(result.patterns[0].type).toBe('candidate');
    expect(result.patterns[0].name).toBe('novel_emergent_concern');
  });
});

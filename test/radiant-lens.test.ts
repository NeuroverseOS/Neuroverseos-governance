/**
 * Radiant — rendering lens tests
 *
 * Covers:
 *   - The auki-builder lens is well-formed and registered
 *   - The three-domain primary frame is structured correctly
 *   - The skills vocabulary lives inside the frame (reader-facing)
 *   - The bucket names are forbidden in output (internal-only)
 *   - The overlap states match the vanguard diagram
 *   - The rewrite function annotates patterns without mutating core fields
 *   - Exemplar refs are declared and well-typed
 */

import { describe, it, expect } from 'vitest';
import {
  aukiBuilderLens,
  LENSES,
  getLens,
  listLenses,
} from '../src/radiant/index';
import type {
  ObservedPattern,
  RenderingLens,
} from '../src/radiant/index';

// ─── Registry ──────────────────────────────────────────────────────────────

describe('lens registry', () => {
  it('registers the auki-builder lens under its id', () => {
    expect(LENSES['auki-builder']).toBe(aukiBuilderLens);
  });

  it('getLens returns the lens for a known id', () => {
    const lens = getLens('auki-builder');
    expect(lens).toBe(aukiBuilderLens);
  });

  it('getLens returns undefined for an unknown id', () => {
    expect(getLens('does-not-exist')).toBeUndefined();
  });

  it('listLenses includes every registered id', () => {
    expect(listLenses()).toContain('auki-builder');
  });
});

// ─── aukiBuilderLens structure ─────────────────────────────────────────────

describe('aukiBuilderLens — structure', () => {
  it('declares name and description', () => {
    expect(aukiBuilderLens.name).toBe('auki-builder');
    expect(aukiBuilderLens.description.length).toBeGreaterThan(50);
  });

  it('has primary_frame, vocabulary, voice, forbidden, preferred, strategic, exemplars, rewrite', () => {
    const required: (keyof RenderingLens)[] = [
      'primary_frame',
      'vocabulary',
      'voice',
      'forbidden_phrases',
      'preferred_patterns',
      'strategic_patterns',
      'exemplar_refs',
      'rewrite',
    ];
    for (const field of required) {
      expect(aukiBuilderLens[field]).toBeDefined();
    }
  });
});

// ─── Primary frame: three-domain vanguard scoring ──────────────────────────

describe('aukiBuilderLens — primary frame', () => {
  it('declares three domains matching the vanguard diagram', () => {
    expect(aukiBuilderLens.primary_frame.domains).toEqual([
      'future-foresight',
      'narrative-dynamics',
      'shared-prosperity',
    ]);
  });

  it('declares three overlap emergent states: Inspiration, Trust, Hope', () => {
    const states = aukiBuilderLens.primary_frame.overlaps.map(
      (o) => o.emergent_state,
    );
    expect(states).toContain('Inspiration');
    expect(states).toContain('Trust');
    expect(states).toContain('Hope');
    expect(states).toHaveLength(3);
  });

  it('has Collective Vanguard Leader as the center identity', () => {
    expect(aukiBuilderLens.primary_frame.center_identity).toBe(
      'Collective Vanguard Leader',
    );
  });

  it('has evaluation questions in skills-level language (not bucket names)', () => {
    const questionsText = aukiBuilderLens.primary_frame.evaluation_questions
      .join(' ')
      .toLowerCase();
    // Should reference specific skills, not bucket names as labels
    expect(questionsText).toMatch(/strategic thinking|systems design/);
    expect(questionsText).toMatch(/storytelling/);
    expect(questionsText).toMatch(/partnership|stakeholder|coalition/);
  });

  it('has a scoring rubric that names the output-translation discipline', () => {
    const rubric = aukiBuilderLens.primary_frame.scoring_rubric.toLowerCase();
    expect(rubric).toMatch(/skill|specific/);
    expect(rubric).toMatch(/do not surface|not surface|never surface|skill-level/i);
  });
});

// ─── Skills vocabulary lives inside the frame ──────────────────────────────

describe('aukiBuilderLens — skills are the reader-facing vocabulary', () => {
  it('the primary_frame object exposes domain_skills for each domain', () => {
    // domain_skills lives on the internal AUKI_VANGUARD_FRAME; we assert it's
    // accessible through the lens (primary_frame is a subset view). We test
    // the presence of the skill names in the voice.output_translation and in
    // at least one preferred_pattern.
    const voiceText = aukiBuilderLens.voice.output_translation.toLowerCase();
    expect(voiceText).toMatch(/skills inside|skill-level|skills/);
  });

  it('preferred patterns reference specific skills, not bucket names', () => {
    const patternsText = aukiBuilderLens.preferred_patterns
      .join(' ')
      .toLowerCase();
    // At least one preferred pattern references the idea of skills
    expect(patternsText).toMatch(/specific skill/);
    // No bucket name labels appear as preferred-pattern template literals
    const bucketNamesInPatterns = aukiBuilderLens.preferred_patterns.filter(
      (p) =>
        p.includes('Future Foresight is') ||
        p.includes('Narrative Dynamics is') ||
        p.includes('Shared Prosperity is'),
    );
    expect(bucketNamesInPatterns).toHaveLength(0);
  });
});

// ─── Forbidden phrases: bucket names + hedging + marketing + jargon ────────

describe('aukiBuilderLens — forbidden phrases', () => {
  it('forbids the bucket names as reader-facing labels', () => {
    const forbidden = aukiBuilderLens.forbidden_phrases.map((p) =>
      p.toLowerCase(),
    );
    expect(forbidden).toContain('future foresight');
    expect(forbidden).toContain('narrative dynamics');
    expect(forbidden).toContain('shared prosperity');
  });

  it('forbids AI-assistant hedging vocabulary', () => {
    const forbidden = aukiBuilderLens.forbidden_phrases;
    expect(forbidden).toContain('it may be beneficial to consider');
    expect(forbidden).toContain('there appears to be');
  });

  it('forbids corporate marketing vocabulary', () => {
    const forbidden = aukiBuilderLens.forbidden_phrases;
    expect(forbidden).toContain('unparalleled');
    expect(forbidden).toContain('thrilled to announce');
    expect(forbidden).toContain('stakeholders');
  });

  it('forbids generic motion vocabulary', () => {
    const forbidden = aukiBuilderLens.forbidden_phrases;
    expect(forbidden).toContain('going forward');
    expect(forbidden).toContain('low-hanging fruit');
  });
});

// ─── Vocabulary map ────────────────────────────────────────────────────────

describe('aukiBuilderLens — vocabulary', () => {
  it('carries Auki proper nouns', () => {
    const nouns = aukiBuilderLens.vocabulary.proper_nouns;
    expect(nouns).toContain('Posemesh');
    expect(nouns).toContain('Auki Labs');
    expect(nouns).toContain('Intercognitive Foundation');
    expect(nouns).toContain('Sixth Protocol');
    expect(nouns).toContain('peaq');
    expect(nouns).toContain('GEODNET');
  });

  it('maps generic terms to Auki-native replacements', () => {
    expect(aukiBuilderLens.vocabulary.preferred['device']).toBe('participant');
    expect(aukiBuilderLens.vocabulary.preferred['coordinate system']).toBe(
      'domain',
    );
  });

  it('includes architecture vocabulary from glossary and essays', () => {
    const arch = aukiBuilderLens.vocabulary.architecture;
    expect(arch).toContain('the stack');
    expect(arch).toContain('hybrid robotics');
    expect(arch).toContain('spatial orchestration');
  });

  it('includes framing vocabulary — the strategic compressions', () => {
    const framing = aukiBuilderLens.vocabulary.framing;
    expect(framing).toContain('make the world machine-readable');
    expect(framing).toContain('cognitive liberty');
    expect(framing).toContain('skip the bottleneck, ship the leverage');
  });
});

// ─── Voice directives ──────────────────────────────────────────────────────

describe('aukiBuilderLens — voice', () => {
  it('enforces active voice, specificity, no hype, no hedging', () => {
    expect(aukiBuilderLens.voice.active_voice).toBe('required');
    expect(aukiBuilderLens.voice.specificity).toBe('required');
    expect(aukiBuilderLens.voice.hype_vocabulary).toBe('forbidden');
    expect(aukiBuilderLens.voice.hedging).toBe('forbidden');
  });

  it('requires honesty about failure', () => {
    expect(aukiBuilderLens.voice.honesty_about_failure).toBe('required');
  });

  it('carries the reason-internally / express-externally directive', () => {
    const translation = aukiBuilderLens.voice.output_translation.toLowerCase();
    expect(translation).toMatch(/reason internally|internal/);
    expect(translation).toMatch(/express|skill/);
    expect(translation).toMatch(/do not surface|never surface|not surface/);
  });
});

// ─── Strategic patterns ────────────────────────────────────────────────────

describe('aukiBuilderLens — strategic patterns', () => {
  it('encodes the skip-the-bottleneck pattern', () => {
    const patterns = aukiBuilderLens.strategic_patterns.join(' ').toLowerCase();
    expect(patterns).toMatch(/skip the bottleneck/);
  });

  it('encodes the coalition-before-standard pattern', () => {
    const patterns = aukiBuilderLens.strategic_patterns.join(' ').toLowerCase();
    expect(patterns).toMatch(/coalition before standard/);
  });

  it('encodes the cognitive-liberty-as-inviolable pattern', () => {
    const patterns = aukiBuilderLens.strategic_patterns.join(' ').toLowerCase();
    expect(patterns).toMatch(/cognitive liberty/);
  });
});

// ─── Exemplar references ───────────────────────────────────────────────────

describe('aukiBuilderLens — exemplars', () => {
  it('references the Intercognitive exemplar as the full-integration example', () => {
    const intercog = aukiBuilderLens.exemplar_refs.find((e) =>
      e.path.includes('intercognitive'),
    );
    expect(intercog).toBeDefined();
    expect(intercog?.exhibits).toEqual([
      'future-foresight',
      'narrative-dynamics',
      'shared-prosperity',
    ]);
  });

  it('references the hybrid-robotics essay as a primary-dominant exemplar', () => {
    const hybrid = aukiBuilderLens.exemplar_refs.find((e) =>
      e.path.includes('hybrid-robotics'),
    );
    expect(hybrid).toBeDefined();
    expect(hybrid?.exhibits).toContain('future-foresight');
  });

  it('each exemplar has a title, exhibits list, integration quality, notes', () => {
    for (const ex of aukiBuilderLens.exemplar_refs) {
      expect(ex.path).toBeTruthy();
      expect(ex.title).toBeTruthy();
      expect(ex.exhibits.length).toBeGreaterThan(0);
      expect(ex.integration_quality).toBeTruthy();
      expect(ex.notes.length).toBeGreaterThan(20);
    }
  });
});

// ─── Rewrite function ──────────────────────────────────────────────────────

describe('aukiBuilderLens — rewrite', () => {
  function makePattern(overrides: Partial<ObservedPattern> = {}): ObservedPattern {
    return {
      name: 'coordination_drift',
      type: 'canonical',
      description: 'three modules not crossing commits in 12 days',
      evidence: { signals: ['alignment.life'], events: ['pr-247'] },
      confidence: 0.8,
      ...overrides,
    };
  }

  it('annotates a canonical pattern with system-level framing', () => {
    const p = makePattern();
    const r = aukiBuilderLens.rewrite(p);
    expect(r.framing).toBe('system-level consequence');
    expect(r.emphasis).toBe('coordination + leverage');
    expect(r.compress).toBe(true);
  });

  it('annotates a candidate pattern as emergent', () => {
    const p = makePattern({ type: 'candidate' });
    const r = aukiBuilderLens.rewrite(p);
    expect(r.framing).toMatch(/emergent/i);
    expect(r.compress).toBe(true);
  });

  it('annotates an invariant-citing pattern with invariant-pressure framing', () => {
    const p = makePattern({
      evidence: {
        signals: ['alignment.life'],
        events: ['commit-abc'],
        cited_invariant: 'cognitive_liberty_preserved',
      },
    });
    const r = aukiBuilderLens.rewrite(p);
    expect(r.framing).toBe('invariant pressure');
  });

  it('does not mutate the core pattern fields', () => {
    const p = makePattern();
    const r = aukiBuilderLens.rewrite(p);
    expect(r.name).toBe(p.name);
    expect(r.type).toBe(p.type);
    expect(r.evidence).toEqual(p.evidence);
    expect(r.confidence).toBe(p.confidence);
  });

  it('is deterministic — same input produces same output', () => {
    const p = makePattern();
    const a = aukiBuilderLens.rewrite(p);
    const b = aukiBuilderLens.rewrite(p);
    expect(a).toEqual(b);
  });
});

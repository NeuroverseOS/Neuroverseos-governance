/**
 * WorldModel Parser — .worldmodel.md → ParsedWorldModel
 *
 * Deterministic markdown parser for the three-layer behavioral model format.
 * No LLM calls. No heuristics. Pattern matching on structured markdown.
 *
 * Three Layers:
 *   # Core Model Geometry   → mission, domains (skills+values), overlaps, center identity
 *   # Contextual Modifiers  → authority, spatial contexts, interpretation rules
 *   # Evolution Layer        → aligned/drift behaviors, signals, priorities, evolution
 */

import type {
  ParsedWorldModel,
  WorldModelFrontmatter,
  CoreModelGeometry,
  ParsedDomain,
  ParsedOverlap,
  ContextualModifiers,
  EvolutionLayer,
  ParsedPriority,
  WorldModelIssue,
  WorldModelParseResult,
} from '../contracts/worldmodel-contract';

// ─── Section Splitter ───────────────────────────────────────────────────────

interface Section {
  name: string;
  content: string;
  startLine: number;
}

/**
 * Split markdown into frontmatter and H1 sections.
 */
function splitSections(markdown: string): { frontmatter: string; sections: Section[] } {
  const lines = markdown.split('\n');
  let frontmatter = '';
  let bodyStart = 0;

  // Extract YAML frontmatter
  if (lines[0]?.trim() === '---') {
    const endIdx = lines.indexOf('---', 1);
    if (endIdx > 0) {
      frontmatter = lines.slice(1, endIdx).join('\n');
      bodyStart = endIdx + 1;
    }
  }

  // Split on H1 headings
  const sections: Section[] = [];
  let currentSection: Section | null = null;
  const contentLines: string[] = [];

  for (let i = bodyStart; i < lines.length; i++) {
    const line = lines[i];
    if (line.startsWith('# ')) {
      if (currentSection) {
        currentSection.content = contentLines.join('\n').trim();
        sections.push(currentSection);
        contentLines.length = 0;
      }
      currentSection = {
        name: line.replace(/^#\s+/, '').trim(),
        content: '',
        startLine: i + 1, // 1-based
      };
    } else if (currentSection) {
      contentLines.push(line);
    }
  }

  if (currentSection) {
    currentSection.content = contentLines.join('\n').trim();
    sections.push(currentSection);
  }

  return { frontmatter, sections };
}

/**
 * Split section content on H2 headings (## ...).
 */
function splitH2Sections(content: string, baseLine: number): Section[] {
  const lines = content.split('\n');
  const sections: Section[] = [];
  let currentSection: Section | null = null;
  const contentLines: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.startsWith('## ')) {
      if (currentSection) {
        currentSection.content = contentLines.join('\n').trim();
        sections.push(currentSection);
        contentLines.length = 0;
      }
      currentSection = {
        name: line.replace(/^##\s+/, '').trim(),
        content: '',
        startLine: baseLine + i,
      };
    } else if (currentSection) {
      contentLines.push(line);
    }
  }

  if (currentSection) {
    currentSection.content = contentLines.join('\n').trim();
    sections.push(currentSection);
  }

  return sections;
}

/**
 * Split content on H3 headings (### ...).
 */
function splitH3Sections(content: string, baseLine: number): Section[] {
  const lines = content.split('\n');
  const sections: Section[] = [];
  let currentSection: Section | null = null;
  const contentLines: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.startsWith('### ')) {
      if (currentSection) {
        currentSection.content = contentLines.join('\n').trim();
        sections.push(currentSection);
        contentLines.length = 0;
      }
      currentSection = {
        name: line.replace(/^###\s+/, '').trim(),
        content: '',
        startLine: baseLine + i,
      };
    } else if (currentSection) {
      contentLines.push(line);
    }
  }

  if (currentSection) {
    currentSection.content = contentLines.join('\n').trim();
    sections.push(currentSection);
  }

  return sections;
}

/**
 * Split content on H4 headings (#### ...).
 */
function splitH4Sections(content: string, baseLine: number): Section[] {
  const lines = content.split('\n');
  const sections: Section[] = [];
  let currentSection: Section | null = null;
  const contentLines: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.startsWith('#### ')) {
      if (currentSection) {
        currentSection.content = contentLines.join('\n').trim();
        sections.push(currentSection);
        contentLines.length = 0;
      }
      currentSection = {
        name: line.replace(/^####\s+/, '').trim(),
        content: '',
        startLine: baseLine + i,
      };
    } else if (currentSection) {
      contentLines.push(line);
    }
  }

  if (currentSection) {
    currentSection.content = contentLines.join('\n').trim();
    sections.push(currentSection);
  }

  return sections;
}

/**
 * Extract bullet list items from content.
 * Returns trimmed text after the `- ` prefix.
 * Skips lines inside HTML comments.
 */
function parseBulletList(content: string): string[] {
  const items: string[] = [];
  let inComment = false;

  for (const line of content.split('\n')) {
    const trimmed = line.trim();

    if (trimmed.startsWith('<!--')) {
      inComment = true;
    }
    if (inComment) {
      if (trimmed.includes('-->')) {
        inComment = false;
      }
      continue;
    }

    if (trimmed.startsWith('- ')) {
      items.push(trimmed.slice(2).trim());
    }
  }
  return items;
}

/**
 * Extract text content from a section, ignoring comments and blank lines.
 * Returns the first non-empty, non-comment paragraph.
 */
function extractTextContent(content: string): string {
  const lines = content.split('\n');
  const textLines: string[] = [];
  let inComment = false;

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith('<!--')) {
      inComment = true;
    }
    if (inComment) {
      if (trimmed.includes('-->')) {
        inComment = false;
      }
      continue;
    }
    if (trimmed && !trimmed.startsWith('#')) {
      textLines.push(trimmed);
    }
  }

  return textLines.join('\n').trim();
}

/**
 * Convert a name to a kebab-case identifier.
 */
function toKebabCase(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

// ─── Frontmatter Parser ────────────────────────────────────────────────────

function parseFrontmatter(yaml: string, issues: WorldModelIssue[]): WorldModelFrontmatter {
  const result: Record<string, string> = {};

  for (const line of yaml.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const colonIdx = trimmed.indexOf(':');
    if (colonIdx === -1) continue;

    const key = trimmed.slice(0, colonIdx).trim();
    const value = trimmed.slice(colonIdx + 1).trim();
    result[key] = value;
  }

  const name = result.name || '';
  if (!name) {
    issues.push({
      line: 1,
      section: 'frontmatter',
      message: 'Missing name in frontmatter. Provide a human-readable model name.',
      severity: 'error',
    });
  }

  const model_id = result.model_id || toKebabCase(name);

  return {
    model_id,
    name,
    version: result.version || '1.0.0',
  };
}

// ─── Layer 1: Core Model Geometry ───────────────────────────────────────────

function parseGeometry(
  section: Section | undefined,
  issues: WorldModelIssue[],
): CoreModelGeometry {
  const geometry: CoreModelGeometry = {
    mission: '',
    domains: [],
    overlapEffects: [],
    centerIdentity: '',
  };

  if (!section) {
    issues.push({
      line: 0,
      section: 'Core Model Geometry',
      message:
        'Missing # Core Model Geometry section. Define the structural model: mission, domains with embedded skills and values, overlaps, and center identity.',
      severity: 'error',
    });
    return geometry;
  }

  const h2Sections = splitH2Sections(section.content, section.startLine);

  // Parse Mission
  const missionSection = h2Sections.find(s => s.name.toLowerCase() === 'mission');
  if (missionSection) {
    geometry.mission = extractTextContent(missionSection.content);
  }
  if (!geometry.mission) {
    issues.push({
      line: missionSection?.startLine ?? section.startLine,
      section: 'Mission',
      message:
        'Missing ## Mission. Define what this system is trying to achieve — the core aim, not a slogan.',
      severity: 'error',
    });
  }

  // Parse Domains
  const domainsSection = h2Sections.find(s => s.name.toLowerCase() === 'domains');
  if (domainsSection) {
    const domainSections = splitH3Sections(domainsSection.content, domainsSection.startLine);

    for (const ds of domainSections) {
      const domain: ParsedDomain = {
        id: toKebabCase(ds.name),
        name: ds.name,
        skills: [],
        values: [],
        line: ds.startLine,
      };

      const h4Sections = splitH4Sections(ds.content, ds.startLine);

      const skillsH4 = h4Sections.find(s => s.name.toLowerCase() === 'skills');
      if (skillsH4) {
        domain.skills = parseBulletList(skillsH4.content);
      }

      const valuesH4 = h4Sections.find(s => s.name.toLowerCase() === 'values');
      if (valuesH4) {
        domain.values = parseBulletList(valuesH4.content);
      }

      if (domain.skills.length === 0) {
        issues.push({
          line: ds.startLine,
          section: 'Domains',
          message: `Domain '${ds.name}' has no skills defined. Skills are the capabilities within this domain.`,
          severity: 'warning',
        });
      }

      if (domain.values.length === 0) {
        issues.push({
          line: ds.startLine,
          section: 'Domains',
          message: `Domain '${ds.name}' has no values defined. Behavior has no constraints without values.`,
          severity: 'warning',
        });
      }

      geometry.domains.push(domain);
    }
  }

  if (geometry.domains.length < 2) {
    issues.push({
      line: domainsSection?.startLine ?? section.startLine,
      section: 'Domains',
      message:
        'At least 2 domains required. Domains are the major operating modes of the system, each carrying skills and values.',
      severity: 'error',
    });
  }

  // Parse Overlap Effects
  const overlapsSection = h2Sections.find(
    s => s.name.toLowerCase() === 'overlap effects',
  );
  if (overlapsSection) {
    const bullets = parseBulletList(overlapsSection.content);
    const domainNames = new Set(geometry.domains.map(d => d.name.toLowerCase()));

    for (let i = 0; i < bullets.length; i++) {
      const bullet = bullets[i];
      // Match: DomainA + DomainB = Effect
      const match = bullet.match(/^(.+?)\s*\+\s*(.+?)\s*=\s*(.+)$/);
      if (match) {
        const domainA = match[1].trim();
        const domainB = match[2].trim();
        const effect = match[3].trim();

        // Validate pillar references
        if (!domainNames.has(domainA.toLowerCase())) {
          issues.push({
            line: overlapsSection.startLine + i,
            section: 'Overlap Effects',
            message: `Overlap references unknown domain '${domainA}'. Must reference a declared domain.`,
            severity: 'warning',
          });
        }
        if (!domainNames.has(domainB.toLowerCase())) {
          issues.push({
            line: overlapsSection.startLine + i,
            section: 'Overlap Effects',
            message: `Overlap references unknown domain '${domainB}'. Must reference a declared domain.`,
            severity: 'warning',
          });
        }

        geometry.overlapEffects.push({
          domainA,
          domainB,
          effect,
          line: overlapsSection.startLine + i,
        });
      } else {
        issues.push({
          line: overlapsSection.startLine + i,
          section: 'Overlap Effects',
          message: `Cannot parse overlap: '${bullet}'. Expected format: 'Domain A + Domain B = Emergent State'.`,
          severity: 'warning',
        });
      }
    }
  }

  if (geometry.overlapEffects.length === 0) {
    issues.push({
      line: overlapsSection?.startLine ?? section.startLine,
      section: 'Overlap Effects',
      message:
        'No overlap effects defined. Define what emerges when two domains interact well (e.g., "Domain A + Domain B = Inspiration").',
      severity: 'warning',
    });
  }

  // Parse Center Identity
  const identitySection = h2Sections.find(
    s => s.name.toLowerCase() === 'center identity',
  );
  if (identitySection) {
    geometry.centerIdentity = extractTextContent(identitySection.content);
  }

  if (!geometry.centerIdentity) {
    issues.push({
      line: identitySection?.startLine ?? section.startLine,
      section: 'Center Identity',
      message:
        'No center identity defined. Define what the system becomes when all domains are aligned — the core identity.',
      severity: 'warning',
    });
  }

  return geometry;
}

// ─── Layer 2: Contextual Modifiers ──────────────────────────────────────────

function parseModifiers(
  section: Section | undefined,
  issues: WorldModelIssue[],
): ContextualModifiers {
  const modifiers: ContextualModifiers = {
    authorityLayers: [],
    spatialContexts: [],
    interpretationRules: [],
  };

  if (!section) {
    issues.push({
      line: 0,
      section: 'Contextual Modifiers',
      message:
        'Missing # Contextual Modifiers section. Define how authority, role, and spatial context change how behavior is interpreted.',
      severity: 'warning',
    });
    return modifiers;
  }

  const h2Sections = splitH2Sections(section.content, section.startLine);

  // Authority Layers
  const authoritySection = h2Sections.find(
    s => s.name.toLowerCase() === 'authority layers',
  );
  if (authoritySection) {
    modifiers.authorityLayers = parseBulletList(authoritySection.content);
  }

  // Spatial Contexts
  const spatialSection = h2Sections.find(
    s => s.name.toLowerCase() === 'spatial contexts',
  );
  if (spatialSection) {
    modifiers.spatialContexts = parseBulletList(spatialSection.content);
  }

  // Interpretation Rules
  const rulesSection = h2Sections.find(
    s => s.name.toLowerCase() === 'interpretation rules',
  );
  if (rulesSection) {
    modifiers.interpretationRules = parseBulletList(rulesSection.content);
  }

  return modifiers;
}

// ─── Layer 3: Evolution Layer ───────────────────────────────────────────────

function parseEvolution(
  section: Section | undefined,
  issues: WorldModelIssue[],
): EvolutionLayer {
  const evolution: EvolutionLayer = {
    alignedBehaviors: [],
    driftBehaviors: [],
    signals: [],
    decisionPriorities: [],
    evolutionConditions: [],
  };

  if (!section) {
    issues.push({
      line: 0,
      section: 'Evolution Layer',
      message:
        'Missing # Evolution Layer section. Define observable behaviors, signals, decision priorities, and adaptation conditions.',
      severity: 'error',
    });
    return evolution;
  }

  const h2Sections = splitH2Sections(section.content, section.startLine);

  // Aligned Behaviors
  const alignedSection = h2Sections.find(
    s => s.name.toLowerCase() === 'aligned behaviors',
  );
  if (alignedSection) {
    evolution.alignedBehaviors = parseBulletList(alignedSection.content);
  }
  if (evolution.alignedBehaviors.length === 0) {
    issues.push({
      line: alignedSection?.startLine ?? section.startLine,
      section: 'Aligned Behaviors',
      message:
        'No aligned behaviors defined. Define what success looks like in action.',
      severity: 'warning',
    });
  }

  // Drift Behaviors
  const driftSection = h2Sections.find(
    s => s.name.toLowerCase() === 'drift behaviors',
  );
  if (driftSection) {
    evolution.driftBehaviors = parseBulletList(driftSection.content);
  }
  if (evolution.driftBehaviors.length === 0) {
    issues.push({
      line: driftSection?.startLine ?? section.startLine,
      section: 'Drift Behaviors',
      message:
        'No drift behaviors defined. Define what misalignment looks like so the system can detect behavioral drift over time.',
      severity: 'warning',
    });
  }

  // Signals
  const signalsSection = h2Sections.find(
    s => s.name.toLowerCase() === 'signals',
  );
  if (signalsSection) {
    evolution.signals = parseBulletList(signalsSection.content);
  }
  if (evolution.signals.length < 2) {
    issues.push({
      line: signalsSection?.startLine ?? section.startLine,
      section: 'Signals',
      message:
        'At least 2 signals required. Signals are the observable metrics for detecting alignment or drift.',
      severity: 'error',
    });
  }

  // Decision Priorities
  const prioritiesSection = h2Sections.find(
    s => s.name.toLowerCase() === 'decision priorities',
  );
  if (prioritiesSection) {
    const bullets = parseBulletList(prioritiesSection.content);
    for (let i = 0; i < bullets.length; i++) {
      const bullet = bullets[i];
      // Match: preferred > over
      const match = bullet.match(/^(.+?)\s*>\s*(.+)$/);
      if (match) {
        evolution.decisionPriorities.push({
          preferred: match[1].trim(),
          over: match[2].trim(),
          line: prioritiesSection.startLine + i,
        });
      } else {
        issues.push({
          line: prioritiesSection.startLine + i,
          section: 'Decision Priorities',
          message: `Cannot parse priority: '${bullet}'. Expected format: 'preferred > over'.`,
          severity: 'warning',
        });
      }
    }
  }
  if (evolution.decisionPriorities.length === 0) {
    issues.push({
      line: prioritiesSection?.startLine ?? section.startLine,
      section: 'Decision Priorities',
      message:
        'No decision priorities defined. Define what wins when tradeoffs appear.',
      severity: 'warning',
    });
  }

  // Evolution Conditions
  const evoSection = h2Sections.find(
    s => s.name.toLowerCase() === 'evolution conditions',
  );
  if (evoSection) {
    evolution.evolutionConditions = parseBulletList(evoSection.content);
  }

  // Cross-check: signals defined but no drift = system cannot detect failure
  if (evolution.signals.length > 0 && evolution.driftBehaviors.length === 0) {
    issues.push({
      line: signalsSection?.startLine ?? section.startLine,
      section: 'Evolution Layer',
      message:
        'Signals defined but no drift behaviors. System cannot detect failure without drift definitions.',
      severity: 'warning',
    });
  }

  return evolution;
}

// ─── Main Parser ────────────────────────────────────────────────────────────

/**
 * Parse a .worldmodel.md file into the three-layer ParsedWorldModel.
 *
 * Deterministic. No LLM calls. No heuristics.
 */
export function parseWorldModel(markdown: string): WorldModelParseResult {
  const issues: WorldModelIssue[] = [];

  if (!markdown || !markdown.trim()) {
    issues.push({
      line: 0,
      section: 'file',
      message: 'Empty input. Provide a .worldmodel.md file with three layers: Core Model Geometry, Contextual Modifiers, Evolution Layer.',
      severity: 'error',
    });
    return { model: null, issues };
  }

  const { frontmatter: fmRaw, sections } = splitSections(markdown);

  // Parse frontmatter
  const frontmatter = parseFrontmatter(fmRaw, issues);

  // Find the three layer sections
  const geometrySection = sections.find(
    s => s.name.toLowerCase() === 'core model geometry',
  );
  const modifiersSection = sections.find(
    s => s.name.toLowerCase() === 'contextual modifiers',
  );
  const evolutionSection = sections.find(
    s => s.name.toLowerCase() === 'evolution layer',
  );

  // Parse each layer
  const geometry = parseGeometry(geometrySection, issues);
  const modifiers = parseModifiers(modifiersSection, issues);
  const evolution = parseEvolution(evolutionSection, issues);

  // Cross-layer validation: overlaps but no center identity
  if (geometry.overlapEffects.length > 0 && !geometry.centerIdentity) {
    issues.push({
      line: 0,
      section: 'Core Model Geometry',
      message:
        'Overlaps defined but no center identity. System lacks coherence without an aligned identity.',
      severity: 'warning',
    });
  }

  // Check for hard errors
  const hasErrors = issues.some(i => i.severity === 'error');

  if (hasErrors) {
    // Still return the partial model for explain/validate use
    return {
      model: {
        frontmatter,
        geometry,
        modifiers,
        evolution,
      },
      issues,
    };
  }

  return {
    model: {
      frontmatter,
      geometry,
      modifiers,
      evolution,
    },
    issues,
  };
}

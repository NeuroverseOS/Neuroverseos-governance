/**
 * @neuroverseos/governance/radiant — declared vocabulary extraction
 *
 * Pulls Aligned Behaviors and Drift Behaviors from a worldmodel markdown
 * file and turns them into canonical snake_case pattern names that the AI
 * must use when it sees matching evidence.
 *
 * Why this exists: Radiant's AI was inventing names like
 * `velocity_without_declared_target` when the worldmodel already declared
 * `dependency_on_ai_presenting_as_integration` for the same observation.
 * The prompt told the AI to "use canonical names if you see them" — but
 * no one was extracting canonical names from the worldmodel. This module
 * closes that loop: Radiant now governs its own output against the
 * vocabulary it claims to read.
 *
 * Supported bullet formats (under `## Aligned Behaviors` / `## Drift Behaviors`):
 *   - `` `canonical_name` — prose description ``  (explicit, preferred)
 *   - `canonical_name — prose description`         (explicit, no backticks)
 *   - `prose description only`                     (auto-snake-cased)
 *
 * Empty sections, missing sections, and HTML comments are silently ignored
 * — partial vocabulary is better than no vocabulary, and falling back to
 * candidate-only behavior is the correct failure mode.
 */

// ─── Types ─────────────────────────────────────────────────────────────────

export interface DeclaredPattern {
  /** snake_case canonical identifier (stable across reads). */
  name: string;
  /** Human-readable prose for keyword matching against AI output. */
  prose: string;
  /** Which section this came from. */
  kind: 'aligned' | 'drift';
}

export interface DeclaredVocabulary {
  aligned: DeclaredPattern[];
  drift: DeclaredPattern[];
  /** All canonical names (aligned + drift) for quick membership checks. */
  allNames: string[];
}

// ─── Extraction ────────────────────────────────────────────────────────────

export function extractDeclaredVocabulary(
  worldmodelContent: string,
): DeclaredVocabulary {
  const aligned = extractSection(worldmodelContent, 'Aligned Behaviors').map(
    (b) => parseBehavior(b, 'aligned'),
  );
  const drift = extractSection(worldmodelContent, 'Drift Behaviors').map((b) =>
    parseBehavior(b, 'drift'),
  );

  const allNames = [...aligned, ...drift].map((p) => p.name);
  return { aligned, drift, allNames };
}

/**
 * Find the bullet list under a section header. Matches `## <header>` then
 * captures body up to the next `## ` (or end of file). Returns the raw
 * bullet text (with leading marker stripped).
 */
function extractSection(content: string, header: string): string[] {
  const escaped = header.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(
    `##\\s+${escaped}\\s*\\n([\\s\\S]*?)(?=\\n##\\s|$)`,
    'i',
  );
  const match = content.match(pattern);
  if (!match) return [];

  const body = match[1];
  const bullets = body.match(/^[-*]\s+.+$/gm);
  if (!bullets) return [];

  return bullets
    .map((b) => b.replace(/^[-*]\s+/, '').trim())
    .filter((b) => b.length > 0 && !b.startsWith('<!--'));
}

/**
 * Parse a bullet line into a DeclaredPattern. Tries the explicit
 * `canonical_name — prose` form first (with or without backticks),
 * falls back to auto-snake-casing the whole bullet.
 */
function parseBehavior(
  bullet: string,
  kind: 'aligned' | 'drift',
): DeclaredPattern {
  // Match: `name` — prose   OR   name — prose   OR   name - prose
  // The separator is em dash (—) or hyphen with surrounding spaces.
  const explicit = bullet.match(
    /^`?([a-z][a-z0-9_]*)`?\s+[—\u2014-]\s+(.+)$/i,
  );
  if (explicit && isSnakeCase(explicit[1])) {
    return {
      name: explicit[1].toLowerCase(),
      prose: explicit[2].trim(),
      kind,
    };
  }

  return { name: snakeCaseName(bullet), prose: bullet, kind };
}

function isSnakeCase(s: string): boolean {
  return /^[a-z][a-z0-9_]*$/.test(s);
}

/**
 * Convert prose to a snake_case identifier, capped at ~60 chars on a
 * word boundary. Stopwords are kept — the identifier is for humans too,
 * and stripping them can make names ambiguous.
 */
function snakeCaseName(s: string): string {
  const base = s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');

  if (base.length <= 60) return base;

  const truncated = base.slice(0, 60);
  const lastUnderscore = truncated.lastIndexOf('_');
  return lastUnderscore > 20 ? truncated.slice(0, lastUnderscore) : truncated;
}

// ─── Matching ──────────────────────────────────────────────────────────────

/**
 * Given a pattern description + name the AI emitted, find a declared
 * pattern whose prose has enough keyword overlap to be "the same thing."
 *
 * Matching is deterministic keyword overlap over content words (lowercased,
 * >3 chars, punctuation stripped, common stopwords removed). A match
 * requires at least 2 shared words AND at least 30% coverage of the
 * declared prose's content words. When multiple declared patterns match,
 * the one with highest coverage wins.
 *
 * This is intentionally a simple deterministic pass, not an LLM call:
 *   - no extra token cost
 *   - testable and reproducible
 *   - easy to tune thresholds without retraining
 *
 * Returns null when nothing matches well enough. The pattern stays a
 * candidate.
 */
export function matchDeclaredPattern(
  candidateName: string,
  candidateDescription: string,
  vocabulary: DeclaredVocabulary,
): DeclaredPattern | null {
  const candidateText = `${candidateName.replace(/_/g, ' ')} ${candidateDescription}`;
  const candidateWords = contentWords(candidateText);
  if (candidateWords.size === 0) return null;

  let best: { pattern: DeclaredPattern; score: number } | null = null;

  for (const pattern of [...vocabulary.aligned, ...vocabulary.drift]) {
    const proseWords = contentWords(pattern.prose);
    if (proseWords.size === 0) continue;

    let shared = 0;
    for (const w of proseWords) {
      if (candidateWords.has(w)) shared++;
    }
    const coverage = shared / proseWords.size;

    if (shared >= 2 && coverage >= 0.3) {
      if (!best || coverage > best.score) {
        best = { pattern, score: coverage };
      }
    }
  }

  return best?.pattern ?? null;
}

const STOPWORDS = new Set([
  'about', 'after', 'against', 'among', 'around', 'because', 'been', 'before',
  'being', 'between', 'both', 'could', 'does', 'doing', 'during', 'each',
  'from', 'further', 'have', 'having', 'into', 'itself', 'most', 'nor',
  'only', 'other', 'over', 'same', 'should', 'some', 'such', 'than', 'that',
  'their', 'them', 'then', 'there', 'these', 'they', 'this', 'those',
  'through', 'under', 'until', 'very', 'were', 'what', 'when', 'where',
  'which', 'while', 'will', 'with', 'without', 'would', 'your', 'yours',
]);

function contentWords(text: string): Set<string> {
  const words = text.toLowerCase().match(/[a-z][a-z0-9_]+/g) ?? [];
  return new Set(words.filter((w) => w.length > 3 && !STOPWORDS.has(w)));
}

/**
 * @neuroverseos/governance/radiant — Notion adapter (planned)
 *
 * Reads documentation and knowledge-base activity from Notion.
 * For Auki, Notion is where team documentation lives.
 *
 * What it would capture:
 *   - Documentation freshness (when were pages last updated?)
 *   - Knowledge organization (are docs structured well?)
 *   - Documentation gaps (sprint mentions things that have no doc page)
 *   - Decision records (ADRs, meeting notes, strategy docs)
 *   - Who maintains what (authorship patterns)
 *
 * The behavioral signal from Notion is different from code (GitHub)
 * and conversation (Discord/Slack). Documentation is how the team
 * crystallizes and shares knowledge. Low doc activity alongside high
 * code activity = the team is building but not recording what they
 * learn. That's a Narrative Dynamics gap.
 *
 * Status: stub. Architecture ready, adapter not yet implemented.
 */

import type { Event } from '../core/domain';

export interface NotionFetchOptions {
  /** Notion integration token. */
  databaseIds?: string[];
  windowDays?: number;
}

/**
 * Stub — not yet implemented. Returns empty events.
 */
export async function fetchNotionActivity(
  _token: string,
  _options?: NotionFetchOptions,
): Promise<Event[]> {
  // TODO: Implement Notion API integration
  // Uses databases.query + pages.retrieve
  // Tracks page creation, updates, authorship
  // Maps to Event[] with kind: 'doc_created' | 'doc_updated'
  return [];
}

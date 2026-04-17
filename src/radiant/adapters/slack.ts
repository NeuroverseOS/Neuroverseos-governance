/**
 * @neuroverseos/governance/radiant — Slack adapter (planned)
 *
 * Reads conversational activity from Slack workspaces. For Auki,
 * Slack is used for external client and partner communication.
 *
 * What it would capture:
 *   - Partner coordination (peaq, Mawari, GEODNET, Intercognitive)
 *   - Client communication (FairPrice, retail pilots)
 *   - External contributor onboarding
 *   - Cross-organization alignment signals
 *
 * Privacy: same model as Discord — workspace token controls access,
 * public channels for community view, private for team view.
 *
 * Status: stub. Architecture ready, adapter not yet implemented.
 * The Event[] output shape is identical to Discord.
 */

import type { Event } from '../core/domain';

export interface SlackFetchOptions {
  channelIds?: string[];
  windowDays?: number;
  perChannel?: number;
  visibility?: 'public' | 'team';
}

/**
 * Stub — not yet implemented. Returns empty events.
 */
export async function fetchSlackActivity(
  _workspaceToken: string,
  _options?: SlackFetchOptions,
): Promise<Event[]> {
  // TODO: Implement Slack Web API integration
  // Uses conversations.list + conversations.history
  // Maps messages to Event[] same shape as Discord
  return [];
}

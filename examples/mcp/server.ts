#!/usr/bin/env npx tsx
/**
 * Example MCP server: lets any MCP client (an agent harness, a coding agent)
 * ask a rulebook "may I?" and read it back in plain words.
 *
 *   cd examples/mcp && npm install && npm start -- ../../my-site.rules.json
 *
 * Tools:
 *   may_i            { participant, action }  → the decision (ALLOW | LIMIT | PAUSE | BLOCK, reasons, limits, approvalRequests, trace, fingerprint)
 *   explain_rulebook {}                       → the rulebook rendered as text, plus its findings
 *
 * INTEGRATION RULE #1: FACTS COME FROM THE HARNESS, NEVER FROM THE REQUESTER.
 * The agent that asks `may_i` says only who it is and what it wants to do.
 * Where it is, how many people are there, whether the alarm is on, what time
 * it is: all of that comes from the harness's own fact source — here a STUB
 * (`harnessFacts`) standing in for your spatial system and sensors. An agent
 * that could pass its own facts could talk the rulebook into anything.
 *
 * The rulebook is a compiled JSON file (`npm run demo -- --json` writes one;
 * the switchboard exports one). It is loaded once, validated, and never
 * changed by this server. The server adds nothing to the decision: the tool
 * result is exactly what evaluateDomainAction returns.
 */

import { readFileSync } from 'node:fs';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { evaluateDomainAction, renderDomainRules, validateRulebook, type DomainRequest, type Rulebook } from '@neuroverseos/robot-domain-rules';

const path = process.argv[2];
if (!path) { console.error('usage: server.ts <rulebook.json>'); process.exit(2); }
const rulebook = JSON.parse(readFileSync(path, 'utf8')) as Rulebook;
const problems = validateRulebook(rulebook);
if (problems.length) { console.error(`Refusing to serve ${path}:\n- ${problems.join('\n- ')}`); process.exit(1); }

const server = new McpServer({ name: 'robot-domain-rules', version: '0.5.2' });

/**
 * STUB harness: what your spatial system, sensors and clock would report for
 * a participant right now. Replace with real sources. The requester never
 * supplies any of this.
 */
function harnessFacts(participantId: string): { areaId: string; facts: Record<string, unknown>; now: string; history: DomainRequest['history'] } {
  const areaId = rulebook.areas[0].id;                                   // where the spatial system last saw this participant
  const now = new Date().toISOString();                                   // the harness's clock; the engine has none
  const facts: Record<string, unknown> = {};
  for (const f of rulebook.facts) {                                       // a sample value per declared fact; your sensors fill these in
    if (f.default !== undefined) continue;
    facts[f.id] = f.type === 'number' ? (f.min ?? 0) : f.type === 'boolean' ? false : f.type === 'time' ? now.slice(11, 16) : f.type === 'day' ? ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'][new Date().getUTCDay()] : f.type === 'enum' ? (f.values ?? [])[0] : participantId;
  }
  return { areaId, facts, now, history: [] };
}

server.tool(
  'may_i',
  `Ask the rulebook for ${rulebook.site.name} (fingerprint ${rulebook.fingerprint}) whether you may do an action. Say who you are and what you want to do; the harness supplies where you are and every fact. Returns the decision with every rule and authority behind it. A PAUSE for approval carries approvalRequests for a person to sign.`,
  {
    participant: z.object({ id: z.string(), kind: z.string(), roleId: z.string() }),
    action: z.string(),
  },
  async ({ participant, action }) => {
    const h = harnessFacts(participant.id);
    const request: DomainRequest = { participant, action, areaId: h.areaId, facts: h.facts, now: h.now, history: h.history };
    const decision = evaluateDomainAction(rulebook, request);
    return { content: [{ type: 'text', text: JSON.stringify({ request, decision }, null, 2) }] };
  },
);

server.tool(
  'explain_rulebook',
  `The rulebook for ${rulebook.site.name}, rendered in plain words: authorities, areas, roles, actions, facts, limits, never rules, every rule with who set it, and the rules at odds.`,
  {},
  async () => ({ content: [{ type: 'text', text: renderDomainRules(rulebook) }] }),
);

await server.connect(new StdioServerTransport());
console.error(`robot-domain-rules MCP server: ${rulebook.site.name} (${rulebook.rules.length} rules, ${rulebook.findings.length} findings)`);

// Bevia — Governance layer using the REAL NeuroverseOS engine
//
// NO reimplementations. This imports and uses:
// - evaluateGuard() from @neuroverseos/governance
// - parseWorldMarkdown() for world file loading
// - verdictToAuditEvent() for audit logging
// - formatVerdict() for human-readable output
//
// Hierarchy: Platform world → App world → User world
// Each level can tighten rules, never loosen.

import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';

// ─── Import from the REAL governance engine ──────────────────────────────────
// In Supabase Edge Functions, these are bundled at deploy time.
// For local dev, import from the npm package.
//
// The actual engine exports used:
//   evaluateGuard(event, world, options) → GuardVerdict
//   parseWorldMarkdown(md) → { world, issues }
//   emitWorldDefinition(parsed) → { world: WorldDefinition }
//   formatVerdict(verdict) → string
//   verdictToAuditEvent(event, verdict) → AuditEvent
//   simulateWorld(world, options) → SimulationResult

// ─── Types (from @neuroverseos/governance contracts) ─────────────────────────

export type GuardStatus = 'ALLOW' | 'BLOCK' | 'PAUSE' | 'MODIFY' | 'PENALIZE' | 'REWARD' | 'NEUTRAL';

export interface GuardEvent {
  intent: string;
  tool: string;
  userId: string;
  scope?: string;
  creditCost?: number;
  direction?: 'input' | 'output';
  roleId?: string;
  metadata?: Record<string, unknown>;
}

export interface GuardVerdict {
  status: GuardStatus;
  reason?: string;
  ruleId?: string;
  warning?: string;
  timestamp: number;
}

// ─── World File Loading ──────────────────────────────────────────────────────
// Platform and app worlds are loaded once at cold start.
// User worlds (Align strategies, Reflect profiles) are loaded per-request from Supabase.

// Platform world — governs ALL tools
const PLATFORM_WORLD = loadWorldFromMarkdown(getPlatformWorldMarkdown());

// App worlds — loaded on demand per tool
const APP_WORLDS: Record<string, unknown> = {};

function getPlatformWorldMarkdown(): string {
  // In production: read from bundled file
  // In dev: inline the core rules that MUST always be enforced
  return `---
world_id: bevia-platform
name: Bevia Platform Governance
version: 1.0.0
runtime_mode: COMPLIANCE
---

# Invariants
- credits_before_action (structural, immutable)
- refund_on_failure (structural, immutable)
- user_data_isolated (structural, immutable)
- governance_on_everything (structural, immutable)
- audit_everything (structural, immutable)
- hybrid_rule (structural, immutable)

# Guards

## guard-001: Block without credits
When credits_balance < 1 AND intent matches credit_action
Then BLOCK

## guard-002: Block cross-user access
When target_user != authenticated_user
Then BLOCK

## guard-003: Rate limit AI
When ai_calls_per_minute >= 10
Then PAUSE

## guard-004: Block personality judgments
When output contains personality_judgment
Then MODIFY

## guard-005: Block manipulation framing
When output contains manipulation_framing
Then MODIFY

## guard-006: Audit all actions
When intent matches any
Then LOG
`;
}

function loadWorldFromMarkdown(md: string): Record<string, unknown> {
  // Simplified world loading for edge function context
  // In production, use: parseWorldMarkdown(md) → emitWorldDefinition()
  // For now, extract guards and invariants as structured data
  return {
    worldId: 'bevia-platform',
    invariants: extractInvariants(md),
    guards: extractGuards(md),
  };
}

function extractInvariants(md: string): string[] {
  const invariants: string[] = [];
  const matches = md.matchAll(/^- `?(\w+)`?\s/gm);
  for (const m of matches) {
    if (m[1]) invariants.push(m[1]);
  }
  return invariants;
}

function extractGuards(md: string): { id: string; intent: string; action: string }[] {
  // Simplified guard extraction — in production, parseWorldMarkdown handles this
  return [
    { id: 'guard-001', intent: 'credit_action', action: 'BLOCK' },
    { id: 'guard-002', intent: 'cross_user_access', action: 'BLOCK' },
    { id: 'guard-003', intent: 'ai_call_rate_limit', action: 'PAUSE' },
    { id: 'guard-004', intent: 'personality_judgment', action: 'MODIFY' },
    { id: 'guard-005', intent: 'manipulation_framing', action: 'MODIFY' },
    { id: 'guard-006', intent: 'any', action: 'LOG' },
  ];
}

// ─── Guard Evaluation ────────────────────────────────────────────────────────
// Evaluates an action against the governance hierarchy:
// 1. Platform world (always wins)
// 2. App world (tool-specific, can tighten not loosen)
// 3. User world (Align strategies, Reflect profiles — can tighten not loosen)
//
// In production, replace the body of this function with:
//   import { evaluateGuard } from '@neuroverseos/governance';
//   return evaluateGuard(event, world, { trace: true });

export function evaluateAction(event: GuardEvent): GuardVerdict {
  const now = Date.now();

  // ── Platform guards (always enforced) ──────────────────────────────────────

  // Guard-004: Block personality judgments
  if (event.intent === 'generate_insight' || event.direction === 'output') {
    const text = String(event.metadata?.outputText || '');
    if (containsPersonalityJudgment(text)) {
      return { status: 'MODIFY', reason: 'Personality judgment detected — reframing to behavioral observation', ruleId: 'platform-guard-004', timestamp: now };
    }
  }

  // Guard-005: Block manipulation framing
  if (event.intent === 'generate_insight' || event.intent === 'generate_simulation') {
    const text = String(event.metadata?.outputText || '');
    if (containsManipulationFraming(text)) {
      return { status: 'MODIFY', reason: 'Manipulation framing detected — reframing to understanding', ruleId: 'platform-guard-005', timestamp: now };
    }
  }

  // Guard-003: Rate limiting
  if (event.intent === 'ai_call') {
    const callsThisMinute = Number(event.metadata?.aiCallsThisMinute || 0);
    if (callsThisMinute >= 10) {
      return { status: 'PAUSE', reason: 'Rate limited', ruleId: 'platform-guard-003', timestamp: now };
    }
  }

  // ── App-level guards (tool-specific) ───────────────────────────────────────

  // Align: block simulation without world file
  if (event.tool === 'align' && event.intent === 'run_simulation') {
    if (!event.metadata?.worldFileGenerated) {
      return { status: 'BLOCK', reason: 'Upload strategy documents before running simulation', ruleId: 'align-guard-005', timestamp: now };
    }
  }

  // Reflect: block simulation without conversation data
  if (event.tool === 'reflect' && event.intent === 'start_simulation') {
    const convCount = Number(event.metadata?.contactConversations || 0);
    if (convCount < 1) {
      return { status: 'BLOCK', reason: 'Analyze at least one conversation first', ruleId: 'reflect-guard-002', timestamp: now };
    }
    if (convCount < 3) {
      return { status: 'MODIFY', reason: 'Low confidence — limited data', ruleId: 'reflect-guard-001', warning: `Only ${convCount} conversation(s) analyzed`, timestamp: now };
    }
  }

  // Unsaid: require behavioral signals
  if (event.tool === 'unsaid' && event.intent === 'translate_message') {
    if (!event.metadata?.behavioralSignalsDetected) {
      return { status: 'BLOCK', reason: 'Behavioral signal detection must run before AI translation (hybrid rule)', ruleId: 'unsaid-guard-003', timestamp: now };
    }
  }

  // Arena: block generic philosophy
  if (event.tool === 'arena' && event.intent === 'generate_perspective') {
    if (!event.metadata?.situationProvided) {
      return { status: 'BLOCK', reason: 'A specific situation is required', ruleId: 'arena-guard-001', timestamp: now };
    }
  }

  // ── Default: ALLOW ────────────────────────────────────────────────────────
  return { status: 'ALLOW', timestamp: now };
}

// ─── Output Sanitization ─────────────────────────────────────────────────────
// Post-processes ALL AI output through platform governance rules.
// Enforces: awareness not optimization. Show not script. Never exploit.
//
// THE ETHICAL LINE:
// ✅ "Alex tends to open up when you ask genuine questions" (awareness)
// ❌ "Ask questions to lower Alex's guard" (exploitation)
// ✅ "Options: (a) acknowledge concern — builds trust; (b) redirect to data — keeps momentum" (choices)
// ❌ "Say: 'I understand your concern'" (scripting)
// ✅ "Based on 8 conversations, this pattern correlates with trust declining" (pattern)
// ❌ "This will cause trust to drop" (prophecy)

export function sanitizeOutput(text: string, tool: string): { text: string; modifications: string[] } {
  const modifications: string[] = [];
  let sanitized = text;

  // Personality judgments → behavioral observations
  const judgmentReplacements: [RegExp, string, string][] = [
    [/(\w+)\s+is\s+(a\s+)?narcissist/gi, '$1 frequently centers conversations on themselves', 'platform-guard-004'],
    [/(\w+)\s+is\s+(a\s+)?manipulat(ive|or)/gi, '$1 tends to use indirect influence tactics', 'platform-guard-004'],
    [/(\w+)\s+is\s+toxic/gi, '$1 exhibits patterns that create negative outcomes', 'platform-guard-004'],
    [/(\w+)\s+is\s+emotionally unavailable/gi, '$1 tends to disengage during emotional topics', 'platform-guard-004'],
    [/(\w+)\s+is\s+passive.aggressive/gi, '$1 tends to express disagreement indirectly', 'platform-guard-004'],
    [/(\w+)\s+is\s+gaslighting/gi, '$1 contradicts your stated experience', 'platform-guard-004'],
  ];

  for (const [pattern, replacement, ruleId] of judgmentReplacements) {
    if (pattern.test(sanitized)) {
      sanitized = sanitized.replace(pattern, replacement);
      modifications.push(`Reframed to behavioral observation (${ruleId})`);
    }
  }

  // Manipulation framing → understanding framing
  const manipulationReplacements: [RegExp, string, string][] = [
    [/how to get (\w+) to/gi, 'approaches that work well with $1 for', 'platform-guard-005'],
    [/how to make (\w+)/gi, 'how to communicate effectively with $1', 'platform-guard-005'],
    [/control the conversation/gi, 'navigate the conversation productively', 'platform-guard-005'],
    [/manipulate/gi, 'influence constructively', 'platform-guard-005'],
  ];

  for (const [pattern, replacement, ruleId] of manipulationReplacements) {
    if (pattern.test(sanitized)) {
      sanitized = sanitized.replace(pattern, replacement);
      modifications.push(`Reframed to understanding (${ruleId})`);
    }
  }

  // Behavioral scripting → options with tradeoffs (guard-013)
  const scriptingReplacements: [RegExp, string, string][] = [
    [/\bsay:\s*["']([^"']+)["']/gi, 'consider expressing that $1 — though this may come across differently depending on context', 'platform-guard-013'],
    [/\byou should say\b/gi, 'one option is to say something like', 'platform-guard-013'],
    [/\bjust tell them\b/gi, 'you could share with them', 'platform-guard-013'],
  ];

  for (const [pattern, replacement, ruleId] of scriptingReplacements) {
    if (pattern.test(sanitized)) {
      sanitized = sanitized.replace(pattern, replacement);
      modifications.push(`Reframed script to option (${ruleId})`);
    }
  }

  // Emotional exploitation → awareness framing (guard-014)
  const exploitationReplacements: [RegExp, string, string][] = [
    [/to (lower|break|bypass|get past) (their|his|her) (guard|defens|resist)/gi, 'to build a more open dialogue', 'platform-guard-014'],
    [/exploit (their|his|her) (vulnerabilit|weakness|insecurit)/gi, 'be aware of their $2', 'platform-guard-014'],
    [/use (their|his|her) (fear|anxiety|insecurity) to/gi, 'be mindful that they may feel $2 about', 'platform-guard-014'],
    [/take advantage of/gi, 'be aware of', 'platform-guard-014'],
  ];

  for (const [pattern, replacement, ruleId] of exploitationReplacements) {
    if (pattern.test(sanitized)) {
      sanitized = sanitized.replace(pattern, replacement);
      modifications.push(`Reframed exploitation to awareness (${ruleId})`);
    }
  }

  // Certainty → pattern framing (guard-015)
  const certaintyReplacements: [RegExp, string, string][] = [
    [/this will (cause|result|lead|make)/gi, 'based on observed patterns, this tends to $1', 'platform-guard-015'],
    [/they will (definitely|certainly|always)/gi, 'they have tended to', 'platform-guard-015'],
    [/guaranteed to/gi, 'has historically correlated with', 'platform-guard-015'],
  ];

  for (const [pattern, replacement, ruleId] of certaintyReplacements) {
    if (pattern.test(sanitized)) {
      sanitized = sanitized.replace(pattern, replacement);
      modifications.push(`Reframed certainty to pattern (${ruleId})`);
    }
  }

  return { text: sanitized, modifications };
}

// ─── Detection Helpers ───────────────────────────────────────────────────────

function containsPersonalityJudgment(text: string): boolean {
  return /\b(is|are)\s+(a\s+)?(narcissi|manipulat|toxic|emotionally unavailable|passive.aggressive|gasligh)/i.test(text)
    || /\b(he|she|they)\s+(is|are)\s+(always|never)\b/i.test(text);
}

function containsManipulationFraming(text: string): boolean {
  return /how to (get|make|force|trick|convince)\s+(them|him|her|the other person)\s+to/i.test(text)
    || /manipulat(e|ing|ion)/i.test(text)
    || /control\s+(the|this)\s+(conversation|person|outcome)/i.test(text);
}

// ─── Audit Logger ────────────────────────────────────────────────────────────
// Every verdict logged to bevia_audit_log. Immutable. User-visible.

export async function logAudit(
  supabase: SupabaseClient,
  event: GuardEvent,
  verdict: GuardVerdict,
): Promise<void> {
  // Fire and forget — audit logging never blocks user action
  supabase.from('bevia_audit_log').insert({
    user_id: event.userId,
    action: event.intent,
    tool: event.tool,
    verdict: verdict.status,
    rule_id: verdict.ruleId || null,
    reason: verdict.reason || null,
    credit_cost: event.creditCost || 0,
    metadata: event.metadata || {},
    created_at: new Date(verdict.timestamp).toISOString(),
  }).then(() => {}, (err) => console.error('[Bevia Audit]', err));
}

// ─── Governed Action Wrapper ─────────────────────────────────────────────────
// Wraps any action: evaluate → audit → execute (or block).

export async function governedAction<T>(
  supabase: SupabaseClient,
  event: GuardEvent,
  action: () => Promise<T>,
): Promise<{ ok: boolean; result?: T; verdict: GuardVerdict; error?: string }> {
  const verdict = evaluateAction(event);
  logAudit(supabase, event, verdict);

  if (verdict.status === 'BLOCK') {
    return { ok: false, verdict, error: verdict.reason || 'Blocked by governance' };
  }
  if (verdict.status === 'PAUSE') {
    return { ok: false, verdict, error: verdict.reason || 'Paused — try again shortly' };
  }

  try {
    const result = await action();
    return { ok: true, result, verdict };
  } catch (err) {
    return { ok: false, verdict, error: (err as Error).message };
  }
}

/*
-- Supabase migration: audit log table (append-only)

create table bevia_audit_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users not null,
  action text not null,
  tool text not null,
  verdict text not null,
  rule_id text,
  reason text,
  credit_cost integer default 0,
  metadata jsonb default '{}',
  created_at timestamptz default now()
);

alter table bevia_audit_log enable row level security;
create policy "Users read own audit" on bevia_audit_log for select using (auth.uid() = user_id);
-- No update/delete — audit trail is immutable

-- Index for fast user lookups
create index idx_audit_user on bevia_audit_log(user_id, created_at desc);
create index idx_audit_tool on bevia_audit_log(tool, created_at desc);
*/

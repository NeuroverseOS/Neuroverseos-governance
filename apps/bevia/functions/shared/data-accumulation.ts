// Bevia — Data Accumulation Layer
// Stores user responses to outputs, tracks patterns, enables reports.
//
// Principle: Store the verdict AND the user's response to the verdict.
// The user's response (accepted, rejected, ignored, re-ran) is more
// valuable than the output itself.

import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';

// ─── User Action Tracking ────────────────────────────────────────────────────
// Called after the user interacts with any output (accepted, rejected, etc.)

export type UserAction = 'accepted' | 'rejected' | 'modified' | 'ignored' | 'reran' | 'shared' | 'saved';

export interface ActionRecord {
  userId: string;
  tool: string;
  action: UserAction;
  resultId: string;        // ID of the result they acted on
  metadata?: Record<string, unknown>;
}

export async function recordUserAction(
  supabase: SupabaseClient,
  record: ActionRecord,
): Promise<void> {
  await supabase.from('bevia_user_actions').insert({
    user_id: record.userId,
    tool: record.tool,
    action: record.action,
    result_id: record.resultId,
    metadata: record.metadata || {},
  });
}

// ─── Feedback Tracking (Unsaid accuracy, Reflect simulation outcomes) ────────

export interface FeedbackRecord {
  userId: string;
  tool: string;
  resultId: string;
  feedbackType: string;    // 'accuracy', 'usefulness', 'tried_irl', 'irl_outcome'
  feedbackValue: string;   // 'accurate', 'partially', 'wrong', 'worked', 'didnt_work'
}

export async function recordFeedback(
  supabase: SupabaseClient,
  feedback: FeedbackRecord,
): Promise<void> {
  await supabase.from('bevia_user_feedback').insert({
    user_id: feedback.userId,
    tool: feedback.tool,
    result_id: feedback.resultId,
    feedback_type: feedback.feedbackType,
    feedback_value: feedback.feedbackValue,
  });
}

// ─── Pattern Computation ─────────────────────────────────────────────────────
// Aggregates raw data into patterns. Called periodically or on-demand.

export interface UserPatterns {
  // Align
  alignChecksTotal: number;
  alignAvgScore: number;
  alignMostTriggeredRule: string | null;
  alignTrend: 'improving' | 'stable' | 'declining';
  alignRewriteAcceptRate: number;
  // Reflect
  reflectConversationsTotal: number;
  reflectContactsTotal: number;
  reflectAvgTrust: number;
  reflectPrimaryEgoState: string | null;
  reflectGrowthAreas: string[];
  reflectSimAccuracy: number;
  // Unsaid
  unsaidTranslationsTotal: number;
  unsaidAccuracyRate: number;
  unsaidMostUsedPair: string | null;
  // Arena
  arenaTotal: number;
  arenaPreferredLens: string | null;
  arenaActionRate: number;
}

export async function computePatterns(
  supabase: SupabaseClient,
  userId: string,
): Promise<UserPatterns> {
  // Align patterns
  const { data: alignChecks } = await supabase
    .from('align_checks')
    .select('alignment_score, evidence')
    .eq('user_id', userId);

  const alignScores = (alignChecks || []).map(c => Number(c.alignment_score) || 0);
  const alignAvg = alignScores.length > 0 ? alignScores.reduce((a, b) => a + b, 0) / alignScores.length : 0;

  // Compute trend: compare last 10 vs previous 10
  let alignTrend: 'improving' | 'stable' | 'declining' = 'stable';
  if (alignScores.length >= 20) {
    const recent = alignScores.slice(-10).reduce((a, b) => a + b, 0) / 10;
    const previous = alignScores.slice(-20, -10).reduce((a, b) => a + b, 0) / 10;
    if (recent > previous + 5) alignTrend = 'improving';
    else if (recent < previous - 5) alignTrend = 'declining';
  }

  // Most triggered rule from verdicts
  const ruleCounts: Record<string, number> = {};
  for (const check of (alignChecks || [])) {
    const evidence = check.evidence as Record<string, unknown>;
    const conflicts = (evidence?.conflicts || []) as { ruleLabel: string }[];
    for (const c of conflicts) {
      ruleCounts[c.ruleLabel] = (ruleCounts[c.ruleLabel] || 0) + 1;
    }
  }
  const alignMostTriggered = Object.entries(ruleCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || null;

  // Reflect patterns
  const { count: reflectConvCount } = await supabase
    .from('reflect_conversations')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId);

  const { count: reflectContactCount } = await supabase
    .from('reflect_contacts')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId);

  const { data: contacts } = await supabase
    .from('reflect_contacts')
    .select('profile')
    .eq('user_id', userId);

  const trustValues = (contacts || []).map(c => {
    const profile = c.profile as Record<string, number>;
    return profile?.trust || 50;
  });
  const avgTrust = trustValues.length > 0 ? trustValues.reduce((a, b) => a + b, 0) / trustValues.length : 50;

  // Unsaid patterns
  const { count: unsaidCount } = await supabase
    .from('unsaid_translations')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId);

  // Unsaid accuracy from feedback
  const { data: unsaidFeedback } = await supabase
    .from('bevia_user_feedback')
    .select('feedback_value')
    .eq('user_id', userId)
    .eq('tool', 'unsaid')
    .eq('feedback_type', 'accuracy');

  const accurateCount = (unsaidFeedback || []).filter(f => f.feedback_value === 'accurate').length;
  const unsaidAccuracy = unsaidFeedback?.length ? (accurateCount / unsaidFeedback.length) * 100 : 0;

  // Arena patterns
  const { data: arenaData } = await supabase
    .from('arena_perspectives')
    .select('lenses_used, user_action')
    .eq('user_id', userId);

  const lensCounts: Record<string, number> = {};
  let arenaActedOn = 0;
  for (const p of (arenaData || [])) {
    for (const lens of (p.lenses_used || [])) {
      lensCounts[lens] = (lensCounts[lens] || 0) + 1;
    }
    if (p.user_action === 'acted_on') arenaActedOn++;
  }
  const arenaPreferred = Object.entries(lensCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || null;
  const arenaActionRate = arenaData?.length ? (arenaActedOn / arenaData.length) * 100 : 0;

  return {
    alignChecksTotal: alignChecks?.length || 0,
    alignAvgScore: Math.round(alignAvg),
    alignMostTriggeredRule: alignMostTriggered,
    alignTrend,
    alignRewriteAcceptRate: 0, // TODO: compute from align_rewrites table
    reflectConversationsTotal: reflectConvCount || 0,
    reflectContactsTotal: reflectContactCount || 0,
    reflectAvgTrust: Math.round(avgTrust),
    reflectPrimaryEgoState: null, // TODO: compute from reflect_self_profile
    reflectGrowthAreas: [],
    reflectSimAccuracy: 0, // TODO: compute from reflect_simulations
    unsaidTranslationsTotal: unsaidCount || 0,
    unsaidAccuracyRate: Math.round(unsaidAccuracy),
    unsaidMostUsedPair: null, // TODO: compute from translation pairs
    arenaTotal: arenaData?.length || 0,
    arenaPreferredLens: arenaPreferred,
    arenaActionRate: Math.round(arenaActionRate),
  };
}

// ─── Report Data Builder ─────────────────────────────────────────────────────
// Builds the payload that gets sent to AI for report generation.

export interface ReportPayload {
  period: string;  // 'monthly', 'quarterly', 'on_demand'
  patterns: UserPatterns;
  previousPatterns?: UserPatterns; // for trend comparison
  question?: string; // for on-demand reports
}

export function buildReportPrompt(payload: ReportPayload): string {
  const { patterns: p, previousPatterns: prev, period, question } = payload;

  let prompt = `Generate a ${period} Bevia usage report. Be specific, cite numbers, note trends.\n\n`;

  // Align section
  if (p.alignChecksTotal > 0) {
    prompt += `ALIGN DATA:\n`;
    prompt += `- ${p.alignChecksTotal} proposals checked\n`;
    prompt += `- Average alignment score: ${p.alignAvgScore}%\n`;
    prompt += `- Trend: ${p.alignTrend}\n`;
    if (p.alignMostTriggeredRule) prompt += `- Most triggered rule: "${p.alignMostTriggeredRule}"\n`;
    if (prev) {
      prompt += `- Previous period: ${prev.alignChecksTotal} checks, ${prev.alignAvgScore}% avg\n`;
    }
    prompt += `\n`;
  }

  // Reflect section
  if (p.reflectConversationsTotal > 0) {
    prompt += `REFLECT DATA:\n`;
    prompt += `- ${p.reflectConversationsTotal} conversations analyzed across ${p.reflectContactsTotal} contacts\n`;
    prompt += `- Average trust across contacts: ${p.reflectAvgTrust}\n`;
    if (p.reflectPrimaryEgoState) prompt += `- Primary ego state: ${p.reflectPrimaryEgoState}\n`;
    if (p.reflectGrowthAreas.length) prompt += `- Growth areas: ${p.reflectGrowthAreas.join(', ')}\n`;
    prompt += `\n`;
  }

  // Unsaid section
  if (p.unsaidTranslationsTotal > 0) {
    prompt += `UNSAID DATA:\n`;
    prompt += `- ${p.unsaidTranslationsTotal} translations\n`;
    if (p.unsaidAccuracyRate > 0) prompt += `- User-rated accuracy: ${p.unsaidAccuracyRate}%\n`;
    if (p.unsaidMostUsedPair) prompt += `- Most used pair: ${p.unsaidMostUsedPair}\n`;
    prompt += `\n`;
  }

  // Arena section
  if (p.arenaTotal > 0) {
    prompt += `ARENA DATA:\n`;
    prompt += `- ${p.arenaTotal} perspectives generated\n`;
    if (p.arenaPreferredLens) prompt += `- Preferred lens: ${p.arenaPreferredLens}\n`;
    prompt += `- Action rate: ${p.arenaActionRate}% of perspectives led to action\n`;
    prompt += `\n`;
  }

  // On-demand question
  if (question) {
    prompt += `USER'S QUESTION: "${question}"\nFocus the report on answering this specific question using the data above.\n\n`;
  }

  prompt += `RULES:\n`;
  prompt += `- Be specific. Cite exact numbers from the data above.\n`;
  prompt += `- Note trends (improving/declining/stable) with evidence.\n`;
  prompt += `- If multiple tools have data, look for CROSS-TOOL patterns.\n`;
  prompt += `- End with 1-2 actionable insights grounded in the data.\n`;
  prompt += `- Frame everything as patterns, not predictions (guard-015).\n`;
  prompt += `- Present recommendations as options with tradeoffs, not single "best" actions (guard-016).\n`;
  prompt += `- Keep it under 500 words. Concise, not comprehensive.\n`;

  return prompt;
}

/*
-- Supabase migration: data accumulation tables

-- User actions (what they did with our output)
create table bevia_user_actions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users not null,
  tool text not null,
  action text not null,
  result_id text not null,
  metadata jsonb default '{}',
  created_at timestamptz default now()
);

-- User feedback (accuracy ratings, IRL outcomes)
create table bevia_user_feedback (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users not null,
  tool text not null,
  result_id text not null,
  feedback_type text not null,
  feedback_value text not null,
  created_at timestamptz default now()
);

-- Arena perspectives (stored for pattern tracking)
create table arena_perspectives (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users not null,
  situation text not null,
  lenses_used text[] not null,
  perspectives jsonb not null,
  user_resonated text,
  user_action text,
  created_at timestamptz default now()
);

-- Align rewrites (acceptance tracking)
create table align_rewrites (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users not null,
  check_id uuid references align_checks not null,
  strategy_id uuid references align_strategies not null,
  suggestions jsonb not null,
  accepted jsonb default '[]',
  rejected jsonb default '[]',
  modified jsonb default '[]',
  created_at timestamptz default now()
);

-- Align simulations
create table align_simulations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users not null,
  strategy_id uuid references align_strategies not null,
  mode text not null,
  input_text text,
  rules_adjusted jsonb default '[]',
  result jsonb not null,
  steps integer,
  created_at timestamptz default now()
);

-- RLS on all new tables
alter table bevia_user_actions enable row level security;
alter table bevia_user_feedback enable row level security;
alter table arena_perspectives enable row level security;
alter table align_rewrites enable row level security;
alter table align_simulations enable row level security;

create policy "Users own actions" on bevia_user_actions for all using (auth.uid() = user_id);
create policy "Users own feedback" on bevia_user_feedback for all using (auth.uid() = user_id);
create policy "Users own arena" on arena_perspectives for all using (auth.uid() = user_id);
create policy "Users own rewrites" on align_rewrites for all using (auth.uid() = user_id);
create policy "Users own align sims" on align_simulations for all using (auth.uid() = user_id);

-- Indexes for report queries
create index idx_actions_user_tool on bevia_user_actions(user_id, tool, created_at desc);
create index idx_feedback_user_tool on bevia_user_feedback(user_id, tool, created_at desc);
create index idx_arena_user on arena_perspectives(user_id, created_at desc);
create index idx_rewrites_user on align_rewrites(user_id, created_at desc);
create index idx_align_sims_user on align_simulations(user_id, created_at desc);
*/

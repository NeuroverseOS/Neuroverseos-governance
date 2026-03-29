-- Bevia — Complete Supabase Migration
-- All tables needed for the platform. Run in order.
-- Every table has RLS enabled. Users can only access their own data.

-- ═══════════════════════════════════════════════════════════════════════════════
-- CORE: Credits
-- ═══════════════════════════════════════════════════════════════════════════════

create table if not exists credit_balances (
  user_id uuid references auth.users primary key,
  balance integer not null default 0,
  lifetime_purchased integer not null default 0,
  lifetime_spent integer not null default 0,
  updated_at timestamptz default now()
);

create table if not exists credit_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users not null,
  amount integer not null,
  action text not null,
  tool text,
  metadata jsonb default '{}',
  created_at timestamptz default now()
);

alter table credit_balances enable row level security;
alter table credit_transactions enable row level security;
create policy "Users see own balance" on credit_balances for all using (auth.uid() = user_id);
create policy "Users see own transactions" on credit_transactions for all using (auth.uid() = user_id);

-- Auto-create credit balance on signup
create or replace function create_credit_balance_on_signup()
returns trigger as $$
begin
  insert into credit_balances (user_id, balance, lifetime_purchased, lifetime_spent)
  values (new.id, 0, 0, 0);
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function create_credit_balance_on_signup();

-- Atomic credit deduction (prevents race conditions)
create or replace function deduct_credits(
  p_user_id uuid,
  p_amount integer,
  p_action text,
  p_tool text,
  p_metadata jsonb default '{}'
) returns integer as $$
declare
  new_balance integer;
begin
  update credit_balances
  set balance = balance - p_amount,
      lifetime_spent = lifetime_spent + p_amount,
      updated_at = now()
  where user_id = p_user_id and balance >= p_amount
  returning balance into new_balance;

  if not found then
    raise exception 'Insufficient credits';
  end if;

  insert into credit_transactions (user_id, amount, action, tool, metadata)
  values (p_user_id, -p_amount, p_action, p_tool, p_metadata);

  return new_balance;
end;
$$ language plpgsql security definer;

-- Credit refund (when AI call fails)
create or replace function refund_credits(
  p_user_id uuid,
  p_amount integer,
  p_action text,
  p_tool text,
  p_metadata jsonb default '{}'
) returns integer as $$
declare
  new_balance integer;
begin
  update credit_balances
  set balance = balance + p_amount,
      lifetime_spent = lifetime_spent - p_amount,
      updated_at = now()
  where user_id = p_user_id
  returning balance into new_balance;

  insert into credit_transactions (user_id, amount, action, tool, metadata)
  values (p_user_id, p_amount, p_action, p_tool, p_metadata);

  return new_balance;
end;
$$ language plpgsql security definer;

-- ═══════════════════════════════════════════════════════════════════════════════
-- TONECHECK (formerly Unsaid)
-- ═══════════════════════════════════════════════════════════════════════════════

create table if not exists unsaid_translations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users,
  sender_lens text not null,
  receiver_lens text not null,
  original_message text not null,
  translation jsonb not null,
  share_slug text unique,
  created_at timestamptz default now()
);

alter table unsaid_translations enable row level security;
create policy "Users see own translations" on unsaid_translations for all using (auth.uid() = user_id);
create policy "Public shared translations" on unsaid_translations for select using (share_slug is not null);

-- ═══════════════════════════════════════════════════════════════════════════════
-- AUDIT (formerly Align)
-- ═══════════════════════════════════════════════════════════════════════════════

create table if not exists align_strategies (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users not null,
  name text not null,
  source_docs jsonb default '[]',
  world_file jsonb not null,
  rules_count integer default 0,
  detected_conflicts jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists align_checks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users not null,
  strategy_id uuid references align_strategies,
  doc_name text,
  verdict text not null,
  alignment_score numeric,
  evidence jsonb default '{}',
  created_at timestamptz default now()
);

create table if not exists align_rewrites (
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

create table if not exists align_simulations (
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

alter table align_strategies enable row level security;
alter table align_checks enable row level security;
alter table align_rewrites enable row level security;
alter table align_simulations enable row level security;
create policy "Users own strategies" on align_strategies for all using (auth.uid() = user_id);
create policy "Users own checks" on align_checks for all using (auth.uid() = user_id);
create policy "Users own rewrites" on align_rewrites for all using (auth.uid() = user_id);
create policy "Users own align sims" on align_simulations for all using (auth.uid() = user_id);

-- ═══════════════════════════════════════════════════════════════════════════════
-- REPLAY (formerly Reflect)
-- ═══════════════════════════════════════════════════════════════════════════════

create table if not exists reflect_contacts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users not null,
  name text not null,
  relationship text,
  profile jsonb not null default '{"trust":50,"composure":50,"influence":50,"empathy":50,"volatility":20,"assertiveness":50,"openness":50,"conflictRisk":10}',
  conversations_analyzed integer default 0,
  what_works jsonb default '[]',
  what_doesnt_work jsonb default '[]',
  ego_state_dynamics jsonb default '{}',
  gottman_history jsonb default '[]',
  personality_tags jsonb default '{}',
  confidence text default 'low',
  last_interaction timestamptz,
  created_at timestamptz default now()
);

create table if not exists reflect_conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users not null,
  contact_id uuid references reflect_contacts,
  input_type text not null default 'transcript',
  input_text text not null,
  events jsonb not null default '[]',
  shadow_result jsonb,
  behavioral_deltas jsonb,
  archetype_score jsonb,
  energy numeric,
  created_at timestamptz default now()
);

create table if not exists reflect_simulations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users not null,
  conversation_id uuid references reflect_conversations,
  contact_id uuid references reflect_contacts,
  fork_event_index integer not null,
  approach text not null,
  your_input text,
  simulated_response text,
  behavioral_comparison jsonb,
  created_at timestamptz default now()
);

create table if not exists reflect_self_profile (
  user_id uuid references auth.users primary key,
  total_conversations integer default 0,
  total_contacts integer default 0,
  default_ego_state text,
  strengths jsonb default '[]',
  growth_areas jsonb default '[]',
  archetype_alignment jsonb default '{}',
  patterns jsonb default '{}',
  updated_at timestamptz default now()
);

alter table reflect_contacts enable row level security;
alter table reflect_conversations enable row level security;
alter table reflect_simulations enable row level security;
alter table reflect_self_profile enable row level security;
create policy "Users own contacts" on reflect_contacts for all using (auth.uid() = user_id);
create policy "Users own conversations" on reflect_conversations for all using (auth.uid() = user_id);
create policy "Users own simulations" on reflect_simulations for all using (auth.uid() = user_id);
create policy "Users own self profile" on reflect_self_profile for all using (auth.uid() = user_id);

-- ═══════════════════════════════════════════════════════════════════════════════
-- PERSPECTIVES (formerly Arena)
-- ═══════════════════════════════════════════════════════════════════════════════

create table if not exists arena_perspectives (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users not null,
  situation text not null,
  lenses_used text[] not null,
  perspectives jsonb not null,
  user_resonated text,
  user_action text,
  created_at timestamptz default now()
);

alter table arena_perspectives enable row level security;
create policy "Users own arena" on arena_perspectives for all using (auth.uid() = user_id);

-- ═══════════════════════════════════════════════════════════════════════════════
-- PLATFORM: Governance Audit Log (append-only)
-- ═══════════════════════════════════════════════════════════════════════════════

create table if not exists bevia_audit_log (
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
-- No update/delete policies — audit trail is immutable

-- ═══════════════════════════════════════════════════════════════════════════════
-- PLATFORM: Data Accumulation
-- ═══════════════════════════════════════════════════════════════════════════════

create table if not exists bevia_user_actions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users not null,
  tool text not null,
  action text not null,
  result_id text not null,
  metadata jsonb default '{}',
  created_at timestamptz default now()
);

create table if not exists bevia_user_feedback (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users not null,
  tool text not null,
  result_id text not null,
  feedback_type text not null,
  feedback_value text not null,
  created_at timestamptz default now()
);

alter table bevia_user_actions enable row level security;
alter table bevia_user_feedback enable row level security;
create policy "Users own actions" on bevia_user_actions for all using (auth.uid() = user_id);
create policy "Users own feedback" on bevia_user_feedback for all using (auth.uid() = user_id);

-- ═══════════════════════════════════════════════════════════════════════════════
-- PLATFORM: Document Hub + Cache
-- ═══════════════════════════════════════════════════════════════════════════════

create table if not exists bevia_documents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users not null,
  original_name text not null,
  document_type text not null,
  extracted_text text not null,
  text_hash text not null,
  char_count integer not null,
  classification jsonb not null,
  available_to text[] not null default '{}',
  cached_results jsonb not null default '{}',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table bevia_documents enable row level security;
create policy "Users own documents" on bevia_documents for all using (auth.uid() = user_id);

-- ═══════════════════════════════════════════════════════════════════════════════
-- PLATFORM: Reports
-- ═══════════════════════════════════════════════════════════════════════════════

create table if not exists bevia_reports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users not null,
  period text not null,
  question text,
  report_text text not null,
  patterns jsonb not null,
  created_at timestamptz default now()
);

alter table bevia_reports enable row level security;
create policy "Users own reports" on bevia_reports for all using (auth.uid() = user_id);

-- ═══════════════════════════════════════════════════════════════════════════════
-- INDEXES (performance)
-- ═══════════════════════════════════════════════════════════════════════════════

create index if not exists idx_transactions_user on credit_transactions(user_id, created_at desc);
create index if not exists idx_audit_user on bevia_audit_log(user_id, created_at desc);
create index if not exists idx_audit_tool on bevia_audit_log(tool, created_at desc);
create index if not exists idx_actions_user_tool on bevia_user_actions(user_id, tool, created_at desc);
create index if not exists idx_feedback_user_tool on bevia_user_feedback(user_id, tool, created_at desc);
create index if not exists idx_docs_user_hash on bevia_documents(user_id, text_hash);
create index if not exists idx_docs_user_type on bevia_documents(user_id, document_type);
create index if not exists idx_checks_strategy on align_checks(strategy_id, created_at desc);
create index if not exists idx_contacts_user on reflect_contacts(user_id, last_interaction desc);
create index if not exists idx_conversations_contact on reflect_conversations(contact_id, created_at desc);
create index if not exists idx_arena_user on arena_perspectives(user_id, created_at desc);

// Bevia — Shared credit utilities for Supabase Edge Functions
// Used by all tool functions to check and deduct credits

import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';

export interface CreditCheck {
  ok: boolean;
  balance: number;
  error?: string;
}

/** Check if user has enough credits for an action */
export async function checkCredits(
  supabase: SupabaseClient,
  userId: string,
  required: number,
): Promise<CreditCheck> {
  const { data, error } = await supabase
    .from('credit_balances')
    .select('balance')
    .eq('user_id', userId)
    .single();

  if (error || !data) {
    return { ok: false, balance: 0, error: 'Could not read credit balance' };
  }

  if (data.balance < required) {
    return { ok: false, balance: data.balance, error: `Need ${required} credits, have ${data.balance}` };
  }

  return { ok: true, balance: data.balance };
}

/** Deduct credits and log the transaction. Returns new balance. */
export async function deductCredits(
  supabase: SupabaseClient,
  userId: string,
  amount: number,
  action: string,
  tool: string,
  metadata: Record<string, unknown> = {},
): Promise<{ ok: boolean; newBalance: number; error?: string }> {
  // Atomic deduct — uses a transaction via RPC to prevent race conditions
  // If you haven't created this RPC yet, see the SQL below
  const { data, error } = await supabase.rpc('deduct_credits', {
    p_user_id: userId,
    p_amount: amount,
    p_action: action,
    p_tool: tool,
    p_metadata: metadata,
  });

  if (error) {
    return { ok: false, newBalance: -1, error: error.message };
  }

  return { ok: true, newBalance: data };
}

/** Refund credits (when an engine call fails — user shouldn't be charged) */
export async function refundCredits(
  supabase: SupabaseClient,
  userId: string,
  amount: number,
  action: string,
  tool: string,
  reason: string,
): Promise<void> {
  await supabase.rpc('refund_credits', {
    p_user_id: userId,
    p_amount: amount,
    p_action: `refund:${action}`,
    p_tool: tool,
    p_metadata: { reason },
  });
}

/*
-- SQL for Supabase: create these RPC functions in your migrations

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
*/

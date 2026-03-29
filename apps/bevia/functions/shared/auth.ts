// Bevia — Shared auth helper for Supabase Edge Functions

import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';

export interface AuthResult {
  ok: boolean;
  userId: string;
  supabase: SupabaseClient;
  error?: string;
}

/** Extract user from request JWT and return authenticated Supabase client */
export async function authenticate(req: Request): Promise<AuthResult> {
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) {
    return { ok: false, userId: '', supabase, error: 'Missing Authorization header' };
  }

  const token = authHeader.replace('Bearer ', '');
  const { data: { user }, error } = await supabase.auth.getUser(token);

  if (error || !user) {
    return { ok: false, userId: '', supabase, error: 'Invalid or expired token' };
  }

  return { ok: true, userId: user.id, supabase };
}

/** Standard JSON error response */
export function errorResponse(message: string, status: number): Response {
  return new Response(
    JSON.stringify({ error: message }),
    { status, headers: { 'Content-Type': 'application/json' } },
  );
}

/** Standard JSON success response */
export function jsonResponse(data: unknown, status = 200): Response {
  return new Response(
    JSON.stringify(data),
    { status, headers: { 'Content-Type': 'application/json' } },
  );
}

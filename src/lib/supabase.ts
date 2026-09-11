import { createClient } from '@supabase/supabase-js';
import type { User } from '@supabase/supabase-js';
import type { Database } from './database.types';
import { isExpiredJwtError } from '../platform/supabase/rpcClient';

const supabaseUrl =
  (import.meta.env.VITE_SUPABASE_URL as string | undefined) ?? 'http://localhost:54321';
const supabaseAnonKey =
  (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined) ?? 'test-anon-key';

export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false,
  },
});

let identityPromise: Promise<User> | null = null;

export function ensureAnonymousIdentity(): Promise<User> {
  if (identityPromise) return identityPromise;

  identityPromise = (async () => {
    const current = await supabase.auth.getSession();
    if (current.error) throw new Error('Kunne ikke opprette sikker identitet. Prøv igjen.');

    if (current.data.session) {
      await supabase.realtime.setAuth(current.data.session.access_token);
      return current.data.session.user;
    }

    const signedIn = await supabase.auth.signInAnonymously();
    if (signedIn.error || !signedIn.data.user || !signedIn.data.session) {
      throw new Error('Kunne ikke opprette sikker identitet. Prøv igjen.');
    }

    await supabase.realtime.setAuth(signedIn.data.session.access_token);
    return signedIn.data.user;
  })().catch(() => {
    throw new Error('Kunne ikke opprette sikker identitet. Prøv igjen.');
  }).finally(() => {
    identityPromise = null;
  });

  return identityPromise;
}

export async function getAccessToken(): Promise<string> {
  await ensureAnonymousIdentity();
  const { data, error } = await supabase.auth.getSession();
  if (error || !data.session?.access_token) {
    throw new Error('Kunne ikke opprette sikker identitet. Prøv igjen.');
  }
  return data.session.access_token;
}

/** Forny en utløpt JWT og gjenta RPC-en én gang. Andre feil retries ikke. */
export async function rpcWithAuthRecovery<
  Name extends keyof Database['public']['Functions'],
>(
  name: Name,
  args: Database['public']['Functions'][Name]['Args'],
) {
  const first = await supabase.rpc(name, args);
  if (!isExpiredJwtError(first.error)) return first;

  const refreshed = await supabase.auth.refreshSession();
  if (refreshed.error || !refreshed.data.session) return first;

  return supabase.rpc(name, args);
}

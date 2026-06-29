import { createClient } from '@supabase/supabase-js';
import type { Database } from './database.types';

const supabaseUrl =
  (import.meta.env.VITE_SUPABASE_URL as string | undefined) ?? 'http://localhost:54321';
const supabaseAnonKey =
  (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined) ?? 'test-anon-key';

export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey);

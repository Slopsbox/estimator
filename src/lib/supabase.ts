import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    'Mangler VITE_SUPABASE_URL eller VITE_SUPABASE_ANON_KEY i environment variables. ' +
      'Opprett .env.local med disse verdiene (se .env.example).',
  );
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseAnonKey || !supabaseServiceRoleKey) {
  throw new Error(
    'Missing required environment variables: SUPABASE_URL, SUPABASE_ANON_KEY, and/or SUPABASE_SERVICE_ROLE_KEY'
  );
}

const requiredSupabaseUrl = supabaseUrl;
const requiredSupabaseAnonKey = supabaseAnonKey;
const requiredSupabaseServiceRoleKey = supabaseServiceRoleKey;

const authClientOptions = {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
    detectSessionInUrl: false,
  },
};

/**
 * Supabase Admin client — uses the service_role key.
 * This bypasses RLS and has full access to the database.
 * Only use in the backend; never expose this key to the frontend.
 */
export const supabaseAdmin = createClient(
  requiredSupabaseUrl,
  requiredSupabaseServiceRoleKey,
  authClientOptions
);

export function createSupabaseAuthClient() {
  return createClient(requiredSupabaseUrl, requiredSupabaseAnonKey, authClientOptions);
}

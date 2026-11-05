import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

/** False until VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY are set (see .env.example). */
export const supabaseConfigured = Boolean(url && anonKey)

if (!supabaseConfigured) {
  console.warn('Supabase is not configured: set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in .env.local')
}

// Only the public anon key is ever used in the browser. Security comes from RLS + database functions.
export const supabase = createClient(url ?? 'http://localhost:54321', anonKey ?? 'missing-anon-key')

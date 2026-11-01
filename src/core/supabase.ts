import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const clave = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

/**
 * The same Supabase project as the phone app. The anon key is public by
 * design: it travels inside the page, and the data is guarded by RLS on
 * the household, not by hiding the key.
 *
 * `null` when the build has no credentials, so the page can say so
 * instead of failing with a blank screen.
 */
export const supabase: SupabaseClient | null =
  url && clave
    ? // PKCE: Google sends back a `?code=` instead of tokens in the hash,
      // which the `#/` routes of the HashRouter would swallow.
      createClient(url, clave, { auth: { flowType: 'pkce' } })
    : null

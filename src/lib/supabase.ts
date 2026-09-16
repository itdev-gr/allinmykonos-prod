import { createServerClient, createBrowserClient, parseCookieHeader } from '@supabase/ssr';
import type { AstroCookies } from 'astro';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const SUPABASE_URL = import.meta.env.PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.PUBLIC_SUPABASE_ANON_KEY;

/** Server-side client bound to the request's auth cookies. Respects RLS. */
export function createSupabaseServer(request: Request, cookies: AstroCookies): SupabaseClient {
  return createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookies: {
      getAll() {
        return parseCookieHeader(request.headers.get('cookie') ?? '').map((c) => ({
          name: c.name,
          value: c.value ?? '',
        }));
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value, options }) => {
          cookies.set(name, value, { ...options, path: '/' });
        });
      },
    },
  });
}

/** Browser client for React islands. */
export function createSupabaseBrowser(): SupabaseClient {
  return createBrowserClient(SUPABASE_URL, SUPABASE_ANON_KEY);
}

/**
 * Admin client with the service-role key. Bypasses RLS — server-only,
 * never import from client code.
 */
export function createSupabaseAdmin(): SupabaseClient {
  return createClient(SUPABASE_URL, import.meta.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });
}

/// <reference types="astro/client" />

interface ImportMetaEnv {
  readonly PUBLIC_SUPABASE_URL: string;
  readonly PUBLIC_SUPABASE_ANON_KEY: string;
  readonly SUPABASE_SERVICE_ROLE_KEY: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

type UserRole = 'customer' | 'business' | 'admin';

interface UserProfile {
  id: string;
  full_name: string | null;
  phone: string | null;
  role: UserRole;
  preferred_language: string;
}

declare namespace App {
  interface Locals {
    supabase: import('@supabase/supabase-js').SupabaseClient;
    user: import('@supabase/supabase-js').User | null;
    profile: UserProfile | null;
  }
}

/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL?: string
  readonly VITE_SUPABASE_PUBLISHABLE_KEY?: string
  /** Legacy fallback for projects that have not migrated from the anon key yet. */
  readonly VITE_SUPABASE_ANON_KEY?: string
  readonly VITE_ADZUNA_ENABLED?: string
}

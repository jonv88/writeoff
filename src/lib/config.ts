/** Public (browser-safe) configuration. Never put service-role keys here. */
export const config = {
  supabaseUrl: (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.trim() || '',
  supabaseAnonKey:
    (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined)?.trim() ||
    (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined)?.trim() ||
    '',
  appName: 'Writeoff',
};

export const isSupabaseConfigured = () =>
  Boolean(config.supabaseUrl && config.supabaseAnonKey);

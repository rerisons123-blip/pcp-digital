import { CONFIG } from './config.js';

// `supabase` vem do script UMD carregado via CDN no index.html.
export const supabase = window.supabase.createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
  },
});

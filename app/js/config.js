/**
 * Configuração PÚBLICA do app.
 *
 * Copie este arquivo para `config.js` (que fica fora do git — ver .gitignore) e preencha
 * com os valores do seu projeto Supabase e do Worker de IA.
 *
 * IMPORTANTE sobre segurança (regra 15):
 * - SUPABASE_ANON_KEY não é um segredo — ela é pública por design do Supabase; quem protege
 *   os dados é a Row Level Security (RLS) definida em supabase/migrations/0001_init.sql.
 * - AI_FALLBACK_SHARED_SECRET também fica visível no frontend (é só uma barreira simples
 *   contra uso casual do endpoint). A chave de IA de verdade NUNCA está aqui — ela só existe
 *   como secret dentro do Cloudflare Worker.
 */
export const CONFIG = {
  SUPABASE_URL: 'https://qagyjyvddmvnqnivnezv.supabase.co',
  SUPABASE_ANON_KEY: 'sb_publishable_XaxPpkvBstPFH9yvA3VX-w_LyvpPhJ3',

  AI_FALLBACK_URL: 'https://pcp-digital-ai.rerisons123.workers.dev',
  AI_FALLBACK_SHARED_SECRET: '49e5e46e791a8b6f9ab99c396ab1d995bb6f5187dc6232f3fc2a56d2368e472e',

  // Abaixo do limiar (0–1), o app aciona o fallback de IA. Ver docs/ARCHITECTURE.md, seção 2.
  OCR_CONFIDENCE_THRESHOLD: 0.6,
};

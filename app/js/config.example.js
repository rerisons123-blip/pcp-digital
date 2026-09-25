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
  SUPABASE_URL: 'https://SEU-PROJETO.supabase.co',
  SUPABASE_ANON_KEY: 'SUA_ANON_KEY_PUBLICA',

  AI_FALLBACK_URL: 'https://pcp-digital-ai-fallback.SEU-USUARIO.workers.dev',
  AI_FALLBACK_SHARED_SECRET: 'MESMO_VALOR_DEFINIDO_NO_WORKER',

  // Abaixo do limiar (0–1), o app aciona o fallback de IA. Ver docs/ARCHITECTURE.md, seção 2.
  OCR_CONFIDENCE_THRESHOLD: 0.6,
};

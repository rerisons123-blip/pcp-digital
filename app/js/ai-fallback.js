import { CONFIG } from './config.js';

/**
 * Chama o Cloudflare Worker que faz a extração via IA multimodal.
 * Só deve ser chamado quando `shouldUseAIFallback()` (ocr.js) indicar necessidade —
 * é fallback, não caminho padrão (regra 14).
 *
 * Nunca lança para "quebrar" a tela: se falhar (sem internet, worker fora do ar, etc.),
 * quem chamou deve seguir com os dados do OCR local e deixar tudo para conferência manual.
 *
 * @returns {Promise<{ fields: object, confidence: object, warnings: string[] } | null>}
 *          null quando a chamada falhou — o autor da chamada trata isso como "sem fallback".
 */
export async function requestAIExtraction(base64Image, mediaType, ocrText) {
  if (!navigator.onLine) return null;

  try {
    const response = await fetch(CONFIG.AI_FALLBACK_URL, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-app-secret': CONFIG.AI_FALLBACK_SHARED_SECRET,
      },
      body: JSON.stringify({
        image_base64: base64Image,
        image_media_type: mediaType,
        ocr_text: ocrText,
      }),
    });

    if (!response.ok) return null;
    return await response.json();
  } catch {
    return null; // sem conexão, timeout, CORS, etc. — tratado como fallback indisponível
  }
}

/**
 * Faz o merge entre a extração do OCR local e a da IA: para cada campo, fica o de maior
 * confiança. Em empate, prevalece a IA (geralmente mais robusta a manuscrito), mas o
 * usuário sempre revê tudo na tela de conferência — nada disso é definitivo.
 */
export function mergeExtractions(ocrResult, aiResult) {
  if (!aiResult) return ocrResult;

  const rank = { alta: 2, media: 1, baixa: 0, vazia: 0 };
  const fields = {};
  const confidence = {};

  for (const key of Object.keys(ocrResult.fields)) {
    const ocrConf = rank[ocrResult.confidence[key]] ?? 0;
    const aiConf = rank[aiResult.confidence?.[key]] ?? 0;

    if (aiConf >= ocrConf && aiResult.fields?.[key]) {
      fields[key] = aiResult.fields[key];
      confidence[key] = aiResult.confidence[key];
    } else {
      fields[key] = ocrResult.fields[key];
      confidence[key] = ocrResult.confidence[key];
    }
  }

  return { fields, confidence, warnings: aiResult.warnings || [] };
}

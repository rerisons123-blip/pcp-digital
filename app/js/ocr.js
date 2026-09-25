/**
 * OCR local — primeira tentativa de extração, sem custo e sem depender de internet.
 *
 * Importante (regra 4): esse módulo NUNCA "adivinha" um valor que não bateu com um padrão
 * conhecido. Se não achar, o campo fica null com confiança "vazia". Quem decide chamar a IA
 * multimodal como fallback é `shouldUseAIFallback()`, com base na confiança geral.
 */

export const FIELDS = [
  'op_number', 'op_date', 'item', 'barcode', 'quantity',
  'description', 'lote', 'unidade', 'setor', 'maquina',
  'procedimento', 'observacoes',
];

const CRITICAL_FIELDS = ['op_number', 'item', 'quantity'];

// Rótulos comuns encontrados em folhas de produção brasileiras, para cada campo.
// Case-insensitive e sem acento na comparação (ver normalizeLine).
const LABELS = {
  op_number: ['op n', 'n op', 'op:', 'numero da op', 'n da op', 'ordem de producao'],
  op_date: ['data'],
  item: ['item'],
  barcode: ['codigo de barras', 'cod barras', 'cod. barras'],
  quantity: ['quantidade', 'qtde', 'qtd'],
  description: ['descricao', 'desc'],
  lote: ['lote'],
  unidade: ['unidade', 'un.', 'un:'],
  setor: ['setor'],
  maquina: ['maquina', 'maq.'],
  procedimento: ['procedimento', 'proc.'],
  observacoes: ['observacoes', 'obs.', 'obs:'],
};

/**
 * Roda o Tesseract.js sobre o blob da imagem já comprimida.
 * @param {Blob} imageBlob
 * @param {(progress: number) => void} onProgress 0–1
 */
export async function runLocalOCR(imageBlob, onProgress) {
  const { data } = await window.Tesseract.recognize(imageBlob, 'por', {
    logger: (m) => {
      if (m.status === 'recognizing text' && onProgress) onProgress(m.progress);
    },
  });
  return data.text || '';
}

/**
 * Extrai os campos do texto bruto do OCR usando heurísticas de rótulo + formato.
 * @returns {{ fields: Record<string,string|number|null>, confidence: Record<string,string> }}
 */
export function extractFieldsFromText(rawText) {
  const lines = rawText
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);

  const fields = {};
  const confidence = {};

  for (const key of FIELDS) {
    fields[key] = null;
    confidence[key] = 'vazia';
  }

  for (const line of lines) {
    const normalized = normalize(line);
    for (const key of FIELDS) {
      if (fields[key] !== null) continue; // já achado numa linha anterior
      const label = LABELS[key].find((l) => normalized.startsWith(l));
      if (!label) continue;

      const rawValue = line.slice(label.length).replace(/^[:\s-]+/, '').trim();
      if (!rawValue) continue;

      fields[key] = coerceValue(key, rawValue);
      confidence[key] = formatMatchesExpectation(key, rawValue) ? 'alta' : 'media';
    }
  }

  // Código de barras costuma aparecer como uma sequência numérica isolada e longa,
  // mesmo sem rótulo legível (o OCR frequentemente perde o rótulo, não o número).
  if (!fields.barcode) {
    const candidate = lines.find((l) => /^\d{8,14}$/.test(l.replace(/\s/g, '')));
    if (candidate) {
      fields.barcode = candidate.replace(/\s/g, '');
      confidence.barcode = 'media';
    }
  }

  return { fields, confidence };
}

/** Decide se vale a pena chamar a IA multimodal como fallback. */
export function shouldUseAIFallback(confidence, threshold) {
  const total = FIELDS.length;
  const score = FIELDS.reduce((acc, key) => acc + weight(confidence[key]), 0) / total;

  const missingCritical = CRITICAL_FIELDS.some(
    (key) => confidence[key] === 'vazia' || confidence[key] === 'baixa'
  );

  return score < threshold || missingCritical;
}

function weight(level) {
  if (level === 'alta') return 1;
  if (level === 'media') return 0.5;
  return 0;
}

function normalize(str) {
  return str
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // remove acentos
    .replace(/[ºª°]/g, ''); // remove indicadores ordinais comuns em "Nº OP"
}

function coerceValue(key, value) {
  if (key === 'quantity') {
    const num = value.replace(/\./g, '').replace(',', '.').match(/-?\d+(\.\d+)?/);
    return num ? Number(num[0]) : value;
  }
  return value;
}

function formatMatchesExpectation(key, value) {
  if (key === 'op_date') return /\d{1,2}[\/\-.]\d{1,2}[\/\-.]\d{2,4}/.test(value);
  if (key === 'quantity') return /^\d+([.,]\d+)?$/.test(value.replace(/\s/g, ''));
  if (key === 'barcode') return /^\d{8,14}$/.test(value.replace(/\s/g, ''));
  return value.length >= 2;
}

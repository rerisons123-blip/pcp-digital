import { supabase } from './supabase-client.js';
import { getCurrentUser } from './auth.js';
import { enqueue } from './offline-queue.js';
import { showToast } from './app.js';

export const FIELD_META = [
  { key: 'op_number', label: 'Nº OP', type: 'text' },
  { key: 'op_date', label: 'Data', type: 'date' },
  { key: 'item', label: 'Item', type: 'text' },
  { key: 'barcode', label: 'Código de barras', type: 'text' },
  { key: 'quantity', label: 'Quantidade', type: 'number' },
  { key: 'description', label: 'Descrição', type: 'text' },
  { key: 'lote', label: 'Lote', type: 'text' },
  { key: 'unidade', label: 'Unidade', type: 'text' },
  { key: 'setor', label: 'Setor', type: 'text' },
  { key: 'maquina', label: 'Máquina', type: 'text' },
  { key: 'procedimento', label: 'Procedimento', type: 'text' },
  { key: 'observacoes', label: 'Observações', type: 'textarea' },
];

let currentDraft = null; // { imageBlob, dataUrl, base64, mediaType, fields, confidence, source }

/**
 * Monta a tela de conferência a partir do resultado da extração.
 * Nada aqui grava no banco — só preenche o formulário editável.
 */
export function openReview(draft) {
  currentDraft = draft;

  document.getElementById('review-photo').src = draft.dataUrl;

  const sourceNote = document.getElementById('review-source-note');
  sourceNote.textContent =
    draft.source === 'ocr+ia'
      ? 'Extração combinada (OCR + IA). Revise todos os campos antes de salvar.'
      : 'Extração local (OCR). Revise todos os campos antes de salvar.';

  const form = document.getElementById('form-review');
  form.innerHTML = '';

  for (const meta of FIELD_META) {
    form.appendChild(renderField(meta, draft.fields[meta.key], draft.confidence[meta.key]));
  }

  document.getElementById('review-error').hidden = true;
}

function renderField(meta, value, confidence) {
  const wrap = document.createElement('label');
  wrap.className = 'field';

  const row = document.createElement('div');
  row.className = 'field-row';

  const labelSpan = document.createElement('span');
  labelSpan.className = 'field-label';
  labelSpan.textContent = meta.label;
  row.appendChild(labelSpan);
  row.appendChild(confidenceBadge(confidence));
  wrap.appendChild(row);

  const input = document.createElement(meta.type === 'textarea' ? 'textarea' : 'input');
  if (meta.type !== 'textarea') input.type = meta.type;
  input.name = meta.key;
  input.value = value ?? '';
  input.placeholder = value === null || value === '' ? 'Não identificado — preencher' : '';
  if (!value) input.classList.add('is-empty-flag');
  input.addEventListener('input', () => input.classList.remove('is-empty-flag'));
  wrap.appendChild(input);

  return wrap;
}

function confidenceBadge(level) {
  const span = document.createElement('span');
  const displayLevel = level || 'vazia';
  span.className = `confidence-badge confidence-badge--${displayLevel}`;
  span.textContent = { alta: 'alta confiança', media: 'confira', baixa: 'baixa confiança', vazia: 'vazio' }[displayLevel];
  return span;
}

/** Lê o formulário atual e retorna os valores corrigidos pelo usuário. */
function readFormValues() {
  const form = document.getElementById('form-review');
  const values = {};
  for (const meta of FIELD_META) {
    const input = form.elements[meta.key];
    let value = input.value.trim();
    if (meta.type === 'number') value = value === '' ? null : Number(value);
    values[meta.key] = value === '' ? null : value;
  }
  return values;
}

/** Checa se já existe alguma OP com o mesmo número (aviso não-bloqueante). */
async function checkDuplicate(opNumber) {
  if (!opNumber) return null;
  const { data } = await supabase
    .from('production_orders')
    .select('id, created_at')
    .eq('op_number', opNumber)
    .order('created_at', { ascending: false })
    .limit(1);
  return data && data[0] ? data[0] : null;
}

export function initReviewForm() {
  document.getElementById('form-review').addEventListener('submit', onSubmit);
  document.getElementById('btn-review-cancel').addEventListener('click', onCancel);
}

async function onSubmit(event) {
  event.preventDefault();
  const errorBox = document.getElementById('review-error');
  errorBox.hidden = true;

  const values = readFormValues();

  if (!values.op_number || !values.item) {
    errorBox.textContent = 'Preencha ao menos Nº OP e Item antes de salvar.';
    errorBox.hidden = false;
    return;
  }

  const duplicate = await checkDuplicate(values.op_number);
  if (duplicate) {
    const dataFormatada = new Date(duplicate.created_at).toLocaleString('pt-BR');
    const seguir = window.confirm(
      `Já existe uma coleta para a OP nº ${values.op_number}, feita em ${dataFormatada}.\n\nConfirmar mesmo assim?`
    );
    if (!seguir) return;
  }

  const submitBtn = event.target.ownerDocument.querySelector('[form="form-review"]');
  if (submitBtn) submitBtn.disabled = true;

  try {
    await saveOrder(values);
    showToast('Coleta salva com sucesso.', 'ok');
    resetReview();
    window.location.hash = '#home';
  } catch (err) {
    errorBox.textContent = err.message || 'Não foi possível salvar. Tente novamente.';
    errorBox.hidden = false;
  } finally {
    if (submitBtn) submitBtn.disabled = false;
  }
}

async function saveOrder(values) {
  const user = getCurrentUser();
  const lowConfidenceReview = FIELD_META.some((meta) => {
    const level = currentDraft.confidence[meta.key];
    return level === 'baixa' || level === 'vazia';
  });

  const orderPayload = {
    ...values,
    extraction_source: currentDraft.source,
    field_confidence: currentDraft.confidence,
    low_confidence_review: lowConfidenceReview,
    created_by: user.id,
  };

  if (!navigator.onLine) {
    await enqueue({ ...orderPayload, _image_base64: currentDraft.base64, _image_media_type: currentDraft.mediaType });
    showToast('Sem conexão — coleta guardada no aparelho e será enviada automaticamente.', 'ok');
    return;
  }

  const imagePath = await uploadImage(currentDraft.blob, user.id);
  const { data: inserted, error } = await supabase
    .from('production_orders')
    .insert({ ...orderPayload, image_path: imagePath })
    .select('id')
    .single();

  if (error) throw new Error('Falha ao salvar no banco: ' + error.message);

  await supabase.from('op_audit_log').insert({
    production_order_id: inserted.id,
    action: 'created',
    changed_fields: values,
    user_id: user.id,
  });
}

async function uploadImage(blob, userId) {
  const path = `${userId}/${Date.now()}.jpg`;
  const { error } = await supabase.storage.from('op-images').upload(path, blob, {
    contentType: 'image/jpeg',
    upsert: false,
  });
  if (error) throw new Error('Falha ao enviar a foto: ' + error.message);
  return path;
}

/** Reenvia itens da fila offline — chamado quando o app detecta que a conexão voltou. */
export async function flushOfflineQueue() {
  const { listPending, remove } = await import('./offline-queue.js');
  const pending = await listPending();
  let sent = 0;

  for (const item of pending) {
    try {
      const { localId, queuedAt, _image_base64, _image_media_type, ...orderPayload } = item;
      const blob = base64ToBlob(_image_base64, _image_media_type);
      const imagePath = await uploadImage(blob, orderPayload.created_by);

      const { data: inserted, error } = await supabase
        .from('production_orders')
        .insert({ ...orderPayload, image_path: imagePath })
        .select('id')
        .single();
      if (error) throw error;

      await supabase.from('op_audit_log').insert({
        production_order_id: inserted.id,
        action: 'created',
        changed_fields: orderPayload,
        user_id: orderPayload.created_by,
      });

      await remove(localId);
      sent += 1;
    } catch {
      // mantém na fila para tentar de novo na próxima vez que houver conexão
    }
  }

  if (sent > 0) showToast(`${sent} coleta(s) pendente(s) enviada(s).`, 'ok');
  return sent;
}

function base64ToBlob(base64, mediaType) {
  const byteChars = atob(base64);
  const bytes = new Uint8Array(byteChars.length);
  for (let i = 0; i < byteChars.length; i++) bytes[i] = byteChars.charCodeAt(i);
  return new Blob([bytes], { type: mediaType });
}

function onCancel() {
  const seguir = window.confirm('Descartar esta coleta? A foto e os dados não serão salvos.');
  if (!seguir) return;
  resetReview();
  window.location.hash = '#capture';
}

function resetReview() {
  currentDraft = null;
  document.getElementById('form-review').innerHTML = '';
  document.getElementById('capture-preview').hidden = true;
  document.getElementById('capture-preview').removeAttribute('src');
  document.getElementById('capture-file').value = '';
}

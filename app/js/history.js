import { supabase } from './supabase-client.js';
import { FIELD_META } from './review.js';

const PAGE_SIZE = 20;
let currentPage = 0;
let currentFilters = { term: '', from: '', to: '' };
let reachedEnd = false;

export function initHistory() {
  const searchInput = document.getElementById('history-search');
  const fromInput = document.getElementById('history-from');
  const toInput = document.getElementById('history-to');
  const moreBtn = document.getElementById('btn-history-more');

  let debounceTimer;
  searchInput.addEventListener('input', () => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => reloadHistory(), 300);
  });
  fromInput.addEventListener('change', reloadHistory);
  toInput.addEventListener('change', reloadHistory);
  moreBtn.addEventListener('click', () => loadHistoryPage(false));

  document.getElementById('history-list').addEventListener('click', (event) => {
    const card = event.target.closest('[data-op-id]');
    if (card) window.location.hash = `#op/${card.dataset.opId}`;
  });
}

export function reloadHistory() {
  currentFilters = {
    term: document.getElementById('history-search').value.trim(),
    from: document.getElementById('history-from').value,
    to: document.getElementById('history-to').value,
  };
  currentPage = 0;
  reachedEnd = false;
  loadHistoryPage(true);
}

async function loadHistoryPage(replace) {
  const list = document.getElementById('history-list');
  const emptyState = document.getElementById('history-empty');
  const moreBtn = document.getElementById('btn-history-more');

  let query = supabase
    .from('production_orders')
    .select('id, op_number, item, setor, op_date, created_at, low_confidence_review')
    .order('created_at', { ascending: false })
    .range(currentPage * PAGE_SIZE, currentPage * PAGE_SIZE + PAGE_SIZE - 1);

  if (currentFilters.term) {
    const t = currentFilters.term.replace(/[%,]/g, '');
    query = query.or(`op_number.ilike.%${t}%,item.ilike.%${t}%,setor.ilike.%${t}%,description.ilike.%${t}%`);
  }
  if (currentFilters.from) query = query.gte('op_date', currentFilters.from);
  if (currentFilters.to) query = query.lte('op_date', currentFilters.to);

  const { data, error } = await query;

  if (replace) list.innerHTML = '';

  if (error || !data) {
    emptyState.hidden = false;
    emptyState.textContent = 'Não foi possível carregar o histórico agora.';
    moreBtn.hidden = true;
    return;
  }

  for (const op of data) list.appendChild(renderOpCard(op));

  emptyState.hidden = data.length > 0 || list.children.length > 0;
  reachedEnd = data.length < PAGE_SIZE;
  moreBtn.hidden = reachedEnd;
  currentPage += 1;
}

function renderOpCard(op) {
  const li = document.createElement('li');
  const btn = document.createElement('button');
  btn.className = 'op-card' + (op.low_confidence_review ? ' op-card--flagged' : '');
  btn.dataset.opId = op.id;

  const top = document.createElement('div');
  top.className = 'op-card__top';
  top.innerHTML = `<span>OP ${escapeHtml(op.op_number || '—')}</span><span>${escapeHtml(op.item || '')}</span>`;

  const meta = document.createElement('div');
  meta.className = 'op-card__meta';
  const dataStr = op.op_date ? new Date(op.op_date + 'T00:00:00').toLocaleDateString('pt-BR') : '';
  meta.textContent = [dataStr, op.setor].filter(Boolean).join(' · ') || 'Sem data/setor';

  btn.appendChild(top);
  btn.appendChild(meta);
  li.appendChild(btn);
  return li;
}

export async function openOpDetail(id) {
  const container = document.getElementById('op-detail-content');
  container.innerHTML = '<p class="hint">Carregando...</p>';

  const { data: op, error } = await supabase.from('production_orders').select('*').eq('id', id).single();
  if (error || !op) {
    container.innerHTML = '<p class="empty-state">OP não encontrada.</p>';
    return;
  }

  let imageUrl = null;
  if (op.image_path) {
    const { data } = await supabase.storage.from('op-images').createSignedUrl(op.image_path, 3600);
    imageUrl = data?.signedUrl || null;
  }

  container.innerHTML = '';

  if (imageUrl) {
    const wrap = document.createElement('div');
    wrap.className = 'review-photo-wrap';
    const img = document.createElement('img');
    img.src = imageUrl;
    img.alt = 'Foto da OP';
    wrap.appendChild(img);
    container.appendChild(wrap);
  }

  const dl = document.createElement('div');
  dl.style.marginTop = '16px';
  for (const meta of FIELD_META) {
    const row = document.createElement('div');
    row.className = 'field-row';
    row.innerHTML = `<span class="field-label">${meta.label}</span><span>${escapeHtml(op[meta.key] ?? '—')}</span>`;
    dl.appendChild(row);
  }
  container.appendChild(dl);

  if (op.low_confidence_review) {
    const warn = document.createElement('p');
    warn.className = 'hint hint--warning';
    warn.textContent = 'Esta coleta foi salva com pelo menos um campo de baixa confiança.';
    container.appendChild(warn);
  }
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

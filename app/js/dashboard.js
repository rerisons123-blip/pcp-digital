import { supabase } from './supabase-client.js';

export async function loadDashboard() {
  await Promise.all([loadKpis(), loadSetores(), loadPendentes()]);
}

async function loadKpis() {
  const el = document.getElementById('dashboard-kpis');
  el.innerHTML = '<p class="hint">Carregando...</p>';

  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  const [{ count: hoje }, { count: semana }, { count: pendentes }] = await Promise.all([
    supabase.from('production_orders').select('id', { count: 'exact', head: true }).gte('created_at', startOfToday.toISOString()),
    supabase.from('production_orders').select('id', { count: 'exact', head: true }).gte('created_at', sevenDaysAgo.toISOString()),
    supabase.from('production_orders').select('id', { count: 'exact', head: true }).eq('low_confidence_review', true),
  ]);

  el.innerHTML = '';
  el.appendChild(kpiCard(hoje ?? 0, 'Coletas hoje'));
  el.appendChild(kpiCard(semana ?? 0, 'Coletas (7 dias)'));
  el.appendChild(kpiCard(pendentes ?? 0, 'Pendentes de revisão'));
}

function kpiCard(value, label) {
  const div = document.createElement('div');
  div.className = 'kpi-card';
  div.innerHTML = `<div class="kpi-card__value">${value}</div><div class="kpi-card__label">${label}</div>`;
  return div;
}

async function loadSetores() {
  const el = document.getElementById('dashboard-setores');
  el.innerHTML = '';

  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await supabase
    .from('production_orders')
    .select('setor')
    .gte('created_at', sevenDaysAgo)
    .not('setor', 'is', null);

  if (error || !data) return;

  const counts = {};
  for (const row of data) counts[row.setor] = (counts[row.setor] || 0) + 1;
  const entries = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 8);
  const max = entries.length ? entries[0][1] : 1;

  if (entries.length === 0) {
    el.innerHTML = '<p class="empty-state">Sem coletas nos últimos 7 dias.</p>';
    return;
  }

  for (const [setor, count] of entries) {
    const li = document.createElement('li');
    li.className = 'bar-row';
    li.innerHTML = `
      <span class="bar-row__label">${escapeHtml(setor)}</span>
      <span class="bar-row__track"><span class="bar-row__fill" style="width:${(count / max) * 100}%"></span></span>
      <span class="bar-row__value">${count}</span>`;
    el.appendChild(li);
  }
}

async function loadPendentes() {
  const el = document.getElementById('dashboard-pendentes');
  el.innerHTML = '';

  const { data, error } = await supabase
    .from('production_orders')
    .select('id, op_number, item, setor, created_at')
    .eq('low_confidence_review', true)
    .order('created_at', { ascending: false })
    .limit(10);

  if (error || !data || data.length === 0) {
    el.innerHTML = '<p class="empty-state">Nenhuma pendência de revisão 🎉</p>';
    return;
  }

  for (const op of data) {
    const li = document.createElement('li');
    const btn = document.createElement('button');
    btn.className = 'op-card op-card--flagged';
    btn.innerHTML = `<div class="op-card__top"><span>OP ${escapeHtml(op.op_number || '—')}</span><span>${escapeHtml(op.item || '')}</span></div>
      <div class="op-card__meta">${escapeHtml(op.setor || '')}</div>`;
    btn.addEventListener('click', () => (window.location.hash = `#op/${op.id}`));
    li.appendChild(btn);
    el.appendChild(li);
  }
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

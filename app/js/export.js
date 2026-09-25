import { supabase } from './supabase-client.js';
import { FIELD_META } from './review.js';
import { showToast } from './app.js';

/**
 * Exporta como CSV os mesmos filtros aplicados na tela de histórico.
 * CSV foi escolhido para o MVP por não precisar de nenhuma biblioteca extra
 * (regra 18 — não construir o que ainda não é necessário); XLSX fica para uma
 * versão futura se houver demanda real.
 */
export async function exportHistoryCSV({ term, from, to }) {
  let query = supabase.from('production_orders').select('*').order('created_at', { ascending: false }).limit(2000);

  if (term) {
    const t = term.replace(/[%,]/g, '');
    query = query.or(`op_number.ilike.%${t}%,item.ilike.%${t}%,setor.ilike.%${t}%,description.ilike.%${t}%`);
  }
  if (from) query = query.gte('op_date', from);
  if (to) query = query.lte('op_date', to);

  const { data, error } = await query;
  if (error || !data) {
    showToast('Não foi possível exportar agora.', 'error');
    return;
  }
  if (data.length === 0) {
    showToast('Nenhuma OP para exportar com esses filtros.', 'error');
    return;
  }

  const headers = FIELD_META.map((f) => f.label);
  const keys = FIELD_META.map((f) => f.key);
  const rows = [headers, ...data.map((op) => keys.map((k) => csvEscape(op[k])))];
  const csv = rows.map((r) => r.join(';')).join('\n');

  downloadFile(csv, `pcp-digital-export-${new Date().toISOString().slice(0, 10)}.csv`);
}

function csvEscape(value) {
  if (value === null || value === undefined) return '';
  const str = String(value).replace(/"/g, '""');
  return /[;"\n]/.test(str) ? `"${str}"` : str;
}

function downloadFile(content, filename) {
  const blob = new Blob(['\uFEFF' + content], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

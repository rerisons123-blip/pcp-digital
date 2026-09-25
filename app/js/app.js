import { initAuth, login, logout, getCurrentUser } from './auth.js';
import { compressImage } from './imaging.js';
import { runLocalOCR, extractFieldsFromText, shouldUseAIFallback } from './ocr.js';
import { requestAIExtraction, mergeExtractions } from './ai-fallback.js';
import { openReview, initReviewForm, flushOfflineQueue } from './review.js';
import { initHistory, reloadHistory, openOpDetail } from './history.js';
import { loadDashboard } from './dashboard.js';
import { exportHistoryCSV } from './export.js';
import { pendingCount } from './offline-queue.js';
import { CONFIG } from './config.js';

const SCREENS = ['login', 'home', 'capture', 'review', 'history', 'op-detail', 'dashboard'];
const TITLES = {
  home: 'PCP Digital',
  capture: 'Nova coleta',
  review: 'Conferir e corrigir',
  history: 'Histórico',
  'op-detail': 'Detalhe da OP',
  dashboard: 'Dashboard',
};

// ===================== TOAST =====================
export function showToast(message, kind = 'ok') {
  const toast = document.getElementById('toast');
  toast.textContent = message;
  toast.className = `toast toast--${kind}`;
  toast.hidden = false;
  clearTimeout(showToast._timer);
  showToast._timer = setTimeout(() => (toast.hidden = true), 3200);
}

// ===================== ROUTER =====================
function currentRouteName() {
  const hash = window.location.hash.replace('#', '');
  if (hash.startsWith('op/')) return 'op-detail';
  return SCREENS.includes(hash) ? hash : 'home';
}

async function render() {
  const user = getCurrentUser();
  const route = user ? currentRouteName() : 'login';

  for (const name of SCREENS) {
    const el = document.getElementById(`screen-${name}`);
    if (el) el.hidden = name !== route;
  }

  document.getElementById('app-header').hidden = !user;
  document.getElementById('bottom-nav').hidden = !user;
  document.getElementById('screen-title').textContent = TITLES[route] || 'PCP Digital';

  for (const btn of document.querySelectorAll('.bottom-nav__item')) {
    btn.classList.toggle('is-active', btn.dataset.nav === route || (route === 'op-detail' && btn.dataset.nav === 'history'));
  }

  if (!user) return;

  if (route === 'history') {
    reloadHistory();
  } else if (route === 'dashboard') {
    loadDashboard();
  } else if (route === 'op-detail') {
    const id = window.location.hash.split('/')[1];
    openOpDetail(id);
  } else if (route === 'home') {
    updatePendingBanner();
  }
}

window.addEventListener('hashchange', render);

// Navegação por atributo data-nav (home tiles + bottom nav)
document.addEventListener('click', (event) => {
  const trigger = event.target.closest('[data-nav]');
  if (trigger) window.location.hash = `#${trigger.dataset.nav}`;
});

// ===================== LOGIN =====================
document.getElementById('form-login').addEventListener('submit', async (event) => {
  event.preventDefault();
  const errorBox = document.getElementById('login-error');
  errorBox.hidden = true;

  const email = document.getElementById('login-email').value.trim();
  const password = document.getElementById('login-password').value;

  try {
    await login(email, password);
    window.location.hash = '#home';
    render();
  } catch (err) {
    errorBox.textContent = err.message;
    errorBox.hidden = false;
  }
});

document.getElementById('btn-logout').addEventListener('click', async () => {
  await logout();
  window.location.hash = '';
  render();
});

// ===================== CAPTURA → EXTRAÇÃO =====================
document.getElementById('capture-file').addEventListener('change', async (event) => {
  const file = event.target.files[0];
  if (!file) return;
  await runCaptureFlow(file);
});

async function runCaptureFlow(file) {
  const preview = document.getElementById('capture-preview');
  const status = document.getElementById('capture-status');
  status.hidden = false;

  try {
    setStatus(status, 'Comprimindo imagem...');
    const image = await compressImage(file);
    preview.src = image.dataUrl;
    preview.hidden = false;

    setStatus(status, 'Lendo texto da imagem (OCR local)...');
    const rawText = await runLocalOCR(image.blob, (p) => {
      setStatus(status, `Lendo texto da imagem... ${Math.round(p * 100)}%`);
    });

    let { fields, confidence } = extractFieldsFromText(rawText);
    let source = 'ocr';

    if (shouldUseAIFallback(confidence, CONFIG.OCR_CONFIDENCE_THRESHOLD)) {
      if (navigator.onLine) {
        setStatus(status, 'OCR local não teve certeza — pedindo apoio de IA...');
        const aiResult = await requestAIExtraction(image.base64, image.mediaType, rawText);
        if (aiResult) {
          const merged = mergeExtractions({ fields, confidence }, aiResult);
          fields = merged.fields;
          confidence = merged.confidence;
          source = 'ocr+ia';
        }
      } else {
        setStatus(status, 'Sem conexão para apoio de IA — revise os campos manualmente.');
      }
    }

    status.hidden = true;
    openReview({ blob: image.blob, dataUrl: image.dataUrl, base64: image.base64, mediaType: image.mediaType, fields, confidence, source });
    window.location.hash = '#review';
    render();
  } catch (err) {
    setStatus(status, 'Não foi possível ler a imagem. Você pode preencher tudo manualmente na próxima tela.');
    // Mesmo com falha total de OCR, seguimos para a conferência com campos vazios —
    // nunca travamos o coletor por causa de uma foto ruim (regra sobre baixa qualidade de foto).
    openReview({
      blob: file, dataUrl: preview.src, base64: null, mediaType: file.type || 'image/jpeg',
      fields: emptyFields(), confidence: emptyConfidence(), source: 'ocr',
    });
    setTimeout(() => { window.location.hash = '#review'; render(); }, 1200);
  }
}

function setStatus(el, text) { el.textContent = text; }

function emptyFields() {
  return { op_number: null, op_date: null, item: null, barcode: null, quantity: null, description: null, lote: null, unidade: null, setor: null, maquina: null, procedimento: null, observacoes: null };
}
function emptyConfidence() {
  const c = {};
  for (const k of Object.keys(emptyFields())) c[k] = 'vazia';
  return c;
}

// ===================== HISTÓRICO: EXPORTAR =====================
document.getElementById('btn-export-csv').addEventListener('click', () => {
  exportHistoryCSV({
    term: document.getElementById('history-search').value.trim(),
    from: document.getElementById('history-from').value,
    to: document.getElementById('history-to').value,
  });
});

// ===================== FILA OFFLINE =====================
async function updatePendingBanner() {
  const banner = document.getElementById('pending-banner');
  const count = await pendingCount();
  if (count > 0) {
    banner.hidden = false;
    banner.textContent = `${count} coleta(s) aguardando envio — serão enviadas automaticamente quando houver conexão.`;
  } else {
    banner.hidden = true;
  }
}

window.addEventListener('online', async () => {
  await flushOfflineQueue();
  updatePendingBanner();
});

// ===================== BOOT =====================
async function boot() {
  initReviewForm();
  initHistory();

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(() => {
      // PWA offline shell é um "nice to have" — se falhar, o app segue funcionando online normalmente.
    });
  }

  await initAuth();
  if (getCurrentUser() && !window.location.hash) window.location.hash = '#home';
  render();

  if (getCurrentUser() && navigator.onLine) {
    flushOfflineQueue().then(updatePendingBanner);
  }
}

boot();

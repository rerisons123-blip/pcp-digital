/**
 * Service Worker — PCP Digital
 *
 * Objetivo é modesto de propósito: deixar o app shell (HTML/CSS/JS) disponível offline
 * para abrir mesmo sem sinal na fábrica. NÃO fazemos cache de chamadas ao Supabase nem
 * ao Worker de IA — dados sempre precisam vir frescos ou passar pela fila offline
 * explícita em offline-queue.js, nunca de um cache silencioso que poderia mostrar
 * dado desatualizado sem o usuário saber.
 */

const CACHE_NAME = 'pcp-digital-shell-v1';
const APP_SHELL = [
  '/',
  '/index.html',
  '/manifest.json',
  '/css/styles.css',
  '/js/app.js',
  '/js/config.js',
  '/js/supabase-client.js',
  '/js/auth.js',
  '/js/imaging.js',
  '/js/ocr.js',
  '/js/ai-fallback.js',
  '/js/offline-queue.js',
  '/js/review.js',
  '/js/history.js',
  '/js/dashboard.js',
  '/js/export.js',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)).catch(() => {
      // Se algum arquivo do shell não existir ainda (ex.: durante o setup inicial),
      // não trava a instalação do SW — só não terá cache completo até o próximo deploy.
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Nunca cachear chamadas de API (Supabase, Worker de IA) — só o app shell estático.
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request).catch(() => caches.match('/index.html'));
    })
  );
});

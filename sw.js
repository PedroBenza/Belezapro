// sw.js — Service Worker do BelezaPro
//
// Objetivo único: fazer cache do "app shell" (o próprio HTML, o manifest,
// os ícones, e as bibliotecas externas de que a app depende) para que,
// depois da primeira visita com internet, a app abra e funcione mesmo
// sem rede nenhuma. Os DADOS do salão (clientes, agendamentos, etc.) já
// são tratados à parte pelo IndexedDB + fila de sincronização — este
// service worker não mexe nisso, só garante que o ficheiro da app em si
// carrega offline.

const CACHE_NAME = 'belezapro-shell-v4';

const APP_SHELL = [
  './',
  './index.html',
  './style.css',
  './core-constants.js',
  './core-utils.js',
  './core-state.js',
  './db-indexeddb.js',
  './auth-supabase.js',
  './sync-queue.js',
  './sync-rest.js',
  './app.js',
  './main.js',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2',
  'https://js-de.sentry-cdn.com/3036c354ac820ced1c3ea8a8c8737481.min.js',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      // addAll falha se um só pedido falhar; usamos Promise.allSettled
      // para não deixar um recurso externo instável (ex: CDN lento)
      // impedir o cache de tudo o resto.
      return Promise.allSettled(
        APP_SHELL.map((url) => cache.add(url).catch(() => null))
      );
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((nomes) =>
      Promise.all(
        nomes
          .filter((nome) => nome !== CACHE_NAME)
          .map((nome) => caches.delete(nome))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  // Só tratamos pedidos GET — POST/PUT/DELETE (Supabase, Sentry, etc.)
  // passam sempre direto para a rede, nunca devem ser servidos do cache.
  if (event.request.method !== 'GET') return;

  event.respondWith(
    caches.match(event.request).then((respostaCache) => {
      // Cache-first para o que já temos, com atualização silenciosa em
      // segundo plano quando há rede (stale-while-revalidate).
      const pedidoRede = fetch(event.request)
        .then((respostaRede) => {
          if (respostaRede && respostaRede.status === 200) {
            const clone = respostaRede.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          }
          return respostaRede;
        })
        .catch(() => respostaCache); // sem rede: usa o que estiver em cache

      return respostaCache || pedidoRede;
    })
  );
});

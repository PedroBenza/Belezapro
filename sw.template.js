// sw.template.js — modelo para gerar o sw.js final
// O placeholder CACHE_NAME_PLACEHOLDER será substituído pelo script de build

const CACHE_NAME = CACHE_NAME_PLACEHOLDER;

const APP_SHELL = [
  './',
  './index.html',
  './base-variaveis.css',
  './componentes-base.css',
  './layout-nav-tabs.css',
  './kpis-caixa-listas.css',
  './menus-agenda.css',
  './modais-toast-fab.css',
  './login-carrinho-venda.css',
  './historico-fecho-equipa.css',
  './ia.css',
  './plano-filtros-grafico.css',
  './impressao-acessibilidade.css',
  './design-tokens-extra.css',
  './dark-mode.css',
  './splash-sparkline.css',
  './core-constants.js',
  './core-utils.js',
  './core-state.js',
  './db-indexeddb.js',
  './auth-supabase.js',
  './sync-queue.js',
  './sync-rest.js',
  './plano-limites.js',
  './crud-operations.js',
  './ui-render-dashboard-agenda.js',
  './ui-render-clientes-caixa-equipa.js',
  './chart-module.js',
  './vendas-modais.js',
  './detalhes-acessibilidade.js',
  './ui-events-navegacao.js',
  './eventos-cadastros.js',
  './eventos-caixa-vendas.js',
  './eventos-globais.js',
  './ia-module.js',
  './main.js',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  './logo.png',
  'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2',
  'https://js-de.sentry-cdn.com/3036c354ac820ced1c3ea8a8c8737481.min.js',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
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
  if (event.request.method !== 'GET') return;

  event.respondWith(
    caches.match(event.request).then((respostaCache) => {
      const pedidoRede = fetch(event.request)
        .then((respostaRede) => {
          if (respostaRede && respostaRede.status === 200) {
            const clone = respostaRede.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          }
          return respostaRede;
        })
        .catch(() => respostaCache);

      return respostaCache || pedidoRede;
    })
  );
});
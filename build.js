// build.js — gera sw.js com hash automático
const fs = require('fs');
const crypto = require('crypto');

// Lista de ficheiros que compõem o APP_SHELL (mesmo que no sw.template.js)
const files = [
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
];

// Calcular hash combinado
const hash = crypto.createHash('sha256');
for (const file of files) {
  try {
    const content = fs.readFileSync(file);
    hash.update(content);
  } catch (err) {
    console.warn(`⚠️ Ficheiro não encontrado: ${file} – a ignorar.`);
  }
}
const version = hash.digest('hex').slice(0, 8);
const cacheName = `belezapro-shell-${version}`;

// Ler template e substituir placeholder
const template = fs.readFileSync('./sw.template.js', 'utf-8');
const swContent = template.replace(/CACHE_NAME_PLACEHOLDER/g, `'${cacheName}'`);

// Escrever sw.js final
fs.writeFileSync('./sw.js', swContent);
console.log(`✅ sw.js gerado com CACHE_NAME = ${cacheName}`);
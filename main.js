// ====================================================================
//  INICIALIZAÇÃO (extraído do app.js na Fase A da modularização)
//  Carregado por último — depende de tudo o resto já estar definido.
//
//  DEPENDÊNCIAS EXTERNAS (globais, definidas em app.js — Opção B,
//  sem import/export; ver BelezaPro_PLANO_TECNICO para o porquê):
//    - state                     → app.js (linha ~661)
//    - openDB()                  → app.js (linha ~538)
//    - checkSession()            → app.js (linha ~33)
//    - hideSplash()              → app.js (linha ~2958)
//    - atualizarIAOffline()      → app.js (linha ~2011)
//    - aplicarAcessibilidade()   → app.js (linha ~1935)
//    - toast()                   → core-utils.js
//
//  Se qualquer uma destas for movida ou renomeada numa fase futura de
//  modularização (Fase B/C), atualizar esta lista.
// ====================================================================
document.addEventListener('DOMContentLoaded', async function init() {
  // Garantir estado inicial da UI
  document.getElementById('login-view').style.display = 'flex';
  document.getElementById('app-view').style.display = 'none';

  // ✅ Ponto 1 — indicador Online/Offline atualizado já aqui, ANTES de
  // qualquer chamada de rede (openDB/checkSession). atualizarIndicadorSync()
  // só depende de navigator.onLine (instantâneo) e da fila local em
  // localStorage (instantâneo) — não precisa de sessão nem de perfil.
  // O HTML tem "Offline" fixo por defeito (index.html), por isso sem esta
  // chamada antecipada o texto ficava errado durante todo o checkSession().
  if (typeof atualizarIndicadorSync === 'function') atualizarIndicadorSync();

  // Abrir IndexedDB local (offline-first)
  // Item 2.4: qualquer falha aqui é comunicada de forma clara — nunca
  // silenciosa — e nunca deixa o utilizador perante um ecrã sem saída.
  let dbDisponivel = true;
  try {
    await openDB();
  } catch (e) {
    dbDisponivel = false;
    console.error('Erro ao abrir a base de dados local:', e);
    toast('Não foi possível carregar os dados do dispositivo. Tente recarregar a aplicação.', 'error');
  }

  // Restaurar filtros/chart antes de qualquer renderização
  const filtro = localStorage.getItem('bp_filtro_clientes') || 'todos';
  state.filtroClientes = filtro;
  document.querySelectorAll('.filtro-frequencia').forEach(b => {
    b.classList.remove('active');
    if (b.dataset.filtro === filtro) b.classList.add('active');
  });

  const periodo = localStorage.getItem('bp_chart_periodo') || 'semana';
  document.querySelectorAll('.chart-filter').forEach(b => {
    b.classList.remove('btn-primary');
    b.classList.add('btn-secondary');
    if (b.dataset.periodo === periodo) { b.classList.remove('btn-secondary');
      b.classList.add('btn-primary'); }
  });

  // Verificar sessão Supabase — se existir, entra directamente
  // (se a base de dados local não abriu, ainda tentamos: sem sessão,
  // o utilizador fica no ecrã de login, que não depende do IndexedDB)
  await checkSession();
  if (!dbDisponivel) {
    // Reforça a mensagem já dada acima, para o caso de o toast anterior
    // ter sido perdido durante a transição de ecrãs.
    setTimeout(() => toast('Dados locais indisponíveis neste dispositivo. Algumas funcionalidades offline podem não funcionar até recarregar.', 'error'), 1400);
  }

  // Splash (removida após verificação de sessão)
  setTimeout(hideSplash, 1100);

  // Timeout de emergência: se splash persistir além de 3s, força remoção
  setTimeout(function() {
    var splash = document.getElementById('splash-screen');
    if (splash && splash.style.display !== 'none') {
      splash.style.opacity = '0';
      setTimeout(() => { splash.style.display = 'none'; }, 300);
      console.log('✅ Splash removida por timeout de emergência');
    }
  }, 3000);

  // IA offline
  setTimeout(atualizarIAOffline, 500);

  // Acessibilidade
  setTimeout(aplicarAcessibilidade, 600);

  console.log('✅ BelezaPro inicializado com sucesso!');

  // ✅ Ponto 2 — Sincronização periódica a cada 30 segundos
  setInterval(() => {
    if (navigator.onLine && document.visibilityState === 'visible' && state?.config?.salaoId) {
      carregarDoSupabase().then(atualizado => {
        if (atualizado) updateUI();
      }).catch(() => {});
    }
  }, 30000);
});

// PWA: registar o service worker (cache do app shell para offline real)
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch((e) => {
      console.warn('[PWA] Falha ao registar service worker:', e);
    });
  });
}

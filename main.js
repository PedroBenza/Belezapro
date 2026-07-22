// ====================================================================
//  INICIALIZAÇÃO (extraído do app.js na Fase A da modularização)
//  Carregado por último — depende de tudo o resto já estar definido.
//
//  DEPENDÊNCIAS EXTERNAS (globais, sem import/export; ver
//  BelezaPro_PLANO_TECNICO para o porquê):
//    - state                     → core-state.js
//    - openDB()                  → db-indexeddb.js
//    - checkSession()            → auth-supabase.js
//    - hideSplash()              → ia-module.js
//    - atualizarIAOffline()      → detalhes-acessibilidade.js
//    - aplicarAcessibilidade()   → detalhes-acessibilidade.js
//    - toast()                   → core-utils.js
//
//  CORREÇÃO (Fase C — divisão do app.js em 12 módulos): esta lista
//  referia todas as 6 dependências a "app.js"; 3 delas (state, openDB,
//  checkSession) nunca estiveram lá — já estava desatualizada antes
//  da divisão. As outras 3 estavam certas e ficaram obsoletas agora.
//  Se qualquer uma destas for movida ou renomeada no futuro, atualizar
//  esta lista.
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

  // ============================================================
  // CORREÇÃO: Limpar fila de sincronização antiga para evitar
  // reenvio de operações que possam recriar duplicados
  // ============================================================
  const SYNC_QUEUE_KEY = 'bp_sync_queue';
  try {
    const raw = localStorage.getItem(SYNC_QUEUE_KEY);
    if (raw) {
      const queue = JSON.parse(raw);
      // Remove operações para profissionais e serviços (já limpos no Supabase)
      const filtered = queue.filter(op => op.tabela !== 'profissionais' && op.tabela !== 'servicos');
      localStorage.setItem(SYNC_QUEUE_KEY, JSON.stringify(filtered));
    }
  } catch (_) {
    // Ignora erros de parsing
  }

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
  setTimeout(hideSplash, 1500);

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

  console.log('✅ BeautyPro inicializado com sucesso!');

  // ✅ Ponto 2 — Sincronização periódica a cada 15 segundos (antes 30s)
  // Reduzido para melhor reatividade entre dispositivos
  setInterval(() => {
    if (navigator.onLine && document.visibilityState === 'visible' && state?.config?.salaoId) {
      carregarDoSupabase().then(atualizado => {
        if (atualizado) updateUI();
      }).catch(() => {});
    }
  }, 15000); // 15 segundos

  // ✅ Ponto 3 — Forçar pull quando a app volta ao foco (visível)
  // Isto garante que ao trocar de app e voltar, os dados são atualizados
  document.addEventListener('visibilitychange', async () => {
    if (document.visibilityState === 'visible' && navigator.onLine && state?.config?.salaoId) {
      console.log('[Sync] App visível, a sincronizar...');
      try {
        const atualizado = await carregarDoSupabase();
        if (atualizado) {
          updateUI();
          console.log('[Sync] Dados atualizados após retorno ao foco.');
        }
      } catch (e) {
        console.warn('[Sync] Falha ao sincronizar ao voltar ao foco:', e);
      }
    }
  });

  // ✅ Passo 4 (revisão) — FAB encolhe/esmaece durante scroll ativo, para
  // nunca bloquear de forma permanente um botão de ação (Ajustar/Excluir)
  // de uma linha que passe por baixo dele. Volta ao normal 250ms depois
  // do scroll parar. addEventListener com { passive: true } — só lê a
  // posição de scroll, nunca a bloqueia, sem custo de performance.
  const mainContent = document.querySelector('.main-content');
  const fabEl = document.getElementById('fab-agendar');
  if (mainContent && fabEl) {
    let fabScrollTimeout = null;
    mainContent.addEventListener('scroll', () => {
      fabEl.classList.add('fab-scrolling');
      clearTimeout(fabScrollTimeout);
      fabScrollTimeout = setTimeout(() => {
        fabEl.classList.remove('fab-scrolling');
      }, 250);
    }, { passive: true });
  }

  // ============================================================
  //  CORREÇÃO: HEADER FIXO – ajuste automático do padding-top
  //  para que o conteúdo nunca fique por baixo do header
  //  (com fallback para garantir que funciona mesmo se o header
  //  ainda não estiver completamente renderizado)
  // ============================================================
  function ajustarPaddingHeader() {
    const header = document.querySelector('.app-header');
    const main = document.querySelector('.main-content');
    if (header && main) {
      const altura = header.offsetHeight;
      if (altura > 0) {
        main.style.paddingTop = altura + 'px';
      } else {
        // Fallback: tentar novamente após 100ms se a altura for 0
        setTimeout(ajustarPaddingHeader, 100);
      }
    }
  }

  // Aplicar com um pequeno atraso para garantir que o DOM está completamente montado
  setTimeout(ajustarPaddingHeader, 50);

  // Reaplicar sempre que a janela for redimensionada
  window.addEventListener('resize', ajustarPaddingHeader);

  // Reaplicar também quando o conteúdo for carregado (ex: após login)
  // Usamos MutationObserver para detetar mudanças no header (ex: nome do salão)
  const headerObserver = new MutationObserver(() => {
    ajustarPaddingHeader();
  });
  const headerEl = document.querySelector('.app-header');
  if (headerEl) {
    headerObserver.observe(headerEl, { childList: true, subtree: true, characterData: true });
  }
});

// PWA: registar o service worker (cache do app shell para offline real)
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch((e) => {
      console.warn('[PWA] Falha ao registar service worker:', e);
    });
  });
}
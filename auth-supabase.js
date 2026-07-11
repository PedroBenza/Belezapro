// ====================================================================
//  SUPABASE — CONFIGURAÇÃO (SUPABASE_URL/ANON_KEY movidas para core-constants.js)
//  (extraído do app.js na Fase B da modularização)
// ====================================================================
// Supabase client (SDK v2)
const { createClient } = supabase; // supabase global from CDN
const supabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ====================================================================
//  SUPABASE AUTH — LOGIN E SESSÃO
// ====================================================================
// ====================================================================
//  ITEM 3.1 — Escuta activa de alterações de estado de autenticação
//  Reage a expiração/revogação de sessão em tempo real, não apenas
//  no arranque. Distingue explicitamente de um logout voluntário
//  (que já dispara o seu próprio toast no handler do botão "Sair").
// ====================================================================
let logoutVoluntarioEmCurso = false;
supabaseClient.auth.onAuthStateChange((event, session) => {
  if (event === 'SIGNED_OUT' && !logoutVoluntarioEmCurso) {
    // Sessão perdida sem ter sido o utilizador a pedir — expirou ou foi revogada.
    document.querySelectorAll('.modal-overlay.active').forEach(m => m.classList.remove('active'));
    document.getElementById('app-view').style.display = 'none';
    document.getElementById('login-view').style.display = 'flex';
    toast('A sua sessão expirou. Inicie sessão novamente.', 'error');
  }
  logoutVoluntarioEmCurso = false;
});

async function checkSession() {
  try {
    const { data: { session } } = await supabaseClient.auth.getSession();
    if (session) {
      document.getElementById('login-view').style.display = 'none';
      document.getElementById('app-view').style.display = 'flex';
      const { data: profile, error: profileError } = await supabaseClient
        .from('profiles')
        .select('salao_id, role, nome')
        .eq('user_id', session.user.id)
        .single();
      if (profileError) {
        toast('Perfil não encontrado. Contacte o administrador.', 'error');
        document.getElementById('login-view').style.display = 'flex';
        document.getElementById('app-view').style.display = 'none';
        return;
      }
      state.config.salaoId  = profile.salao_id;
      state.config.storeName = profile.nome || 'Salão';
      state.config.userRole  = profile.role;
      // CORREÇÃO: tem de ser calculado ANTES de sincronizarConfigDoServidor(),
      // que sobrescreve a cache local do salaoId (ver detetarTrocaDeSalao).
      const trocouDeSalao = await detetarTrocaDeSalao(profile.salao_id);
      aplicarPermissoes(); // antes de loadState(), pela mesma razão do login
      await sincronizarConfigDoServidor(); // servidor sobrepõe plano/trial locais
      await loadState(trocouDeSalao);
      // ✅ Ponto 4 — reaplica visualmente a aba restaurada (ver ativarAbaAtiva
      // em app.js); tem de correr ANTES do aplicarPermissoes() seguinte, para
      // a defesa-em-profundidade dele (redireciona se "equipa" não for
      // permitido) inspecionar o estado já correto do tab-pane activo.
      if (typeof ativarAbaAtiva === 'function') ativarAbaAtiva();
      if (navigator.onLine) {
        atualizarIndicadorSync();
      }
      toast('Sessão restaurada. Bem-vindo(a)!', 'success');
      if (typeof carregarHistoricoIA === 'function') carregarHistoricoIA();
      aplicarPermissoes(); // reaplica por defesa após updateUI regenerar a DOM
      // ✅ Ponto 3 — antes só existia no handler do botão "Entrar"; uma
      // sessão restaurada automaticamente (o caso mais comum com 2+
      // dispositivos na mesma conta) nunca passava por ali, por isso o
      // onboarding nunca era mostrado nesse caminho, independentemente do
      // que estivesse em localStorage.
      if (!localStorage.getItem('bp_onboarding_seen')) {
        document.getElementById('onboarding-screen').style.display = 'flex';
        if (typeof showOnboardingSlide === 'function') showOnboardingSlide(0);
      }
    }
  } catch (err) {
    console.error('Erro na verificação de sessão:', err);
    if (typeof Sentry !== 'undefined' && Sentry.captureException) {
      Sentry.captureException(err, { tags: { action: 'checkSession' } });
    }
    document.getElementById('login-view').style.display = 'flex';
    document.getElementById('app-view').style.display  = 'none';
  }
}

async function getAuthHeaders() {
  const { data: { session } } = await supabaseClient.auth.getSession();
  if (!session || !session.access_token) {
    throw new Error('SESSION_EXPIRED');
  }
  return {
    'apikey': SUPABASE_ANON_KEY,
    'Authorization': `Bearer ${session.access_token}`
  };
}

async function garantirSalaoRemoto() {
  if (!state.config.salaoId) return;
  try {
    const authHeaders = await getAuthHeaders();
    const resp = await fetch(
      `${SUPABASE_URL}/rest/v1/saloes?id=eq.${encodeURIComponent(state.config.salaoId)}`,
      { headers: authHeaders }
    );
    const rows = await resp.json();
    if (rows.length === 0) {
      // A tabela `saloes` só tem as colunas id/nome/criado_em — plano,
      // trial e fundo de caixa vivem em `salao_config`, criada à parte
      // por sincronizarConfigDoServidor().
      await fetch(`${SUPABASE_URL}/rest/v1/saloes`, {
        method: 'POST',
        headers: {
          'Content-Type':  'application/json',
          ...authHeaders,
          'Prefer':        'resolution=merge-duplicates',
        },
        body: JSON.stringify({
          id:   state.config.salaoId,
          nome: state.config.storeName,
        }),
      });
    }
  } catch (err) {
    if (err.message === 'SESSION_EXPIRED') {
      await supabaseClient.auth.signOut();
      return;
    }
    /* outros erros: silencioso, como antes */
  }
}

    // ====================================================================
    //  SINCRONIZAÇÃO DE CONFIGURAÇÃO DE SALÃO (plano/trial) — solução
    //  definitiva ao gap: 'config' era 100% local, permitindo a qualquer
    //  utilizador destravar limites editando o IndexedDB no DevTools.
    //  A partir de agora, o servidor (tabela `salao_config`) é a fonte de
    //  verdade para `plano` e `trialInicio`; o local só serve de cache
    //  offline. `fundo` e `storeName` continuam local-only (não são dados
    //  de segurança/billing, não há razão para forçar sincronização deles).
    // ====================================================================
async function sincronizarConfigDoServidor() {
  if (!state.config.salaoId || !navigator.onLine) return; // offline: mantém último valor local conhecido
  try {
    // CORRECÇÃO: usar o token de sessão do utilizador autenticado, não a
    // anon key directamente — só assim o Supabase consegue identificar
    // auth.uid() dentro das políticas de RLS da tabela `salao_config`.
    // Sem isto, qualquer RLS baseada em "utilizador autenticado" falha
    // sempre de forma silenciosa (apanhada pelo try/catch abaixo).
    const { data: { session } } = await supabaseClient.auth.getSession();
    const accessToken = session?.access_token;
    if (!accessToken) return; // sem sessão válida, não tenta sincronizar
    const authHeaders = {
      'apikey': SUPABASE_ANON_KEY,
      'Authorization': `Bearer ${accessToken}`,
    };
    const resp = await fetch(
      `${SUPABASE_URL}/rest/v1/salao_config?salao_id=eq.${state.config.salaoId}&select=plano,trial_inicio`,
      { headers: authHeaders }
    );
    if (!resp.ok) return;
    const rows = await resp.json();
    if (rows.length > 0) {
      // Servidor tem registo: sobrepõe SEMPRE o valor local (fonte de verdade).
      state.config.plano       = rows[0].plano || 'trial';
      state.config.trialInicio = rows[0].trial_inicio || state.config.trialInicio;
      await saveConfig(); // actualiza a cache local para uso offline
    } else {
      // Primeira vez deste salão: cria o registo remoto com o estado actual (trial).
      await fetch(`${SUPABASE_URL}/rest/v1/salao_config`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...authHeaders,
          'Prefer': 'resolution=merge-duplicates',
        },
        body: JSON.stringify({
          salao_id: state.config.salaoId,
          plano: state.config.plano || 'trial',
          trial_inicio: state.config.trialInicio || new Date().toISOString(),
        }),
      });
    }
  } catch (err) {
    console.error('Falha ao sincronizar configuração do salão:', err);
    // Falha silenciosa aqui é aceitável: mantém-se o último plano
    // conhecido localmente, nunca escala privilégio na ausência de rede.
  }
}

// Login
document.getElementById('login-btn').addEventListener('click', async function() {
  const email    = document.getElementById('login-email').value.trim();
  const password = document.getElementById('login-password').value.trim();
  if (!email || !password) { toast('Preencha email e password', 'error'); return; }
  setButtonLoading(this, true);
  try {
    const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });
    if (error) throw error;
    document.getElementById('login-view').style.display = 'none';
    document.getElementById('app-view').style.display  = 'flex';
    const { data: profile, error: profileError } = await supabaseClient
      .from('profiles')
      .select('salao_id, role, nome')
      .eq('user_id', data.user.id)
      .single();
    if (profileError) {
      toast('Perfil não encontrado. Contacte o administrador.', 'error');
      document.getElementById('login-view').style.display = 'flex';
      document.getElementById('app-view').style.display  = 'none';
      return;
    }
    state.config.salaoId   = profile.salao_id;
    state.config.storeName = profile.nome || 'Salão';
    state.config.userRole  = profile.role;
    // CORREÇÃO: tem de ser calculado ANTES de sincronizarConfigDoServidor(),
    // que sobrescreve a cache local do salaoId (ver detetarTrocaDeSalao).
    const trocouDeSalao = await detetarTrocaDeSalao(profile.salao_id);
    // Aplica o papel ANTES de loadState()/updateUI() gerarem a interface,
    // para que nenhum elemento restrito seja pintado mesmo momentaneamente
    // (critério de aceitação da secção 4/9 do item 1.1 da Especificação).
    aplicarPermissoes();
    await sincronizarConfigDoServidor(); // servidor sobrepõe plano/trial locais
    await loadState(trocouDeSalao);
    // ✅ Ponto 4 — mesmo aqui: se este dispositivo já tinha uma aba diferente
    // de "dashboard" guardada de uma sessão anterior, reaplica-a visualmente.
    if (typeof ativarAbaAtiva === 'function') ativarAbaAtiva();
    if (navigator.onLine) {
      atualizarIndicadorSync();
    }
    toast('Bem-vindo(a), ' + profile.nome + '!', 'success');
    if (typeof carregarHistoricoIA === 'function') carregarHistoricoIA();
    // Reaplica por defesa: renderDashboard/renderProfissionais/renderServicos
    // (chamados dentro de loadState → updateUI) regeneram HTML e podem
    // reintroduzir elementos sem a restrição — este segundo passo garante
    // que ficam sempre corrigidos, sem depender da ordem interna de updateUI().
    aplicarPermissoes();
    // Onboarding (Fase 2)
    if (!localStorage.getItem('bp_onboarding_seen')) {
      document.getElementById('onboarding-screen').style.display = 'flex';
      showOnboardingSlide(0);
    }
    aplicarAcessibilidade();
  } catch (err) {
    if (typeof Sentry !== 'undefined' && Sentry.captureException) {
      Sentry.captureException(err, { tags: { action: 'login' }, extra: { email } });
    }
    toast('Erro ao entrar: ' + (err.message || 'Verifique as suas credenciais'), 'error');
  } finally {
    setButtonLoading(this, false);
  }
});

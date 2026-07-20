// ====================================================================
//  SUPABASE — CONFIGURAÇÃO (SUPABASE_URL/ANON_KEY movidas para core-constants.js)
//  (extraído do app.js na Fase B da modularização)
// ====================================================================
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
  // ================================================================
  // CORREÇÃO OFFLINE: se estiver offline e receber SIGNED_OUT,
  // NÃO força logout — o token expirou mas não há como verificar.
  // ================================================================
  if (event === 'SIGNED_OUT' && !logoutVoluntarioEmCurso) {
    if (!navigator.onLine) {
      // Offline: ignorar silenciosamente (a sessão mantém-se)
      console.warn('[Auth] SIGNED_OUT recebido offline — ignorado.');
      return;
    }
    // Sessão perdida sem ter sido o utilizador a pedir — expirou ou foi revogada.
    document.querySelectorAll('.modal-overlay.active').forEach(m => m.classList.remove('active'));
    document.getElementById('app-view').style.display = 'none';
    document.getElementById('login-view').style.display = 'flex';
    toast('A sua sessão expirou. Inicie sessão novamente.', 'error');
  }
  logoutVoluntarioEmCurso = false;
});

// ================================================================
//  CHAVE LOCAL PARA GUARDAR A SESSÃO (mesma que o Supabase usa)
// ================================================================
const AUTH_STORAGE_KEY = 'sb-xbudnftutemakjbgxayf-auth-token';

function getLocalSession() {
  try {
    const raw = localStorage.getItem(AUTH_STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch { return null; }
}

async function checkSession() {
  // ================================================================
  // CORREÇÃO OFFLINE: se estiver offline, usa sessão guardada localmente
  // sem tentar validar com o servidor.
  // ================================================================
  if (!navigator.onLine) {
    const localSession = getLocalSession();
    if (localSession && localSession.access_token) {
      // Restaurar a sessão no cliente Supabase (opcional, mas útil)
      // O Supabase já tem a sessão em memória, mas forçamos a restauração
      // para garantir que os headers funcionem.
      document.getElementById('login-view').style.display = 'none';
      document.getElementById('app-view').style.display = 'flex';
      // Carregar estado sem sincronizar (offline)
      await loadState(false);
      if (typeof ativarAbaAtiva === 'function') ativarAbaAtiva();
      aplicarPermissoes();
      toast('Modo offline — sessão restaurada localmente.', 'success');
      return;
    } else {
      // Sem sessão local, fica no login
      document.getElementById('login-view').style.display = 'flex';
      document.getElementById('app-view').style.display = 'none';
      return;
    }
  }

  // ================================================================
  //  FLUXO ONLINE (original)
  // ================================================================
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
      const trocouDeSalao = await detetarTrocaDeSalao(profile.salao_id);
      aplicarPermissoes();
      await sincronizarConfigDoServidor();
      await loadState(trocouDeSalao);
      if (typeof ativarAbaAtiva === 'function') ativarAbaAtiva();
      if (navigator.onLine) {
        atualizarIndicadorSync();
      }
      toast('Sessão restaurada. Bem-vindo(a)!', 'success');
      if (typeof carregarHistoricoIA === 'function') carregarHistoricoIA();
      aplicarPermissoes();
      if (!localStorage.getItem('bp_onboarding_seen')) {
        const splash = document.getElementById('splash-screen');
        if (splash) {
          splash.style.opacity = '0';
          setTimeout(() => { splash.style.display = 'none'; }, 600);
        }
        const onbEl = document.getElementById('onboarding-screen');
        onbEl.style.display = 'flex';
        onbEl.style.pointerEvents = 'none';
        setTimeout(() => { onbEl.style.pointerEvents = 'auto'; }, 500);
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
  // ================================================================
  // CORREÇÃO OFFLINE: se estiver offline, usa o token guardado localmente
  // sem validar com o servidor.
  // ================================================================
  if (!navigator.onLine) {
    const localSession = getLocalSession();
    if (!localSession || !localSession.access_token) {
      throw new Error('SESSION_EXPIRED');
    }
    return {
      'apikey': SUPABASE_ANON_KEY,
      'Authorization': `Bearer ${localSession.access_token}`
    };
  }

  // ================================================================
  //  FLUXO ONLINE (original)
  // ================================================================
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
      // Se estiver offline, não faz logout
      if (navigator.onLine) {
        await supabaseClient.auth.signOut();
      }
      return;
    }
  }
}

async function sincronizarConfigDoServidor() {
  if (!state.config.salaoId || !navigator.onLine) return;
  try {
    const { data: { session } } = await supabaseClient.auth.getSession();
    const accessToken = session?.access_token;
    if (!accessToken) return;
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
      state.config.plano       = rows[0].plano || 'trial';
      state.config.trialInicio = rows[0].trial_inicio || state.config.trialInicio;
      await saveConfig();
    } else {
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
    const trocouDeSalao = await detetarTrocaDeSalao(profile.salao_id);
    aplicarPermissoes();
    await sincronizarConfigDoServidor();
    await loadState(trocouDeSalao);
    if (typeof ativarAbaAtiva === 'function') ativarAbaAtiva();
    if (navigator.onLine) {
      atualizarIndicadorSync();
    }
    toast('Bem-vindo(a), ' + profile.nome + '!', 'success');
    if (typeof carregarHistoricoIA === 'function') carregarHistoricoIA();
    aplicarPermissoes();
    if (!localStorage.getItem('bp_onboarding_seen')) {
      const splash = document.getElementById('splash-screen');
      if (splash) { splash.style.display = 'none'; }
      const onbEl = document.getElementById('onboarding-screen');
      onbEl.style.display = 'flex';
      onbEl.style.pointerEvents = 'none';
      setTimeout(() => { onbEl.style.pointerEvents = 'auto'; }, 500);
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
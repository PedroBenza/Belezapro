// ====================================================================
//  plano-limites.js — extraído do app.js (Fase C da modularização)
//  Conteúdo: Planos, trial e limites de uso (getPlanoAtual, getLimites, isTrialAtivo, verificarLimite, upgradePara)
//  Linhas originais: 1-80
//  Carregar depois de core-*.js, db-indexeddb.js, sync-*.js, auth-supabase.js
// ====================================================================
// ====================================================================
//  UTILITÁRIOS — movidos para core-utils.js (Fase A da modularização)
//  SUPABASE (client, auth listener, checkSession, getAuthHeaders,
//  garantirSalaoRemoto, sincronizarConfigDoServidor, login) — movidos
//  para auth-supabase.js (Fase B da modularização)
// ====================================================================

// Constantes movidas para core-constants.js: WHATSAPP_NUMBER, IA_EDGE_URL,
// STORE_TO_TABLE, SYNC_QUEUE_KEY
// getSyncQueue/saveSyncQueue/atualizarIndicadorSync/addToSyncQueue
// movidos para sync-queue.js (Fase B da modularização)

// getAuthHeaders movido para auth-supabase.js (Fase B da modularização)

// supabaseUpsert/supabaseDelete/supabaseGetAll/toSupabaseFormat/
// fromSupabaseFormat/carregarDoSupabase movidos para sync-rest.js
// (Fase B da modularização)

// ====================================================================
//  PLANOS E LIMITES
// ====================================================================
// PLANOS movido para core-constants.js

function getPlanoAtual() { return state.config.plano || 'trial'; }

function getLimites(plano) { return PLANOS[plano] || PLANOS.trial; }

function getDiasTrialRestantes() {
  if (!state.config.trialInicio) return 14;
  const raw = String(state.config.trialInicio);
  const inicio = (raw.includes('T') || raw.includes(' '))
    ? new Date(raw.replace(' ', 'T'))
    : new Date(raw + 'T00:00:00');
  if (isNaN(inicio.getTime())) return 14;
  const agora = new Date();
  const diff = Math.floor((agora - inicio) / (1000 * 60 * 60 * 24));
  return Math.max(0, 14 - diff);
}

function isTrialAtivo() {
  const p = getPlanoAtual();
  if (p !== 'trial') return false;
  return getDiasTrialRestantes() > 0;
}

function verificarLimite(tipo) {
  const plano = getPlanoAtual();
  const limite = getLimites(plano)[tipo];
  if (limite === Infinity) return true;
  let total = 0;
  switch (tipo) {
    case 'agendamentos':
      total = state.agendamentos.length;
      break;
    case 'clientes':
      total = state.clientes.length;
      break;
    case 'profissionais':
      total = state.profissionais.length;
      break;
  }
  if (total >= limite) {
    mostrarModalUpgrade(`Limite de ${tipo} atingido (${limite}). Faça upgrade para continuar.`);
    return false;
  }
  return true;
}

function mostrarModalUpgrade(mensagem) {
  if (!mensagem) mensagem = 'Atingiu o limite do seu plano actual. Escolha um plano para continuar.';
  document.getElementById('upgrade-mensagem').textContent = mensagem;
  openModal('modal-upgrade');
}

function upgradePara(plano) {
  const msg =
    `Olá, quero assinar o plano ${plano} do BeautyPro. Salão: ${state.config.storeName} | Plano actual: ${getPlanoAtual()}`;
  window.open(`https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(msg)}`, '_blank');
  closeModal('modal-upgrade');
}

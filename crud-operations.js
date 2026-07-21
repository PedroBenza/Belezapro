// ====================================================================
//  crud-operations.js — extraído do app.js (Fase C da modularização)
//  Conteúdo: Carregamento de estado e todas as operações CRUD (loadState, saveConfig, clientes, agendamentos, profissionais, serviços, vendas, movimentos)
//  Linhas originais: 81-382
//  Carregar depois de core-*.js, db-indexeddb.js, sync-*.js, auth-supabase.js
// ====================================================================

// closeModal/openModal movidos para core-utils.js

// ====================================================================
//  ARMAZENAMENTO (IndexedDB + fallback localStorage) — movido para
//  db-indexeddb.js (Fase B da modularização)
// ====================================================================

// Override de dbPut/dbDelete (sync automático) movido para
// sync-queue.js (Fase B da modularização)

// ====================================================================
//  ESTADO GLOBAL — movido para core-state.js (Fase B da modularização)
// ====================================================================
// PROF_DEFAULT e SERVICOS_DEFAULT movidos para core-constants.js
// dbClear movido para db-indexeddb.js (Fase B da modularização)

// ====================================================================
//  DETEÇÃO DE TROCA DE SALÃO
//  CORREÇÃO (bug confirmado): esta verificação TEM de correr antes de
//  sincronizarConfigDoServidor(), porque essa função chama saveConfig(),
//  que sobrescreve a MESMA chave de cache 'salaoId' com o novo salão.
//  Se a deteção só acontecer dentro de loadState() (como antes), a cache
//  já foi reescrita e a comparação nunca acusa troca — os dados do salão
//  anterior (e a fila de sync) nunca são limpos. Por isso este helper é
//  chamado em checkSession()/login ANTES de sincronizarConfigDoServidor().
// ====================================================================
async function detetarTrocaDeSalao(novoSalaoId) {
  const configs = await dbGetAll('config');
  const salaoIdCache = configs.find(c => c.key === 'salaoId');
  const anterior = salaoIdCache ? salaoIdCache.value : null;
  return !!(anterior && novoSalaoId && anterior !== novoSalaoId);
}

async function loadState(trocouDeSalao = false) {
  const configs = await dbGetAll('config');

  const cfg = configs.find(c => c.key === 'storeName');
  const fund = configs.find(c => c.key === 'fundo');
  const plano = configs.find(c => c.key === 'plano');
  const trialInicio = configs.find(c => c.key === 'trialInicio');
  state.config.storeName = cfg ? cfg.value : 'Glamour Beauty';
  state.config.fundo = fund ? Number(fund.value) : 50000;
  state.config.plano = plano ? plano.value : 'trial';
  state.config.trialInicio = trialInicio ? trialInicio.value : null;
  // state.config.salaoId NUNCA é sobreposto aqui — já foi definido
  // corretamente a partir do profile.salao_id antes de loadState() ser
  // chamado (ver checkSession/login). trocouDeSalao agora é recebido
  // como parâmetro, já calculado ANTES da cache ser sobrescrita.

  let clientes, agendamentos, movimentos, profs, servicos;
  if (trocouDeSalao) {
    // Este dispositivo já teve dados de OUTRO salão gravados localmente.
    // Limpar tudo antes de continuar, para nunca misturar clientes/
    // agendamentos/movimentos/profissionais/serviços entre salões.
    await Promise.all(['clientes', 'agendamentos', 'movimentos', 'profissionais', 'servicos'].map(dbClear));
    // Limpar também a fila de sincronização para não enviar dados do salão antigo
    localStorage.removeItem(SYNC_QUEUE_KEY);
    clientes = []; agendamentos = []; movimentos = []; profs = []; servicos = [];
    console.warn('[BeautyPro] Troca de salão detetada neste dispositivo — dados locais e fila de sync foram limpos.');
  } else {
    // Buscar dados apenas se NÃO houve troca de salão
    const [clientesData, agendamentosData, movimentosData, profsData, servicosData] = await Promise.all([
      dbGetAll('clientes'),
      dbGetAll('agendamentos'),
      dbGetAll('movimentos'),
      dbGetAll('profissionais'),
      dbGetAll('servicos'),
    ]);
    clientes = clientesData;
    agendamentos = agendamentosData;
    movimentos = movimentosData;
    profs = profsData;
    servicos = servicosData;
  }

  // ============================================================
  // SANITIZAÇÃO: GARANTIR QUE TUDO É ARRAY (previne undefined)
  // ============================================================
  const safe = (arr) => Array.isArray(arr) ? arr : [];
  const safeClientes = safe(clientes);
  const safeAgendamentos = safe(agendamentos);
  const safeMovimentos = safe(movimentos);
  const safeProfs = safe(profs);
  const safeServicos = safe(servicos);

  // CORREÇÃO (causa-raiz do 403 em profissionais/serviços): PROF_DEFAULT
  // e SERVICOS_DEFAULT em core-constants.js têm IDs fixos, iguais para
  // TODOS os salões. O primeiro salão a sincronizar "ganha" essas linhas
  // no Supabase; qualquer salão seguinte tenta um upsert com o mesmo id
  // e salao_id diferente — a RLS bloqueia (403), porque a linha já
  // pertence a outro salão. Geramos um id novo por salão aqui, uma única
  // vez, e usamos o MESMO valor tanto no state em memória como no que é
  // gravado/sincronizado — nunca os IDs fixos da constante diretamente.
  const profsPadraoComIdProprio = PROF_DEFAULT.map(p => ({ ...p, id: uuid() }));
  const servicosPadraoComIdProprio = SERVICOS_DEFAULT.map(s => ({ ...s, id: uuid() }));

  state.clientes = safeClientes;
  state.agendamentos = safeAgendamentos;
  state.movimentos = safeMovimentos;
  state.profissionais = safeProfs.length ? safeProfs : profsPadraoComIdProprio;
  state.servicos = safeServicos.length ? safeServicos : servicosPadraoComIdProprio;

  const chartPeriodo = localStorage.getItem('bp_chart_periodo') || 'semana';
  const chartOffset = parseInt(localStorage.getItem('bp_chart_offset')) || 0;
  const chartMostrarValores = localStorage.getItem('bp_chart_mostrar_valores') === 'true';
  const filtroClientes = localStorage.getItem('bp_filtro_clientes') || 'todos';
  state.filtroClientes = filtroClientes;
  state.chartPeriodo = chartPeriodo;
  state.chartOffset = chartOffset;
  state.chartMostrarValores = chartMostrarValores;

  if (!state.config.trialInicio) {
    state.config.trialInicio = hoje();
    state.config.plano = 'trial';
    await dbPut('config', { id: 'trialInicio', key: 'trialInicio', value: state.config.trialInicio });
    await dbPut('config', { id: 'plano', key: 'plano', value: 'trial' });
  }
  if (safeProfs.length === 0) { for (const p of profsPadraoComIdProprio) await dbPut('profissionais', p); }
  if (safeServicos.length === 0) { for (const s of servicosPadraoComIdProprio) await dbPut('servicos', s); }

  if (state.config.salaoId && navigator.onLine) {
    await garantirSalaoRemoto();
    const carregouRemoto = await carregarDoSupabase();
    if (carregouRemoto) await flushSyncQueue();
  }

  updateUI();
}
// sincronizarConfigDoServidor movido para auth-supabase.js (Fase B da modularização)

async function saveConfig() {
  await dbPut('config', { id: 'storeName', key: 'storeName', value: state.config.storeName });
  await dbPut('config', { id: 'fundo', key: 'fundo', value: state.config.fundo });
  await dbPut('config', { id: 'plano', key: 'plano', value: state.config.plano });
  await dbPut('config', { id: 'trialInicio', key: 'trialInicio', value: state.config.trialInicio });
  if (state.config.salaoId) {
    await dbPut('config', { id: 'salaoId', key: 'salaoId', value: state.config.salaoId });
  }
}

// ====================================================================
//  CRUD FUNCTIONS (preservadas do original)
// ====================================================================
async function addCliente(c) {
  if (!verificarLimite('clientes')) return null;
  const n = { ...c, id: uuid() };
  await dbPut('clientes', n);
  state.clientes.push(n);
  updateUI();
  return n;
}
async function updateCliente(id, data) {
  const i = state.clientes.findIndex(c => c.id === id);
  if (i === -1) return;
  state.clientes[i] = { ...state.clientes[i], ...data };
  await dbPut('clientes', state.clientes[i]);
  updateUI();
}

async function addAgendamento(ag) {
  const dtStr = ag.data + 'T' + (ag.hora || '00:00') + ':00';
  const agDatetime = new Date(dtStr);
  const agora = new Date();
  if (agDatetime < agora) {
    toast('Não é possível agendar para datas ou horários passados.', 'error');
    return null;
  }
  if (!verificarLimite('agendamentos')) return null;
  const n = {
    ...ag,
    id: uuid(),
    data: ag.data || hoje(),
    hora: ag.hora || horaAgora(),
    status: 'agendado',
    profissional_id: ag.profissional_id || null,
    profissional: ag.profissional || ''
  };
  await dbPut('agendamentos', n);
  state.agendamentos.push(n);
  updateUI();
  return n;
}

async function updateAgendamento(id, data) {
  const i = state.agendamentos.findIndex(a => a.id === id);
  if (i === -1) return;
  state.agendamentos[i] = { ...state.agendamentos[i], ...data };
  await dbPut('agendamentos', state.agendamentos[i]);
  updateUI();
}

async function deleteAgendamento(id) {
  await dbDelete('agendamentos', id);
  state.agendamentos = state.agendamentos.filter(a => a.id !== id);
  updateUI();
}

async function addProfissional(p) {
  if (!verificarLimite('profissionais')) return null;
  const n = { ...p, id: uuid() };
  await dbPut('profissionais', n);
  state.profissionais.push(n);
  updateUI();
  return n;
}

async function updateProfissional(id, data) {
  const i = state.profissionais.findIndex(p => p.id === id);
  if (i === -1) return;
  state.profissionais[i] = { ...state.profissionais[i], ...data };
  await dbPut('profissionais', state.profissionais[i]);
  updateUI();
}

async function deleteProfissional(id) {
  await dbDelete('profissionais', id);
  state.profissionais = state.profissionais.filter(p => p.id !== id);
  updateUI();
}

async function deleteCliente(id) {
  await dbDelete('clientes', id);
  state.clientes = state.clientes.filter(c => c.id !== id);
  updateUI();
}

async function addServico(s) {
  const n = { ...s, id: uuid() };
  await dbPut('servicos', n);
  state.servicos.push(n);
  updateUI();
  return n;
}

async function updateServico(id, data) {
  const i = state.servicos.findIndex(s => s.id === id);
  if (i === -1) return;
  state.servicos[i] = { ...state.servicos[i], ...data };
  await dbPut('servicos', state.servicos[i]);
  updateUI();
}

async function deleteServico(id) {
  await dbDelete('servicos', id);
  state.servicos = state.servicos.filter(s => s.id !== id);
  updateUI();
}

function getServicoById(id) {
  return state.servicos.find(s => s.id === id);
}

function getServicoByNome(nome) {
  return state.servicos.find(s => s.nome === nome);
}

function getProfissionaisPorServico(nomeServico) {
  const servico = state.servicos.find(s => s.nome === nomeServico);
  if (servico && servico.profissionais && servico.profissionais.length > 0) {
    return servico.profissionais;
  }
  return state.profissionais.map(p => p.nome);
}

async function registarVenda(dados) {
  // Validação de cliente obrigatório
  if (!dados.cliente || dados.cliente.trim() === '') {
    toast('Selecione ou crie um cliente antes de registar a venda.', 'error');
    return null;
  }

  const total = dados.itens.reduce((acc, i) => acc + i.subtotal, 0);
  const descricao = dados.itens.map(i => i.nome).join(', ');
  const id = uuid();
  const mov = {
    id,
    tipo: 'venda',
    descricao,
    valor: total,
    cliente: dados.cliente,
    profissional_id: dados.profissional_id || null,
    profissional: dados.profissional || 'Não atribuído',
    itens: dados.itens,
    metodoPagamento: dados.metodoPagamento || 'Numerário',
    data: hoje(),
    hora: horaAgora(),
    reciboNum: nextReciboNum(),
  };
  await dbPut('movimentos', mov);
  state.movimentos.push(mov);
  updateUI();
  return id;
}

async function addMovimento(mov) {
  const n = { ...mov, id: uuid(), data: hoje(), hora: horaAgora() };
  await dbPut('movimentos', n);
  state.movimentos.push(n);
  updateUI();
  return n;
}

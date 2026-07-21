// ====================================================================
//  CORE — ESTADO GLOBAL (extraído do app.js na Fase B da modularização)
// ====================================================================
let state = {
  config: { storeName: 'Glamour Beauty', fundo: 50000, plano: 'trial', trialInicio: null, salaoId: null },
  clientes: [],
  agendamentos: [],
  movimentos: [],
  profissionais: [],
  servicos: [],
  agendaDataAtual: hoje(),
  histPeriodo: 'hoje',
  carrinho: [],
  filtroClientes: 'todos',
  chartPeriodo: 'semana',
  chartOffset: 0,
  chartMostrarValores: false,
};

// ✅ Ponto 4 — restaura a última aba visitada neste dispositivo; a troca
// visual (classes .active nos tab-pane/nav-item) é reaplicada em
// ui-events-navegacao.js depois do primeiro loadState(), ver ativarAbaAtiva().
let activeTab = localStorage.getItem('bp_active_tab') || 'dashboard';

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
  fechos_caixa: [],
  agendaDataAtual: hoje(),
  histPeriodo: 'hoje',
  carrinho: [],
  filtroClientes: 'todos',
  chartPeriodo: 'semana',
  chartOffset: 0,
  chartMostrarValores: false,
  
  // ============================================================
  //  FILTRO DO DASHBOARD (discreto, via ícone + Bottom Sheet)
  //  - dashPeriodo: 'dia', 'semana', '7dias', 'mes', '30dias', 'ano', 'custom'
  //  - dashOffset: deslocamento para trás (0 = atual, 1 = anterior, etc.)
  //  - dashCustomInicio/Fim: datas personalizadas (YYYY-MM-DD)
  // ============================================================
  dashPeriodo: localStorage.getItem('bp_dash_periodo') || 'dia',
  dashOffset: parseInt(localStorage.getItem('bp_dash_offset')) || 0,
  dashCustomInicio: localStorage.getItem('bp_dash_custom_inicio') || null,
  dashCustomFim: localStorage.getItem('bp_dash_custom_fim') || null,
};

// ✅ Ponto 4 — restaura a última aba visitada neste dispositivo; a troca
// visual (classes .active nos tab-pane/nav-item) é reaplicada em
// ui-events-navegacao.js depois do primeiro loadState(), ver ativarAbaAtiva().
let activeTab = localStorage.getItem('bp_active_tab') || 'dashboard';
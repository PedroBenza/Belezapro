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

let activeTab = 'dashboard';

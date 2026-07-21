// ====================================================================
//  ui-render-dashboard-agenda.js — extraído do app.js (Fase C da modularização)
//  Conteúdo: Renderização do Resumo (dashboard) e Agenda
//  Linhas originais: 383-610
//  Carregar depois de core-*.js, db-indexeddb.js, sync-*.js, auth-supabase.js
// ====================================================================

// ------------------------------------------------------------
//  AUXILIAR: busca nome do profissional a partir do ID
// ------------------------------------------------------------
function getProfissionalNome(profissionalId) {
  if (!profissionalId) return 'Não atribuído';
  const prof = state.profissionais.find(p => p.id === profissionalId);
  return prof ? prof.nome : 'Não atribuído';
}

// ====================================================================
//  RENDERIZAÇÃO
// ====================================================================
function updateUI() {
  renderDashboard();
  if (activeTab === 'agenda') renderAgendaFull();
  if (activeTab === 'clientes') renderClientes();
  if (activeTab === 'caixa') renderCaixa();
  if (activeTab === 'equipa') { renderProfissionais(); renderServicos(); }
  renderBadges();
  renderPlanoInfo();
  // Só renderiza o gráfico se estiver no Dashboard
  if (activeTab === 'dashboard') renderizarGrafico();
  populateVendaSelects();
  populateAgendaSelects();
  setupPrecoAutomatico('agenda-servico', 'agenda-preco');
  setupPrecoAutomatico('ci-servico-sel', 'ci-valor');
  initChartControls();
  aplicarAcessibilidade();

  const storeDisplay = document.getElementById('store-name-display');
  if (storeDisplay && state.config.storeName) {
    storeDisplay.textContent = state.config.storeName;
    // REMOVIDO o salao_id do title (segurança)
    storeDisplay.title = 'Duplo clique para gerir profissionais';
  }

  atualizarVisibilidadeAtalhos();
}
function atualizarVisibilidadeAtalhos() {
  const fabEl = document.getElementById('fab-agendar');
  if (fabEl) {
    fabEl.style.display = (activeTab === 'dashboard' || activeTab === 'agenda') ? 'flex' : 'none';
  }
  const bannerEl = document.getElementById('nova-venda-hero-btn');
  if (bannerEl) {
    bannerEl.style.display = (activeTab === 'dashboard' || activeTab === 'caixa') ? 'flex' : 'none';
  }
}

function renderPlanoInfo() {
  const plano = getPlanoAtual();
  const info = PLANOS[plano];
  const badge = document.getElementById('plano-badge');
  const label = plano === 'trial' ? 'Plano Gratuito' : info.label.toUpperCase();
  badge.textContent = label;
  badge.className = 'plano-badge ' + info.badgeClass;
  const countdown = document.getElementById('trial-countdown');
  if (plano === 'trial' && isTrialAtivo()) {
    const dias = getDiasTrialRestantes();
    countdown.style.display = 'inline-block';
    countdown.textContent = `⏳ Restam ${dias} dias`;
    countdown.style.color = '';
  } else if (plano === 'trial' && !isTrialAtivo()) {
    countdown.style.display = 'inline-block';
    countdown.textContent = '⚠️ Trial expirado';
    countdown.style.color = '#B33A4A';
  } else {
    countdown.style.display = 'none';
    countdown.style.color = '';
  }
  const iaInfo = document.getElementById('ia-plano-info');
  if (iaInfo) {
    const limite = info.iaDia;
    iaInfo.textContent = limite > 0 ? `${info.label}: ${limite} perguntas/dia` : 'IA não disponível neste plano';
  }
  const cont = document.getElementById('ia-contador');
  if (cont) cont.textContent = parseInt(localStorage.getItem('ia_perguntas_' + hoje()) || '0');
}
function renderDashboard() {
  const hojeStr = hoje();
  const agHoje = state.agendamentos.filter(a => a.data === hojeStr);
  const vendasHoje = state.movimentos.filter(m => m.data === hojeStr && m.tipo === 'venda');
  const totalRev = vendasHoje.reduce((s, v) => s + v.valor, 0);
  const totalVendas = vendasHoje.length;
  const ticket = totalVendas > 0 ? totalRev / totalVendas : 0;
  const realizados = agHoje.filter(a => a.status === 'realizado').length;
  const clientesUnicos = new Set(vendasHoje.map(m => m.cliente)).size;

  animateKpi('kpi-revenue', fmtKz(totalRev));
  document.getElementById('kpi-revenue-count').textContent = totalVendas + ' serviços';
  animateKpi('kpi-agendamentos', String(agHoje.length));
  document.getElementById('kpi-agendamentos-status').textContent = realizados + ' realizados';
  // Atualiza o valor principal
animateKpi('kpi-ticket', fmtKz(ticket));

// Atualiza o subtítulo (fixo)
document.getElementById('kpi-ticket-sub').textContent = 'por cliente';

// --- Sparkline (últimos 7 dias) ---
const ultimos7Dias = [];
for (let i = 6; i >= 0; i--) {
  const d = new Date();
  d.setDate(d.getDate() - i);
  const ds = d.toISOString().split('T')[0];
  const vendasDia = state.movimentos.filter(m => m.data === ds && m.tipo === 'venda');
  const totalDia = vendasDia.reduce((s, v) => s + v.valor, 0);
  const qtdDia = vendasDia.length;
  const ticketDia = qtdDia > 0 ? totalDia / qtdDia : 0;
  ultimos7Dias.push(ticketDia);
}

// Desenha o sparkline
desenharSparkline('ticket-sparkline', ultimos7Dias, '#D4AF37');

// Calcula a variação
const primeiro = ultimos7Dias[0] || 0;
const ultimo = ultimos7Dias[ultimos7Dias.length - 1] || 0;
let variacao = 0;
if (primeiro > 0) {
  variacao = ((ultimo - primeiro) / primeiro) * 100;
}
const subiu = variacao >= 0;
const sinal = subiu ? '↑' : '↓';
const percentEl = document.getElementById('ticket-trend-percent');
if (percentEl) {
  percentEl.className = subiu ? 'trend-up' : 'trend-down'; // CORREÇÃO: classe agora acompanha a direção real (antes ficava sempre "trend-up")
  percentEl.innerHTML = `<span class="trend-arrow">${sinal}</span> ${Math.abs(Math.round(variacao))}%`;
}
document.getElementById('ticket-trend-period').textContent = 'Últimos 7 dias';

  const proximos = agHoje.filter(a => a.status !== 'realizado').sort((a, b) => a.hora.localeCompare(b.hora)).slice(0, 4);
  const cont = document.getElementById('agenda-today-list');
  if (proximos.length === 0) {
    cont.innerHTML =
      `<div class="empty-state"><p>${agHoje.length === 0 ? 'Nenhum atendimento hoje' : 'Todos os atendimentos realizados ✅'}</p></div>`;
  } else {
    cont.innerHTML = proximos.map(a => {
      const nomeProf = getProfissionalNome(a.profissional_id);
      return `
        <div class="list-item">
          <div class="avatar">${a.cliente.charAt(0).toUpperCase()}</div>
          <div class="info">
            <div class="title" style="color:var(--gold-dark);font-weight:700;">${escHtml(a.servico)}</div>
            <div class="sub">👤 ${escHtml(a.cliente)} · ${a.hora} · ${escHtml(nomeProf)}</div>
          </div>
          <div class="action" style="display:flex;flex-direction:column;align-items:flex-end;gap:4px;">
            <span style="display:inline-flex;align-items:center;gap:3px;padding:2px 10px;border-radius:4px;font-size:.6rem;font-weight:700;background:#FEF6E0;color:#A7872B;">⏳ Pendente</span>
            <span style="font-weight:700;font-size:.8rem;">${fmtKz(a.preco)}</span>
          </div>
        </div>
      `;
    }).join('');
  }
  document.getElementById('agenda-count').textContent = proximos.length + ' pendentes';

  document.getElementById('today-date').textContent = '📅 ' + new Date().toLocaleDateString('pt-AO', { day: '2-digit',
    month: 'long', year: 'numeric' });
  const h = new Date().getHours();
  document.getElementById('greeting').textContent = h < 12 ? 'Bom dia ☀️' : h < 18 ? 'Boa tarde 🌤️' : 'Boa noite 🌙';
}

function renderAgendaFull() {
  const cont = document.getElementById('agenda-full-list');
  if (!state.agendamentos || !Array.isArray(state.agendamentos)) {
    if (cont) cont.innerHTML = '<div class="empty-state">A carregar agendamentos...</div>';
    return;
  }
  const data = state.agendaDataAtual || hoje();
  const ags = state.agendamentos.filter(a => a.data === data).sort((a, b) => a.hora.localeCompare(b.hora));
  const label = document.getElementById('agenda-date-label');
  if (!cont || !label) return;

  label.textContent = data === hoje() ? 'Hoje' : new Date(data + 'T00:00:00').toLocaleDateString('pt-AO', { day: '2-digit',
    month: 'short' });

  if (ags.length === 0) {
    cont.innerHTML = `<div class="empty-state">${svgCalendario}<p>Sem agendamentos para este dia</p></div>`;
    return;
  }
cont.innerHTML = ags.map(a => {
  const isRealizado = a.status === 'realizado';
  const nomeProf = getProfissionalNome(a.profissional_id);
  return `
    <div class="timeline-item">
      <div class="time">${a.hora}</div>
      <div class="event">
        <div class="service">${escHtml(a.servico)}</div>
        <div class="client">👤 ${escHtml(a.cliente)}</div>
        <div class="meta">
          <span>👤 ${escHtml(nomeProf)}</span>
          <span class="pill" style="font-weight:700;">${fmtKz(a.preco)}</span>
          <span class="pill ${isRealizado ? 'gray' : 'green'}">${isRealizado ? '✅ Realizado' : '📅 Agendado'}</span>
          ${!isRealizado ? `<button class="btn btn-sm btn-success" data-id="${a.id}" data-action="finalizar">✅ Finalizar</button>` : ''}
          ${!isRealizado ? `<button class="btn btn-sm btn-secondary" data-id="${a.id}" data-action="cancelar-agenda" data-role="admin,gerente" style="padding:4px 12px;font-size:.7rem;color:var(--text-muted);" aria-label="Cancelar agendamento">✕</button>` : ''}
        </div>
      </div>
    </div>
  `;
}).join('');

// Listener para os botões "Finalizar"
cont.querySelectorAll('[data-action="finalizar"]').forEach(btn => {
  btn.addEventListener('click', function() {
    const id = this.dataset.id;
    if (id) abrirFinalizarAtendimento(id);
  });
});
} // fim de renderAgendaFull() — chaveta que faltava (causava SyntaxError e impedia app.js de carregar)

// Abre o modal de finalização de atendimento, preenchendo os dados do agendamento selecionado
function abrirFinalizarAtendimento(id) {
  const ag = state.agendamentos.find(a => a.id === id);
  if (!ag) return;
  const nomeProf = getProfissionalNome(ag.profissional_id);
  document.getElementById('finalizar-ag-id').value = ag.id;
  document.getElementById('finalizar-info').innerHTML =
    `<strong>${escHtml(ag.servico)}</strong><br>👤 ${escHtml(ag.cliente)} · ${ag.hora} · ${escHtml(nomeProf)} · ${fmtKz(ag.preco)}`;
  document.getElementById('finalizar-pagamento').value = 'Numerário';
  openModal('modal-finalizar');
}

function mudarAgenda(delta) {
  const atual = new Date(state.agendaDataAtual || hoje());
  atual.setDate(atual.getDate() + delta);
  state.agendaDataAtual = atual.toISOString().split('T')[0];
  renderAgendaFull();
}

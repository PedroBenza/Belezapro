// ====================================================================
//  ui-render-dashboard-agenda.js — extraído do app.js (Fase C da modularização)
//  #modal-confirm .confirm-icon {: Renderização do Resumo (dashboard) e Agenda
//  Linhas originais: 383-610
//  Carregar depois de core-*.js, db-indexeddb.js, sync-*.js, auth-supabase.js
//  CORREÇÕES APLICADAS:
//    - Filtro discreto com ícone + popover flutuante (substitui barra "Período")
//    - Persistência no localStorage
//    - Removidas percentagens comparativas dos KPIs
//    - Sparkline mantida com chamada externa (desenharSparkline)
//    - Percentagem do Ticket Médio: restaurada com o estilo modal original (classe trend-up/down)
//    - Label do período dinâmica e inteligente (exibe "Ontem" quando filtro for dia com offset 1)
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
  if (cont) {
    const info = PLANOS[getPlanoAtual()];
    if (info.iaDia === 0) {
      cont.textContent = '0';
    } else {
      const chave = 'ia_perguntas_' + (state.config.salaoId || 'local') + '_' + hoje();
      cont.textContent = parseInt(localStorage.getItem(chave) || '0');
    }
  }
}

// ====================================================================
//  FILTRO INTELIGENTE DO DASHBOARD — motor de cálculo de intervalos
// ====================================================================
function formatarDataISO(d) {
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}
function formatarDataCurta(iso) {
  return new Date(iso + 'T00:00:00').toLocaleDateString('pt-AO', { day: '2-digit', month: 'short' });
}

function calcularIntervaloPeriodo(tipo, offset) {
  const base = new Date(hoje() + 'T00:00:00');
  let inicio, fim, label;

  if (tipo === 'custom') {
    inicio = state.dashCustomInicio || hoje();
    fim = state.dashCustomFim || hoje();
    label = 'Personalizado';
  } else if (tipo === 'semana') {
    const diaSemana = (base.getDay() + 6) % 7;
    const segunda = new Date(base);
    segunda.setDate(segunda.getDate() - diaSemana - offset * 7);
    const domingo = new Date(segunda);
    domingo.setDate(domingo.getDate() + 6);
    inicio = formatarDataISO(segunda);
    fim = formatarDataISO(domingo);
    label = offset === 0 ? 'Esta semana' : 'Semana de ' + formatarDataCurta(inicio);
  } else if (tipo === '7dias') {
    const fimD = new Date(base);
    fimD.setDate(fimD.getDate() - offset * 7);
    const iniD = new Date(fimD);
    iniD.setDate(iniD.getDate() - 6);
    inicio = formatarDataISO(iniD);
    fim = formatarDataISO(fimD);
    label = 'Últimos 7 dias';
  } else if (tipo === 'mes') {
    const ano = base.getFullYear();
    const mes = base.getMonth() - offset;
    const primeiro = new Date(ano, mes, 1);
    const ultimo = new Date(ano, mes + 1, 0);
    inicio = formatarDataISO(primeiro);
    fim = formatarDataISO(ultimo);
    label = offset === 0 ? 'Este mês' : 'Mês anterior';
  } else if (tipo === '30dias') {
    const fimD = new Date(base);
    fimD.setDate(fimD.getDate() - offset * 30);
    const iniD = new Date(fimD);
    iniD.setDate(iniD.getDate() - 29);
    inicio = formatarDataISO(iniD);
    fim = formatarDataISO(fimD);
    label = 'Últimos 30 dias';
  } else if (tipo === 'ano') {
    const ano = base.getFullYear() - offset;
    inicio = ano + '-01-01';
    fim = ano + '-12-31';
    label = offset === 0 ? 'Este ano' : String(ano);
  } else {
    // tipo === 'dia'
    const d = new Date(base);
    d.setDate(d.getDate() - offset);
    const iso = formatarDataISO(d);
    inicio = fim = iso;
    if (offset === 0) label = 'Hoje';
    else if (offset === 1) label = 'Ontem';
    else label = formatarDataCurta(iso);
  }
  return { inicio, fim, label };
}

function getIntervaloDashAtual() {
  return calcularIntervaloPeriodo(state.dashPeriodo, state.dashOffset);
}

// ====================================================================
//  RENDER DASHBOARD (mantém sparkline funcional)
// ====================================================================
function renderDashboard() {
  const intervalo = getIntervaloDashAtual();
  const agPeriodo = state.agendamentos.filter(a => a.data >= intervalo.inicio && a.data <= intervalo.fim);
  const vendasPeriodo = state.movimentos.filter(m => m.data >= intervalo.inicio && m.data <= intervalo.fim && m.tipo === 'venda');
  const totalRev = vendasPeriodo.reduce((s, v) => s + v.valor, 0);
  const totalVendas = vendasPeriodo.length;
  const ticket = totalVendas > 0 ? totalRev / totalVendas : 0;
  const realizados = agPeriodo.filter(a => a.status === 'realizado').length;

  // Atualizar label do período
  const todayEl = document.getElementById('today-date');
  if (todayEl) todayEl.textContent = intervalo.label;

  // Atualizar KPIs (sem percentagens de comparativo)
  animateKpi('kpi-revenue', fmtKz(totalRev));
  const revenueCount = document.getElementById('kpi-revenue-count');
  if (revenueCount) revenueCount.textContent = totalVendas + ' serviços';

  animateKpi('kpi-agendamentos', String(agPeriodo.length));
  const agStatus = document.getElementById('kpi-agendamentos-status');
  if (agStatus) agStatus.textContent = realizados + ' realizados';

  animateKpi('kpi-ticket', fmtKz(ticket));
  const ticketSub = document.getElementById('kpi-ticket-sub');
  if (ticketSub) ticketSub.textContent = 'por cliente';

// --- Sparkline (últimos 7 dias do período filtrado) ---
const ultimos7Dias = [];
const fimPeriodo = new Date(intervalo.fim + 'T00:00:00');
for (let i = 6; i >= 0; i--) {
  const d = new Date(fimPeriodo);
  d.setDate(d.getDate() - i);
  const ds = d.toISOString().split('T')[0];
  const vendasDia = state.movimentos.filter(m => m.data === ds && m.tipo === 'venda');
  const totalDia = vendasDia.reduce((s, v) => s + v.valor, 0);
  const qtdDia = vendasDia.length;
  const ticketDia = qtdDia > 0 ? totalDia / qtdDia : 0;
  ultimos7Dias.push(ticketDia);
}

// Desenha a sparkline (usando a função externa, que está a funcionar)
if (typeof desenharSparkline === 'function') {
  desenharSparkline('ticket-sparkline', ultimos7Dias, '#D4AF37');
} else {
  // Fallback simples (nunca deve acontecer, pois a função existe)
  const canvas = document.getElementById('ticket-sparkline');
  if (canvas) {
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.beginPath();
    ctx.moveTo(0, canvas.height - 4);
    ctx.lineTo(canvas.width, canvas.height - 4);
    ctx.strokeStyle = '#D4AF37';
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }
}

  // ============================================================
  // PERCENTAGEM DO TICKET MÉDIO (com modal restaurado)
  // ============================================================
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
    percentEl.className = subiu ? 'trend-up' : 'trend-down';
    percentEl.innerHTML = `<span class="trend-arrow">${sinal}</span> ${Math.abs(Math.round(variacao))}%`;
    percentEl.style.display = '';
  }

  // ============================================================
  // LABEL DO PERÍODO (inteligente e interativo)
  // ============================================================
  let periodLabel = '';
  if (state.dashPeriodo === 'dia') {
    if (state.dashOffset === 0) periodLabel = 'Hoje';
    else if (state.dashOffset === 1) periodLabel = 'Ontem';
    else periodLabel = formatarDataCurta(intervalo.inicio);
  } else if (state.dashPeriodo === 'semana') {
    periodLabel = state.dashOffset === 0 ? 'Esta semana' : `Semana de ${formatarDataCurta(intervalo.inicio)}`;
  } else if (state.dashPeriodo === '7dias') {
    periodLabel = 'Últimos 7 dias';
  } else if (state.dashPeriodo === 'mes') {
    periodLabel = state.dashOffset === 0 ? 'Este mês' : 'Mês anterior';
  } else if (state.dashPeriodo === '30dias') {
    periodLabel = 'Últimos 30 dias';
  } else if (state.dashPeriodo === 'ano') {
    periodLabel = state.dashOffset === 0 ? 'Este ano' : String(intervalo.inicio.split('-')[0]);
  } else if (state.dashPeriodo === 'custom') {
    periodLabel = 'Personalizado';
  } else {
    periodLabel = 'Últimos 7 dias';
  }
  const trendPeriodEl = document.getElementById('ticket-trend-period');
  if (trendPeriodEl) trendPeriodEl.textContent = periodLabel;

  // Próximos atendimentos
  const proximos = agPeriodo
    .filter(a => a.status !== 'realizado')
    .sort((a, b) => (a.data + 'T' + a.hora).localeCompare(b.data + 'T' + b.hora))
    .slice(0, 4);
  const cont = document.getElementById('agenda-today-list');
  const mostraDataCompleta = intervalo.inicio !== intervalo.fim;
  if (proximos.length === 0) {
    cont.innerHTML = `<div class="empty-state"><p>${agPeriodo.length === 0 ? 'Nenhum atendimento neste período' : 'Todos os atendimentos realizados ✅'}</p></div>`;
  } else {
    cont.innerHTML = proximos.map(a => {
      const nomeProf = getProfissionalNome(a.profissional_id);
      const quando = mostraDataCompleta ? (formatarDataCurta(a.data) + ' · ' + a.hora) : a.hora;
      return `
        <div class="list-item">
          <div class="avatar">${a.cliente.charAt(0).toUpperCase()}</div>
          <div class="info">
            <div class="title" style="color:var(--gold-dark);font-weight:700;">${escHtml(a.servico)}</div>
            <div class="sub">👤 ${escHtml(a.cliente)} · ${quando} · ${escHtml(nomeProf)}</div>
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

  // Saudação
  const h = new Date().getHours();
  document.getElementById('greeting').textContent = h < 12 ? 'Bom dia ☀️' : h < 18 ? 'Boa tarde 🌤️' : 'Boa noite 🌙';
}

// ====================================================================
//  AGENDA
// ====================================================================
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

  label.textContent = data === hoje() ? 'Hoje' : new Date(data + 'T00:00:00').toLocaleDateString('pt-AO', { day: '2-digit', month: 'short' });

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

  cont.querySelectorAll('[data-action="finalizar"]').forEach(btn => {
    btn.addEventListener('click', function() {
      const id = this.dataset.id;
      if (id) abrirFinalizarAtendimento(id);
    });
  });
}

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

// ====================================================================
//  EVENTOS — Filtro Inteligente do Dashboard (Popover flutuante)
// ====================================================================

// Abrir/fechar o popover ao clicar no ícone de filtro
document.getElementById('dash-filter-icon').addEventListener('click', function(e) {
  e.stopPropagation();
  const modal = document.getElementById('modal-periodo-dashboard');
  if (!modal) return;

  const isOpen = modal.classList.contains('open');
  if (isOpen) {
    modal.classList.remove('open');
    return;
  }

  document.querySelectorAll('.dash-periodo-opcao').forEach(btn => {
    const tipo = btn.dataset.periodo;
    const offset = Number(btn.dataset.offset) || 0;
    const ativa = (tipo === state.dashPeriodo && offset === state.dashOffset) ||
                  (tipo === 'custom' && state.dashPeriodo === 'custom');
    btn.classList.toggle('active', ativa);
  });

  const customWrap = document.getElementById('dash-periodo-custom');
  if (customWrap) customWrap.style.display = state.dashPeriodo === 'custom' ? 'flex' : 'none';
  if (state.dashPeriodo === 'custom') {
    const iniInput = document.getElementById('dash-custom-inicio');
    const fimInput = document.getElementById('dash-custom-fim');
    if (iniInput) iniInput.value = state.dashCustomInicio || hoje();
    if (fimInput) fimInput.value = state.dashCustomFim || hoje();
  }

  modal.classList.add('open');
});

// Fechar popover ao clicar fora
document.addEventListener('click', function(e) {
  const modal = document.getElementById('modal-periodo-dashboard');
  const btn = document.getElementById('dash-filter-icon');
  if (modal && modal.classList.contains('open')) {
    if (!modal.contains(e.target) && e.target !== btn) {
      modal.classList.remove('open');
    }
  }
});

// Opções do popover
document.querySelectorAll('.dash-periodo-opcao').forEach(btn => {
  btn.addEventListener('click', function(e) {
    e.stopPropagation();
    const tipo = this.dataset.periodo;
    if (tipo === 'custom') {
      document.querySelectorAll('.dash-periodo-opcao').forEach(b => b.classList.remove('active'));
      this.classList.add('active');
      const customWrap = document.getElementById('dash-periodo-custom');
      if (customWrap) customWrap.style.display = 'flex';
      const iniInput = document.getElementById('dash-custom-inicio');
      const fimInput = document.getElementById('dash-custom-fim');
      if (iniInput) iniInput.value = state.dashCustomInicio || hoje();
      if (fimInput) fimInput.value = state.dashCustomFim || hoje();
      return;
    }
    state.dashPeriodo = tipo;
    state.dashOffset = Number(this.dataset.offset) || 0;
    localStorage.setItem('bp_dash_periodo', state.dashPeriodo);
    localStorage.setItem('bp_dash_offset', String(state.dashOffset));
    document.getElementById('modal-periodo-dashboard').classList.remove('open');
    renderDashboard();
  });
});

// Aplicar custom

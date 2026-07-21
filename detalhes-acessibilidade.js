// ====================================================================
//  detalhes-acessibilidade.js — extraído do app.js (Fase C da modularização)
//  Conteúdo: Modais de detalhe (faturamento, agendamentos, fecho de caixa), acessibilidade/focus trap, estado offline da IA, navegação por abas
//  Linhas originais: 1411-1628
//  Carregar depois de core-*.js, db-indexeddb.js, sync-*.js, auth-supabase.js
// ====================================================================

// ====================================================================
//  KPIS DETALHE
// ====================================================================
function abrirDetalheFaturamento() {
  const list = document.getElementById('revenue-detail-list');
  const totalSpan = document.getElementById('revenue-detail-total');
  if (!state.movimentos || !Array.isArray(state.movimentos)) {
    if (list) list.innerHTML = '<div class="empty-state"><p>A carregar...</p></div>';
    if (totalSpan) totalSpan.textContent = '0 Kz';
    openModal('modal-revenue-detail');
    return;
  }
  const hojeStr = hoje();
  const vendasHoje = state.movimentos.filter(m => m.data === hojeStr && m.tipo === 'venda');
  if (vendasHoje.length === 0) {
    list.innerHTML = '<div class="empty-state"><p>Nenhuma venda hoje</p></div>';
    totalSpan.textContent = '0 Kz';
  } else {
    list.innerHTML = vendasHoje.map(v => `
      <div class="list-item" style="cursor:default;">
        <div class="avatar" style="background:#E6F4EC;color:var(--green);">💰</div>
        <div class="info">
          <div class="title">${escHtml(v.cliente || 'Anónimo')}</div>
          <div class="sub">${escHtml(v.descricao)} · ${v.hora}</div>
        </div>
        <div class="action">${fmtKz(v.valor)}</div>
      </div>
    `).join('');
    const total = vendasHoje.reduce((s, v) => s + v.valor, 0);
    totalSpan.textContent = fmtKz(total);
  }
  openModal('modal-revenue-detail');
}

let agendaDetailFiltro = 'pendentes';

function abrirDetalheAgendamentos(filtro = 'pendentes') {
  agendaDetailFiltro = filtro;
  const list = document.getElementById('agenda-detail-list');
  const btnPend = document.getElementById('agenda-detail-pendentes');
  const btnReal = document.getElementById('agenda-detail-realizados');
  if (!state.agendamentos || !Array.isArray(state.agendamentos)) {
    if (list) list.innerHTML = '<div class="empty-state"><p>A carregar...</p></div>';
    openModal('modal-agenda-detail');
    return;
  }
  const hojeStr = hoje();
  const ags = state.agendamentos.filter(a => a.data === hojeStr);
  if (btnPend) btnPend.className = 'btn btn-sm ' + (filtro === 'pendentes' ? 'btn-primary' : 'btn-secondary');
  if (btnReal) btnReal.className = 'btn btn-sm ' + (filtro === 'realizados' ? 'btn-primary' : 'btn-secondary');
  const filtrados = filtro === 'pendentes' ? ags.filter(a => a.status !== 'realizado') : ags.filter(a => a.status === 'realizado');
  if (filtrados.length === 0) {
    list.innerHTML = `<div class="empty-state"><p>Nenhum agendamento ${filtro === 'pendentes' ? 'pendente' : 'realizado'} hoje</p></div>`;
  } else {
    list.innerHTML = filtrados.map(a => {
      const nomeProf = getProfissionalNome(a.profissional_id);
      return `
        <div class="list-item" style="cursor:default;">
          <div class="avatar" style="background:var(--gold-light);color:var(--gold-dark);">📅</div>
          <div class="info">
            <div class="title" style="color:var(--gold-dark);">${escHtml(a.servico)}</div>
            <div class="sub">👤 ${escHtml(a.cliente)} · ${a.hora} · ${escHtml(nomeProf)}</div>
          </div>
          <div class="action">${fmtKz(a.preco)}</div>
        </div>
      `;
    }).join('');
  }
  openModal('modal-agenda-detail');
}

function abrirFechoCaixa() {
  const hojeStr = hoje();
  const movs = state.movimentos.filter(m => m.data === hojeStr);
  const vendas = movs.filter(m => m.tipo === 'venda');
  const despesas = movs.filter(m => m.tipo === 'despesa');
  const totalVendas = vendas.reduce((s, v) => s + v.valor, 0);
  const totalDespesas = despesas.reduce((s, d) => s + d.valor, 0);
  const saldoFinal = state.config.fundo + totalVendas - totalDespesas;
  const byPag = {};
  vendas.forEach(v => { const k = v.metodoPagamento || 'Numerário';
    byPag[k] = (byPag[k] || 0) + v.valor; });
  const pagHtml = Object.entries(byPag).map(([k, v]) =>
    `<div class="fecho-row"><span class="fr-label">${escHtml(k)}</span><span class="fr-val">${fmtKz(v)}</span></div>`
    ).join('');
  document.getElementById('fecho-conteudo').innerHTML = `
    <div style="font-size:.75rem;font-weight:600;color:var(--text-muted);text-transform:uppercase;letter-spacing:.05em;margin-bottom:8px;">${new Date().toLocaleDateString('pt-AO', { day: '2-digit', month: 'long', year: 'numeric' })}</div>
    <div class="fecho-row"><span class="fr-label">Fundo de abertura</span><span class="fr-val">${fmtKz(state.config.fundo)}</span></div>
    <div class="fecho-row"><span class="fr-label">Total de vendas (${vendas.length})</span><span class="fr-val" style="color:var(--green)">+${fmtKz(totalVendas)}</span></div>
    <div class="fecho-row"><span class="fr-label">Total de despesas (${despesas.length})</span><span class="fr-val" style="color:var(--red)">-${fmtKz(totalDespesas)}</span></div>
    <div style="margin:8px 0 4px;font-size:.7rem;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:var(--text-muted);">Por método de pagamento</div>
    ${pagHtml || '<div class="fecho-row"><span class="fr-label">—</span><span class="fr-val">0 Kz</span></div>'}
    <div class="fecho-row total-row"><span class="fr-label">Saldo Final em Caixa</span><span class="fr-val">${fmtKz(saldoFinal)}</span></div>`;
  openModal('modal-fecho');
}

// ====================================================================
//  ACESSIBILIDADE E FOCUS TRAPPING
// ====================================================================
function aplicarAcessibilidade() {
  document.querySelectorAll('.ci-del').forEach(el => { if (!el.hasAttribute('aria-label')) el.setAttribute('aria-label', 'Remover item'); });
  document.querySelectorAll('.nav-item').forEach((el, index) => {
    if (!el.hasAttribute('role')) el.setAttribute('role', 'tab');
    if (!el.hasAttribute('aria-selected')) el.setAttribute('aria-selected', el.classList.contains('active') ? 'true' : 'false');
    const tabId = el.dataset.tab;
    if (tabId) el.setAttribute('aria-controls', 'tab-' + tabId);
  });
  const nav = document.querySelector('.bottom-nav');
  if (nav && !nav.hasAttribute('role')) nav.setAttribute('role', 'tablist');
  document.querySelectorAll('.modal-overlay').forEach(modal => {
    if (!modal.hasAttribute('role')) modal.setAttribute('role', 'dialog');
    if (!modal.hasAttribute('aria-modal')) modal.setAttribute('aria-modal', 'true');
    const title = modal.querySelector('.modal-title');
    if (title && title.id) modal.setAttribute('aria-labelledby', title.id);
  });
  const liveAreas = ['agenda-full-list', 'clientes-list', 'movimentos-list', 'agenda-today-list'];
  liveAreas.forEach(id => {
    const el = document.getElementById(id);
    if (el && !el.hasAttribute('aria-live')) { el.setAttribute('aria-live', 'polite');
      el.setAttribute('aria-atomic', 'true'); }
  });
}

let previousFocusedElement = null;

function trapFocus(modal) {
  const focusableElements = modal.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
  if (focusableElements.length === 0) return;
  const firstElement = focusableElements[0];
  const lastElement = focusableElements[focusableElements.length - 1];
  modal.addEventListener('keydown', function(e) {
    if (e.key === 'Tab') {
      if (e.shiftKey) {
        if (document.activeElement === firstElement) { e.preventDefault();
          lastElement.focus(); }
      } else {
        if (document.activeElement === lastElement) { e.preventDefault();
          firstElement.focus(); }
      }
    }
  });
}
const originalOpenModal = window.openModal;
if (originalOpenModal) {
  window.openModal = function(id) {
    const modal = document.getElementById(id);
    if (!modal) return;
    previousFocusedElement = document.activeElement;
    originalOpenModal(id);
    trapFocus(modal);
    const firstFocusable = modal.querySelector('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
    if (firstFocusable) setTimeout(() => firstFocusable.focus(), 100);
  };
}
const originalCloseModal = window.closeModal;
if (originalCloseModal) {
  window.closeModal = function(id) {
    originalCloseModal(id);
    if (previousFocusedElement) { setTimeout(() => { previousFocusedElement.focus();
        previousFocusedElement = null; }, 200); }
  };
}

// ====================================================================
//  IA OFFLINE E SVGs
// ====================================================================
function atualizarIAOffline() {
  const overlay = document.getElementById('ia-offline-overlay');
  if (!overlay) return;
  const isOnline = navigator.onLine;
  overlay.style.display = isOnline ? 'none' : 'flex';
}

const svgCalendario = `<svg width="80" height="80" viewBox="0 0 80 80" fill="none" stroke="var(--neutral-300)" stroke-width="1.5"><rect x="16" y="20" width="48" height="48" rx="4"/><line x1="16" y1="32" x2="64" y2="32"/><line x1="28" y1="16" x2="28" y2="24"/><line x1="52" y1="16" x2="52" y2="24"/><circle cx="40" cy="44" r="6"/></svg>`;
const svgCarteira = `<svg width="80" height="80" viewBox="0 0 80 80" fill="none" stroke="var(--neutral-300)" stroke-width="1.5"><rect x="12" y="28" width="56" height="36" rx="4"/><path d="M12 36h8a8 8 0 0 1 0 16h-8"/><circle cx="48" cy="46" r="4"/></svg>`;
const svgPessoas = `<svg width="80" height="80" viewBox="0 0 80 80" fill="none" stroke="var(--neutral-300)" stroke-width="1.5"><circle cx="30" cy="24" r="12"/><circle cx="50" cy="24" r="10"/><path d="M10 64c0-12 6-20 20-20s20 8 20 20"/><path d="M56 64c0-8 4-14 14-14s14 6 14 14"/></svg>`;
const svgTesoura = `<svg width="80" height="80" viewBox="0 0 80 80" fill="none" stroke="var(--neutral-300)" stroke-width="1.5"><circle cx="28" cy="36" r="8"/><circle cx="52" cy="36" r="8"/><path d="M20 44 L60 24 M20 24 L60 44"/></svg>`;
const svgPessoa = `<svg width="80" height="80" viewBox="0 0 80 80" fill="none" stroke="var(--neutral-300)" stroke-width="1.5"><circle cx="40" cy="30" r="16"/><path d="M12 68c0-12 8-20 28-20s28 8 28 20"/></svg>`;

// ====================================================================
//  NAVEGAÇÃO ENTRE ABAS
// ====================================================================
document.querySelectorAll('.nav-item').forEach(btn => {
  btn.addEventListener('click', function() {
    const tab = this.dataset.tab;
    if (this.dataset.role) {
      const permitido = this.dataset.role.split(',').map(r => r.trim()).includes(normalizarRole(state.config.userRole));
      if (!permitido) {
        toast('Não tem permissão para aceder a essa área.', 'error');
        return;
      }
    }
    activeTab = tab;
    localStorage.setItem('bp_active_tab', tab);
    document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));
    document.getElementById('tab-' + tab).classList.add('active');
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    this.classList.add('active');
    document.querySelectorAll('.nav-item').forEach(n => n.setAttribute('aria-selected', 'false'));
    this.setAttribute('aria-selected', 'true');
    if (tab === 'agenda') renderAgendaFull();
    if (tab === 'clientes') renderClientes();
    if (tab === 'caixa') renderCaixa();
    if (tab === 'dashboard') renderDashboard();
    if (tab === 'equipa') { renderProfissionais(); renderServicos(); }
    if (tab === 'ia') {
      document.getElementById('ia-contador').textContent = parseInt(localStorage.getItem('ia_perguntas_' + hoje()) ||
        '0');
      renderPlanoInfo();
      atualizarIAOffline();
      renderIAResumo();
    }
    aplicarAcessibilidade();
    aplicarPermissoes();
    atualizarVisibilidadeAtalhos();
  });
});

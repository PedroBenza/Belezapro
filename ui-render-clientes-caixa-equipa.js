// ====================================================================
//  ui-render-clientes-caixa-equipa.js — extraído do app.js (Fase C da modularização)
//  Conteúdo: Renderização de Clientes, Caixa, Profissionais e Serviços
//  Linhas originais: 611-910
//  Carregar depois de core-*.js, db-indexeddb.js, sync-*.js, auth-supabase.js
// ====================================================================

function renderClientes() {
  const cont0 = document.getElementById('clientes-list');
  if (!state.clientes || !Array.isArray(state.clientes)) {
    if (cont0) cont0.innerHTML = '<div class="empty-state">A carregar clientes...</div>';
    return;
  }
  const search = document.getElementById('search-cliente')?.value.toLowerCase() || '';
  const filtro = state.filtroClientes || 'todos';
  const freqMap = {};
  (state.agendamentos || []).forEach(a => { freqMap[a.cliente] = (freqMap[a.cliente] || 0) + 1; });
  (state.movimentos || []).filter(m => m.tipo === 'venda').forEach(v => { freqMap[v.cliente] = (freqMap[v.cliente] || 0) + 1; });

  let filtered = state.clientes.filter(c => c.nome.toLowerCase().includes(search));
  if (filtro === 'mais') filtered.sort((a, b) => (freqMap[b.nome] || 0) - (freqMap[a.nome] || 0));
  else if (filtro === 'menos') filtered.sort((a, b) => (freqMap[a.nome] || 0) - (freqMap[b.nome] || 0));

  const cont = document.getElementById('clientes-list');
  if (filtered.length === 0) {
    cont.innerHTML = `<div class="empty-state">${svgPessoa}<p>${search ? 'Nenhum resultado' : 'Nenhum cliente ainda'}</p></div>`;
    return;
  }

  cont.innerHTML = filtered.map(c => {
    const freq = freqMap[c.nome] || 0;
    return `
      <div class="list-item" style="cursor:default;">
        <div class="avatar">${c.nome.charAt(0).toUpperCase()}</div>
        <div class="info">
          <div class="title">${escHtml(c.nome)}</div>
          <div class="sub">${escHtml(c.telefone || '')}${c.notas ? ' · ' + escHtml(c.notas) : ''} · ${freq} visitas</div>
        </div>
        <div class="actions">
          <button class="row-menu-btn" data-action="row-menu" data-tipo="cliente" data-id="${c.id}" aria-label="Mais ações" aria-haspopup="menu">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="5" r="1.75"/><circle cx="12" cy="12" r="1.75"/><circle cx="12" cy="19" r="1.75"/></svg>
          </button>
        </div>
      </div>
    `;
  }).join('');
}

function renderCaixa() {
  if (!state.movimentos || !Array.isArray(state.movimentos)) {
    const cont0 = document.getElementById('movimentos-list');
    if (cont0) cont0.innerHTML = '<div class="empty-state">A carregar movimentos...</div>';
    return;
  }
  const hojeStr = hoje();
  const entradas = state.movimentos.filter(m => m.data === hojeStr && m.tipo === 'venda').reduce((s, m) => s + m.valor, 0);
  const despesas = state.movimentos.filter(m => m.data === hojeStr && m.tipo === 'despesa').reduce((s, m) => s + m.valor, 0);
  document.getElementById('caixa-saldo').textContent = fmtKz(state.config.fundo + entradas - despesas);
  document.getElementById('caixa-fundo').textContent = fmtKz(state.config.fundo);
  // Variação do faturamento de hoje face a ontem
  const dOntem = new Date();
  dOntem.setDate(dOntem.getDate() - 1);
  const ontemStr = dOntem.getFullYear() + '-' + String(dOntem.getMonth() + 1).padStart(2, '0') + '-' + String(dOntem.getDate()).padStart(2, '0');
  const totalOntem = state.movimentos.filter(m => m.data === ontemStr && m.tipo === 'venda').reduce((s, m) => s + m.valor, 0);
  const variacaoEl = document.getElementById('caixa-variacao');
  if (variacaoEl) {
    let variacao = 0;
    if (totalOntem > 0) {
      variacao = ((entradas - totalOntem) / totalOntem) * 100;
    } else if (entradas > 0) {
      variacao = 100;
    }
    const subiu = variacao >= 0;
    variacaoEl.textContent = `${subiu ? '↑' : '↓'} ${Math.abs(Math.round(variacao))}%`;
    variacaoEl.style.color = subiu ? 'var(--green)' : 'var(--red)';
  }

  const periodo = state.histPeriodo;
  const movs = getMovimentosPeriodo(periodo).sort((a, b) => b.data.localeCompare(a.data) || b.hora.localeCompare(a.hora));
  const titulos = { hoje: 'Movimentos de Hoje', '7dias': 'Últimos 7 dias', '30dias': 'Últimos 30 dias', mes: 'Este Mês',
    tudo: 'Histórico Completo' };
  document.getElementById('hist-titulo').textContent = titulos[periodo] || 'Movimentos';

  const cont = document.getElementById('movimentos-list');
  if (movs.length === 0) { cont.innerHTML = `<div class="empty-state">${svgCarteira}<p>Sem movimentos neste período</p></div>`; return; }
  cont.innerHTML = movs.map(m => {
    const isV = m.tipo === 'venda';
    const nomeProf = getProfissionalNome(m.profissional_id);
    return `
      <div class="list-item${isV ? ' list-item-venda' : ''}" data-id="${m.id}" data-tipo="${m.tipo}" style="padding-right:${isV ? '32px' : '16px'};">
        <div class="avatar" style="background:${isV ? '#E6F4EC' : '#FDE8E8'};color:${isV ? 'var(--green)' : 'var(--red)'}">${isV ? '💰' : '💸'}</div>
        <div class="info">
          <div class="title">${escHtml(m.descricao)}</div>
          <div class="sub">${m.data !== hojeStr ? m.data + ' · ' : ''}${m.hora}${isV ? ' · ' + escHtml(m.cliente || 'Anónimo') + ' · ' + escHtml(m.metodoPagamento || '') : ''}
          </div>
        </div>
        <div class="action" style="color:${isV ? 'var(--green)' : 'var(--red)'};">${isV ? '+' : '-'}${fmtKz(m.valor)}</div>
      </div>`;
  }).join('');

  cont.querySelectorAll('.list-item').forEach(el => {
    el.addEventListener('click', e => {
      if (el.dataset.tipo === 'venda') { addRipple(el, e);
        abrirDetalheVenda(el.dataset.id); } else toast('Detalhes disponíveis apenas para vendas', 'warning');
    });
  });
}

function getMovimentosPeriodo(periodo) {
  const hojeStr = hoje();
  const now = new Date();
  return state.movimentos.filter(m => {
    if (periodo === 'hoje') return m.data === hojeStr;
    if (periodo === '7dias') {
      const d7 = new Date(now);
      d7.setDate(d7.getDate() - 6);
      return m.data >= d7.toISOString().split('T')[0];
    }
    if (periodo === '30dias') {
      const d30 = new Date(now);
      d30.setDate(d30.getDate() - 29);
      return m.data >= d30.toISOString().split('T')[0];
    }
    if (periodo === 'mes') {
      const mes = String(now.getMonth() + 1).padStart(2, '0');
      return m.data.startsWith(now.getFullYear() + '-' + mes);
    }
    return true;
  });
}

function renderProfissionais() {
  const cont = document.getElementById('profissionais-list');
  if (!cont) return;
  const plano = getPlanoAtual();
  const aviso = document.getElementById('plano-aviso');
  if (aviso) aviso.style.display = (plano === 'trial' || plano === 'starter') ? 'block' : 'none';

  if (state.profissionais.length === 0) {
    cont.innerHTML = `<div class="empty-state">${svgPessoas}<p>Adicione o primeiro profissional</p></div>`;
    return;
  }
  const profissionaisOrdenados = [...state.profissionais].sort((a, b) => a.nome.localeCompare(b.nome));
  cont.innerHTML = profissionaisOrdenados.map(p => `
    <div class="list-item" style="cursor:default;">
      <div class="avatar">${p.nome.charAt(0).toUpperCase()}</div>
      <div class="info">
        <div class="title">${escHtml(p.nome)}</div>
        <div class="sub">${escHtml(p.especialidade || '')}</div>
      </div>
      <div class="actions">
        <button class="row-menu-btn" data-action="row-menu" data-tipo="profissional" data-id="${p.id}" data-role="admin" aria-label="Mais ações" aria-haspopup="menu">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="5" r="1.75"/><circle cx="12" cy="12" r="1.75"/><circle cx="12" cy="19" r="1.75"/></svg>
        </button>
      </div>
    </div>
  `).join('');
}

function renderServicos() {
  const container = document.getElementById('servicos-list');
  if (!container) return;
  if (state.servicos.length === 0) {
    container.innerHTML = `<div class="empty-state">${svgTesoura}<p>Nenhum serviço cadastrado</p></div>`;
    return;
  }
  const servicosOrdenados = [...state.servicos].sort((a, b) => a.nome.localeCompare(b.nome));
  container.innerHTML = servicosOrdenados.map(s => {
    const profs = s.profissionais && s.profissionais.length > 0 ? s.profissionais.join(', ') : 'Todos os profissionais disponíveis';
    return `
      <div class="list-item" style="cursor:default;">
        <div class="avatar" style="background:var(--gold-light);color:var(--gold-dark);">💈</div>
        <div class="info">
          <div class="title">${escHtml(s.nome)}</div>
          <div class="sub">${fmtKz(s.precoBase)} · 👤 ${escHtml(profs)}</div>
        </div>
        <div class="actions">
          <button class="row-menu-btn" data-action="row-menu" data-tipo="servico" data-id="${s.id}" data-role="admin" aria-label="Mais ações" aria-haspopup="menu">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="5" r="1.75"/><circle cx="12" cy="12" r="1.75"/><circle cx="12" cy="19" r="1.75"/></svg>
          </button>
        </div>
      </div>
    `;
  }).join('');
}

function renderBadges() {
  const count = state.agendamentos.filter(a => a.data === hoje() && a.status !== 'realizado').length;
  const badge = document.getElementById('agenda-badge');
  if (count > 0) { badge.textContent = count > 9 ? '9+' : count;
    badge.classList.add('show'); } else badge.classList.remove('show');
}

// ====================================================================
//  SETUP DE PRECIFICAÇÃO E SELECTS
// ====================================================================
function setupPrecoAutomatico(selectId, inputPrecoId) {
  const select = document.getElementById(selectId);
  const inputPreco = document.getElementById(inputPrecoId);
  if (!select || !inputPreco) return;
  if (select._precoHandler) select.removeEventListener('change', select._precoHandler);
  const handler = () => {
    const nome = select.value;
    if (!nome || nome === 'Outro' || nome === '__custom') {
      inputPreco.value = '';
      inputPreco.disabled = false;
      inputPreco.style.opacity = '1';
      return;
    }
    const serv = state.servicos.find(s => s.nome === nome);
    if (serv) {
      inputPreco.value = serv.precoBase;
      inputPreco.disabled = true;
      inputPreco.style.opacity = '0.7';
    } else {
      inputPreco.value = '';
      inputPreco.disabled = false;
      inputPreco.style.opacity = '1';
    }
  };
  select._precoHandler = handler;
  select.addEventListener('change', handler);
  handler();
}

function populateAgendaSelects() {
  const profSel = document.getElementById('agenda-profissional');
  const servSel = document.getElementById('agenda-servico');
  if (!profSel || !servSel) return;
  const prevServico = servSel.value;
  servSel.innerHTML = state.servicos.map(s =>
    `<option value="${escHtml(s.nome)}">${escHtml(s.nome)}</option>`
  ).join('') + '<option value="Outro">Outro / Personalizado</option>';
  if (prevServico) servSel.value = prevServico;

  const filtrarProfsAgenda = (servicoNome) => {
    let profs;
    if (!servicoNome || servicoNome === 'Outro') {
      profs = state.profissionais.map(p => ({ id: p.id, nome: p.nome }));
    } else {
      const serv = state.servicos.find(s => s.nome === servicoNome);
      const nomes = serv && serv.profissionais && serv.profissionais.length > 0
        ? serv.profissionais
        : state.profissionais.map(p => p.nome);
      profs = state.profissionais
        .filter(p => nomes.includes(p.nome))
        .map(p => ({ id: p.id, nome: p.nome }));
    }
    const prevProfId = profSel.value;
    profSel.innerHTML = profs.map(p =>
      `<option value="${p.id}">${escHtml(p.nome)}</option>`
    ).join('');
    if (profs.some(p => p.id === prevProfId)) profSel.value = prevProfId;
  };
  filtrarProfsAgenda(servSel.value);
  if (servSel._filterHandler) servSel.removeEventListener('change', servSel._filterHandler);
  servSel._filterHandler = function() { filtrarProfsAgenda(this.value); };
  servSel.addEventListener('change', servSel._filterHandler);
}

function populateVendaSelects() {
  const profSel = document.getElementById('venda-profissional');
  const catSel = document.getElementById('ci-servico-sel');
  if (!profSel || !catSel) return;
  
  // Remove qualquer seleção anterior
  catSel.selectedIndex = -1;

  // Preenche o select de serviços com uma opção vazia no início
  catSel.innerHTML = `<option value="">Selecionar serviço</option>` +
    state.servicos.map(s =>
      `<option value="${escHtml(s.nome)}" data-preco="${s.precoBase}">${escHtml(s.nome)}</option>`
    ).join('') +
    '<option value="__custom" data-preco="">✏️ Outro (personalizado)</option>';

  const filtrarProfsVenda = (servicoNome) => {
    let profs;
    if (!servicoNome || servicoNome === '__custom') {
      profs = state.profissionais.map(p => ({ id: p.id, nome: p.nome }));
    } else {
      const serv = state.servicos.find(s => s.nome === servicoNome);
      const nomes = serv && serv.profissionais && serv.profissionais.length > 0
        ? serv.profissionais
        : state.profissionais.map(p => p.nome);
      profs = state.profissionais
        .filter(p => nomes.includes(p.nome))
        .map(p => ({ id: p.id, nome: p.nome }));
    }
    // Preenche o select de profissionais com uma opção vazia no início
    profSel.innerHTML = `<option value="">Selecionar profissional</option>` +
      profs.map(p =>
        `<option value="${p.id}">${escHtml(p.nome)}</option>`
      ).join('');
  };

  // Remove a chamada automática do filtro (para não pré-selecionar)
  // filtrarProfsVenda(catSel.value); // REMOVIDO

  if (catSel._filterHandler) catSel.removeEventListener('change', catSel._filterHandler);
  catSel._filterHandler = function() {
    filtrarProfsVenda(this.value);
    const opt = this.options[this.selectedIndex];
    const ciValor = document.getElementById('ci-valor');
    if (this.value === '__custom') {
      if (ciValor) { ciValor.value = ''; ciValor.disabled = false; ciValor.style.opacity = '1'; }
    } else if (opt && opt.dataset.preco) {
      if (ciValor) { ciValor.value = opt.dataset.preco; ciValor.disabled = true; ciValor.style.opacity = '0.7'; }
    } else {
      if (ciValor) { ciValor.value = ''; ciValor.disabled = false; ciValor.style.opacity = '1'; }
    }
  };
  catSel.addEventListener('change', catSel._filterHandler);
  // Remove a chamada automática no final
  // if (catSel.value) catSel._filterHandler.call(catSel); // REMOVIDO
}
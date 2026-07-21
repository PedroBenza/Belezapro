// ====================================================================
//  eventos-caixa-vendas.js — extraído do app.js (Fase C da modularização)
//  Conteúdo: Eventos: despesa, fundo, carrinho/venda, confirmação de venda, fecho de caixa, detalhes e KPIs
//  Linhas originais: 1877-2109
//  Carregar depois de core-*.js, db-indexeddb.js, sync-*.js, auth-supabase.js
// ====================================================================

// Despesa
document.getElementById('add-despesa-btn').addEventListener('click', () => openModal('modal-despesa'));
document.getElementById('modal-despesa-save').addEventListener('click', async () => {
  const desc = document.getElementById('desp-desc').value.trim();
  const valor = parseFloat(document.getElementById('desp-valor').value);
  if (!desc || !valor || valor <= 0) { toast('Preencha descrição e valor válido', 'error'); return; }
  await addMovimento({ tipo: 'despesa', descricao: desc, valor });
  closeModal('modal-despesa');
  document.getElementById('desp-desc').value = '';
  document.getElementById('desp-valor').value = '';
  toast('Despesa registada', 'success');
});
document.getElementById('modal-despesa-cancel').addEventListener('click', () => closeModal('modal-despesa'));

// Fundo
document.getElementById('ajustar-fundo-btn').addEventListener('click', () => {
  document.getElementById('fundo-valor').value = state.config.fundo;
  openModal('modal-fundo');
});
document.getElementById('modal-fundo-save').addEventListener('click', async () => {
  const v = parseFloat(document.getElementById('fundo-valor').value);
  if (isNaN(v) || v < 0) { toast('Valor inválido', 'error'); return; }
  state.config.fundo = v;
  await saveConfig();
  closeModal('modal-fundo');
  toast('Fundo actualizado', 'success');
  updateUI();
});
document.getElementById('modal-fundo-cancel').addEventListener('click', () => closeModal('modal-fundo'));

// Venda – Adicionar item ao carrinho (profissional único/global)
document.getElementById('btn-add-item').addEventListener('click', () => {
  // VALIDAÇÃO: profissional obrigatório (global)
  const profissionalId = document.getElementById('venda-profissional').value;
  if (!profissionalId || profissionalId.trim() === '') {
    toast('Selecione um profissional antes de adicionar ao carrinho.', 'error');
    return;
  }

  const catSel = document.getElementById('ci-servico-sel');
  const ciValor = document.getElementById('ci-valor');
  let nome = catSel.value;
  if (nome === '__custom') { 
    nome = prompt('Nome do serviço / produto:'); 
    if (!nome || !nome.trim()) return;
    nome = nome.trim(); 
  }
  const wasDisabled = ciValor.disabled;
  ciValor.disabled = false;
  const valor = parseFloat(ciValor.value);
  if (wasDisabled) ciValor.disabled = true;
  if (!nome || !valor || valor <= 0) { 
    toast('Preencha serviço e valor válido', 'error'); 
    return; 
  }

  // Usar a função central addToCart (definida em vendas-modais.js) - sem profissional por item
  if (typeof window.addToCart === 'function') {
    window.addToCart(nome, valor);
  } else {
    // Fallback
    const existingIndex = cartItems.findIndex(item => item.nome === nome);
    if (existingIndex !== -1) {
      cartItems[existingIndex].quantidade += 1;
      cartItems[existingIndex].subtotal = cartItems[existingIndex].quantidade * cartItems[existingIndex].precoUnit;
    } else {
      cartItems.push({ nome, quantidade: 1, precoUnit: valor, subtotal: valor });
    }
    renderCart();
  }
});

// CORREÇÃO: modal-venda-save com profissional único
const vendaSaveBtn = document.getElementById('modal-venda-save');
if (vendaSaveBtn) {
  vendaSaveBtn.onclick = async function(e) {
    if (cartItems.length === 0) { toast('Adicione pelo menos um serviço', 'error'); return; }
    const cliente = document.getElementById('venda-cliente').value || 'Anónimo';
    const profissionalId = document.getElementById('venda-profissional').value;
    const metodoPagamento = document.getElementById('venda-pagamento').value;
    
    // Buscar o nome do profissional
    const profObj = state.profissionais.find(p => p.id === profissionalId);
    const profissionalNome = profObj ? profObj.nome : '';
    
    setButtonLoading(this, true);
    try {
      const idVenda = await registarVenda({
        cliente,
        profissional: profissionalNome,
        profissional_id: profissionalId,
        itens: [...cartItems],
        metodoPagamento
      });
      closeModal('modal-venda');
      // Limpar carrinho
      if (typeof window.clearCart === 'function') {
        window.clearCart();
      } else {
        cartItems = [];
        renderCart();
      }
      if (idVenda) {
        mostrarConfirmacaoVenda(idVenda);
      } else {
        toast('Erro ao registar venda', 'error');
      }
    } catch (err) {
      mostrarErro('Não foi possível registar a venda. Verifique a sua ligação e tente novamente.');
    } finally {
      setButtonLoading(this, false);
    }
  };
}

// Cancelar venda – limpar carrinho com confirmação e fechar modal
document.getElementById('modal-venda-cancel').addEventListener('click', () => {
  if (cartItems.length > 0) {
    const confirmCancel = confirm('Tem a certeza que deseja cancelar? O carrinho será limpo.');
    if (!confirmCancel) return;
  }
  if (typeof window.clearCart === 'function') {
    window.clearCart();
  } else {
    cartItems = [];
    renderCart();
  }
  closeModal('modal-venda');
});

document.getElementById('venda-add-cliente-rapido').addEventListener('click', () => {
  closeModal('modal-venda');
  document.getElementById('cliente-rapido-nome').value = '';
  document.getElementById('cliente-rapido-telefone').value = '';
  openModal('modal-cliente-rapido');
});

// Tela de sucesso da venda
let ultimaVendaId = null;

const PAGAMENTO_ICONES = {
  'Numerário': '💵 Numerário',
  'Multicaixa Express': '📱 Multicaixa Express',
  'Transferência Bancária': '🏦 Transferência Bancária',
  'Cartão': '💳 Cartão',
  'Outro': '💰 Outro',
};

function mostrarConfirmacaoVenda(vendaId) {
  const venda = state.movimentos.find(m => m.id === vendaId);
  if (!venda) return;
  ultimaVendaId = vendaId;

  document.getElementById('sucesso-valor').textContent = fmtKz(venda.valor);
  document.getElementById('detalhe-venda-id').textContent = '#' + (venda.reciboNum || nextReciboNum());
  document.getElementById('detalhe-venda-cliente').textContent = venda.cliente || 'Anónimo';
  document.getElementById('detalhe-venda-profissional').textContent = getProfissionalNome(venda.profissional_id);
  const [ano, mes, dia] = (venda.data || '').split('-');
  document.getElementById('detalhe-venda-datahora').textContent = (dia ? `${dia}/${mes}/${ano}` : '--/--/----') + ' · ' + (venda.hora || '--:--');
  document.getElementById('detalhe-venda-pagamento').textContent = PAGAMENTO_ICONES[venda.metodoPagamento] || ('💰 ' + (venda.metodoPagamento || 'Numerário'));
  document.getElementById('detalhe-venda-itens').innerHTML = (venda.itens || []).map(i => `
    <div class="r-item-row">
      <span>${escHtml(i.nome)}</span>
      <span>${i.quantidade}</span>
      <span>${fmtKz(i.precoUnit)}</span>
      <span>${fmtKz(i.subtotal)}</span>
    </div>`).join('');
  document.getElementById('detalhe-venda-total').textContent = fmtKz(venda.valor);

  openModal('modal-venda-sucesso');
  const circle = document.getElementById('success-circle');
  const check = document.getElementById('success-check');
  if (circle) { circle.style.strokeDashoffset = '88';
    requestAnimationFrame(() => { circle.style.animation = 'none';
      requestAnimationFrame(() => { circle.style.animation = 'drawCircle 0.5s ease-out forwards'; }); }); }
  if (check) { check.style.strokeDashoffset = '17';
    requestAnimationFrame(() => { check.style.animation = 'none';
      requestAnimationFrame(() => { check.style.animation = 'drawCheck 0.3s 0.5s ease-out forwards'; }); }); }
}

document.getElementById('btn-imprimir-sucesso')?.addEventListener('click', () => {
  if (ultimaVendaId) {
    const venda = state.movimentos.find(m => m.id === ultimaVendaId);
    if (venda) imprimirRecibo(venda);
  }
});
document.getElementById('btn-voltar-sucesso')?.addEventListener('click', () => {
  closeModal('modal-venda-sucesso');
  closeModal('modal-venda');
});

// Finalizar atendimento
document.getElementById('modal-finalizar-save').addEventListener('click', async () => {
  const id = document.getElementById('finalizar-ag-id').value;
  const ag = state.agendamentos.find(a => a.id === id);
  if (!ag) return;
  if (ag.status === 'realizado') { toast('Atendimento já realizado', 'warning'); return; }
  const metodo = document.getElementById('finalizar-pagamento').value;
  await updateAgendamento(id, { status: 'realizado' });
  const itens = [{ nome: ag.servico, quantidade: 1, precoUnit: ag.preco, subtotal: ag.preco }];
  await registarVenda({ cliente: ag.cliente, profissional: ag.profissional, itens, metodoPagamento: metodo });
  closeModal('modal-finalizar');
  toast('Atendimento finalizado e venda registada!', 'success');
});

document.getElementById('modal-finalizar-cancel').addEventListener('click', () => closeModal('modal-finalizar'));

// ====================================================================
//  CONFIRMAR FECHO DE CAIXA (persistência)
// ====================================================================
async function confirmarFechoCaixa() {
  const hojeStr = hoje();
  const movs = state.movimentos.filter(m => m.data === hojeStr);
  const vendas = movs.filter(m => m.tipo === 'venda');
  const despesas = movs.filter(m => m.tipo === 'despesa');

  // Verificar se já existe fecho para hoje
  if (state.fechos_caixa && state.fechos_caixa.some(f => f.data === hojeStr)) {
    toast('Já existe um fecho de caixa registado para hoje.', 'warning');
    return;
  }

  const detalhePagamento = {};
  vendas.forEach(v => {
    const mp = v.metodoPagamento || 'Numerário';
    detalhePagamento[mp] = (detalhePagamento[mp] || 0) + v.valor;
  });

  const totalVendas = vendas.reduce((s, v) => s + v.valor, 0);
  const totalDespesas = despesas.reduce((s, d) => s + d.valor, 0);
  const saldoFinal = state.config.fundo + totalVendas - totalDespesas;

  const registro = {
    id: uuid(),
    salao_id: state.config.salaoId,
    data: hojeStr,
    fundo_abertura: state.config.fundo,
    total_vendas: totalVendas,
    total_despesas: totalDespesas,
    saldo_final: saldoFinal,
    detalhe_pagamento: detalhePagamento,
    fechado_por: state.config.userId || null,
  };

  await dbPut('fechos_caixa', registro);
  // Atualizar o estado local
  state.fechos_caixa.push(registro);
  toast('Caixa fechado e registado com sucesso!', 'success');
  closeModal('modal-fecho');
  updateUI();
}

// ====================================================================
//  FECHO DE CAIXA (listeners)
// ====================================================================
document.getElementById('fecho-caixa-btn').addEventListener('click', abrirFechoCaixa);
document.getElementById('modal-fecho-fechar').addEventListener('click', () => closeModal('modal-fecho'));
document.getElementById('btn-imprimir-fecho').addEventListener('click', () => {
  const hojeStr = hoje();
  const vendas = state.movimentos.filter(m => m.data === hojeStr && m.tipo === 'venda');
  const despesas = state.movimentos.filter(m => m.data === hojeStr && m.tipo === 'despesa');
  const tv = vendas.reduce((s, v) => s + v.valor, 0);
  const td = despesas.reduce((s, d) => s + d.valor, 0);
  const byPag = {};
  vendas.forEach(v => { const k = v.metodoPagamento || 'Numerário';
    byPag[k] = (byPag[k] || 0) + v.valor; });
  document.getElementById('recibo-print').innerHTML = `
    <div class="r-store">${escHtml(state.config.storeName)}</div>
    <div class="r-sub">FECHO DE CAIXA</div>
    <div class="r-num">${hojeStr}</div>
    <hr class="r-div">
    <div class="r-meta"><b>Fundo abertura: </b>${fmtKz(state.config.fundo)}</div>
    <div class="r-meta"><b>Total vendas (${vendas.length}): </b>${fmtKz(tv)}</div>
    <div class="r-meta"><b>Total despesas (${despesas.length}): </b>${fmtKz(td)}</div>
    <hr class="r-div">
    ${Object.entries(byPag).map(([k, v]) => `<div class="r-meta">${escHtml(k)}: ${fmtKz(v)}</div>`).join('')}
    <hr class="r-div">
    <div class="r-total">SALDO: ${fmtKz(state.config.fundo + tv - td)}</div>
    <div class="r-footer"><strong>BeautyPro</strong>Fechado ${new Date().toLocaleTimeString('pt-AO', { hour: '2-digit', minute: '2-digit' })}</div>`;
  requestAnimationFrame(() => requestAnimationFrame(() => window.print()));
});

// NOVO: Listener para o botão "Confirmar Fecho"
document.getElementById('confirmar-fecho-btn')?.addEventListener('click', confirmarFechoCaixa);

// Detalhe venda
document.getElementById('modal-detalhe-fechar').addEventListener('click', () => closeModal('modal-detalhe-venda'));
document.getElementById('btn-imprimir-recibo').addEventListener('click', () => {
  if (vendaAtual) imprimirRecibo(vendaAtual);
  else toast('Nenhuma venda para imprimir', 'error');
});

// KPIs clicáveis
document.getElementById('kpi-revenue-card').addEventListener('click', abrirDetalheFaturamento);
document.getElementById('kpi-agenda-card').addEventListener('click', () => abrirDetalheAgendamentos('pendentes'));

document.getElementById('modal-revenue-close').addEventListener('click', () => closeModal('modal-revenue-detail'));
document.getElementById('modal-agenda-close').addEventListener('click', () => closeModal('modal-agenda-detail'));

document.getElementById('agenda-detail-pendentes').addEventListener('click', () => abrirDetalheAgendamentos('pendentes'));
document.getElementById('agenda-detail-realizados').addEventListener('click', () => abrirDetalheAgendamentos('realizados'));

// Histórico filtro
document.getElementById('hist-filter').querySelectorAll('.hist-chip').forEach(chip => {
  chip.addEventListener('click', () => {
    document.querySelectorAll('.hist-chip').forEach(c => c.classList.remove('active'));
    chip.classList.add('active');
    state.histPeriodo = chip.dataset.periodo;
    renderCaixa();
  });
});

// Filtro clientes
document.querySelectorAll('.filtro-frequencia').forEach(btn => {
  btn.addEventListener('click', function() {
    document.querySelectorAll('.filtro-frequencia').forEach(b => b.classList.remove('active'));
    this.classList.add('active');
    state.filtroClientes = this.dataset.filtro;
    localStorage.setItem('bp_filtro_clientes', state.filtroClientes);
    renderClientes();
  });
});

// Agenda navegação
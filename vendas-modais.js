// ====================================================================
//  vendas-modais.js — extraído do app.js (Fase C da modularização)
//  Conteúdo: Sparkline do ticket médio, detalhe/recibo de venda, carrinho e modal de nova venda, modal de serviço
//  Linhas originais: 1143-1410
//  Carregar depois de core-*.js, db-indexeddb.js, sync-*.js, auth-supabase.js
// ====================================================================
let vendaAtual = null;// ====================================================================
//  SPARKLINE — Linha fina, sem bolhas, sem brilhos
// ====================================================================
function desenharSparkline(canvasId, dados, cor = '#D4AF37') {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;
  // CORREÇÃO: canvas sem escala para devicePixelRatio ficava borrado em ecrãs retina.
  // O buffer interno passa a ser dpr×maior; o espaço lógico de desenho continua 84x28.
  const dpr = window.devicePixelRatio || 1;
  const cssWidth = canvas.getBoundingClientRect().width || 84;
  const cssHeight = canvas.getBoundingClientRect().height || 28;
  const bufferW = Math.round(cssWidth * dpr);
  const bufferH = Math.round(cssHeight * dpr);
  if (canvas.width !== bufferW || canvas.height !== bufferH) {
    canvas.width = bufferW;
    canvas.height = bufferH;
  }
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const width = cssWidth;   // 84 (espaço lógico)
  const height = cssHeight; // 28 (espaço lógico)

  ctx.clearRect(0, 0, width, height);

  if (!dados || dados.length < 2) {
    ctx.beginPath();
    ctx.moveTo(0, height - 4);
    ctx.lineTo(width, height - 4);
    ctx.strokeStyle = cor;
    ctx.lineWidth = 1;
    ctx.globalAlpha = 0.15;
    ctx.stroke();
    ctx.globalAlpha = 1;
    return;
  }

  const min = Math.min(...dados, 0);
  const max = Math.max(...dados, 10);
  const range = max - min || 1;
  const padding = 3;
  const usableHeight = height - padding * 2;

  ctx.beginPath();
  for (let i = 0; i < dados.length; i++) {
    const x = (i / (dados.length - 1)) * width;
    const y = height - padding - ((dados[i] - min) / range) * usableHeight;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }

  ctx.strokeStyle = cor;
  ctx.lineWidth = 1.5;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.stroke();

  const lastX = width;
  const lastY = height - padding - ((dados[dados.length - 1] - min) / range) * usableHeight;
  ctx.beginPath();
  ctx.arc(lastX, lastY, 2, 0, Math.PI * 2);
  ctx.fillStyle = cor;
  ctx.fill();
  // --- Cabeça de seta (triângulo) na extremidade ---
if (dados.length >= 2) {
  const ultimoValor = dados[dados.length - 1];
  const penultimoValor = dados[dados.length - 2];
  const direcao = ultimoValor >= penultimoValor ? 1 : -1; // 1 = sobe, -1 = desce

  const xSeta = lastX;
  const ySeta = lastY;

  const tamanhoSeta = 5;
  ctx.beginPath();
  if (direcao > 0) {
    // Seta aponta para cima e direita
    ctx.moveTo(xSeta - tamanhoSeta, ySeta + tamanhoSeta);
    ctx.lineTo(xSeta, ySeta - tamanhoSeta);
    ctx.lineTo(xSeta + tamanhoSeta, ySeta + tamanhoSeta);
  } else {
    // Seta aponta para baixo e direita
    ctx.moveTo(xSeta - tamanhoSeta, ySeta - tamanhoSeta);
    ctx.lineTo(xSeta, ySeta + tamanhoSeta);
    ctx.lineTo(xSeta + tamanhoSeta, ySeta - tamanhoSeta);
  }
  ctx.closePath();
  ctx.fillStyle = cor;
  ctx.fill();
}
  
}

function abrirDetalheVenda(id) {
  const venda = state.movimentos.find(m => m.id === id && m.tipo === 'venda');
  if (!venda) { toast('Venda não encontrada', 'error'); return; }
  vendaAtual = venda;
  const itensHtml = venda.itens && venda.itens.length > 0 ?
    `<div class="detalhe-itens-header"><span>Descrição</span><span style="text-align:right">Qtd</span><span style="text-align:right">P.Unit</span><span style="text-align:right">Total</span></div>
     ${venda.itens.map(item => `
      <div class="detalhe-item-row">
        <span class="desc">${escHtml(item.nome)}</span>
        <span class="qty">${item.quantidade}</span>
        <span class="pu">${fmtKz(item.precoUnit || item.subtotal)}</span>
        <span class="sub">${fmtKz(item.subtotal)}</span>
      </div>`).join('')}` :
    `<div style="color:var(--text-muted);font-size:.85rem;padding:8px 0;">Sem itens detalhados</div>`;
  const mp = venda.metodoPagamento || 'Numerário';
  const mpIcon = { 'Numerário': '💵', 'Multicaixa Express': '📱', 'Transferência Bancária': '🏦', 'Cartão': '💳' } [mp] ||
    '💳';
  const nomeProf = getProfissionalNome(venda.profissional_id);
  document.getElementById('detalhe-venda-conteudo').innerHTML = `
    <div class="detalhe-meta">
      <div class="detalhe-meta-row"><span class="label">Cliente</span><span class="val">${escHtml(venda.cliente || 'Anónimo')}</span></div>
      <div class="detalhe-meta-row"><span class="label">Profissional</span><span class="val">${escHtml(nomeProf)}</span></div>
      <div class="detalhe-meta-row"><span class="label">Data / Hora</span><span class="val">${venda.data} · ${venda.hora}</span></div>
      <div class="detalhe-meta-row"><span class="label">Pagamento</span><span class="val"><span class="pagamento-badge">${mpIcon} ${escHtml(mp)}</span></span></div>
    </div>
    <div>${itensHtml}</div>
    <div class="detalhe-total"><span class="label">Total</span><span class="val">${fmtKz(venda.valor)}</span></div>`;
  document.getElementById('detalhe-venda-titulo').textContent = 'Venda #' + String(venda.id).slice(0, 8).toUpperCase();
  openModal('modal-detalhe-venda');
}

function imprimirRecibo(venda) {
  if (!venda) { toast('Nenhuma venda seleccionada', 'error'); return; }
  const el = document.getElementById('recibo-print');
  if (!el) {
    toast('Erro: elemento de impressão não encontrado', 'error');
    return;
  }
  const storeName = state.config.storeName || 'BeautyPro';
  const num = venda.reciboNum || nextReciboNum();
  const itensHtml = venda.itens && venda.itens.length > 0 ?
    `<div class="r-th"><span class="r-th-desc">SERVICO</span><span class="r-th-qty">QT</span><span class="r-th-sub">TOTAL</span></div>
     ${venda.itens.map(i => `<div class="r-item"><span class="r-item-name">${escHtml(i.nome)}</span><span class="r-item-qty">x${i.quantidade}</span><span class="r-item-sub">${fmtKz(i.subtotal)}</span></div>`).join('')}` :
    '<div style="font-size:7pt;">Sem itens</div>';
  const nomeProf = getProfissionalNome(venda.profissional_id);
  el.innerHTML = `
    <div class="r-store">${escHtml(storeName)}</div>
    <div class="r-sub">Luanda, Angola</div>
    <div class="r-num">Recibo N.º ${num}</div>
    <div class="r-num">${venda.data} &nbsp; ${venda.hora}</div>
    <hr class="r-div">
    <div class="r-meta"><b>CLIENTE: </b>${escHtml(venda.cliente || 'Anonimo')}</div>
    <div class="r-meta"><b>PROF.: </b>${escHtml(nomeProf)}</div>
    <hr class="r-div">
    ${itensHtml}
    <hr class="r-div">
    <div class="r-total">TOTAL: ${fmtKz(venda.valor)}</div>
    <div class="r-pag">Pag.: ${escHtml(venda.metodoPagamento || 'Numerario')}</div>
    <hr class="r-div">
    <div class="r-footer"><strong>Obrigado pela preferencia!</strong>Volte sempre ao ${escHtml(storeName)}</div>`;
  requestAnimationFrame(() => requestAnimationFrame(() => window.print()));
}

// ====================================================================
//  CARRINHO E VENDA
// ====================================================================
let cartItems = [];

function renderCart() {
  const list = document.getElementById('cart-items-list');
  const totalArea = document.getElementById('cart-total-area');
  if (!list) return;
  if (cartItems.length === 0) {
    list.innerHTML = '<div style="text-align:center;padding:16px;color:var(--text-muted);font-size:.85rem;">Carrinho vazio — adicione serviços acima</div>';
    if (totalArea) totalArea.innerHTML = '';
    return;
  }
  list.innerHTML = cartItems.map((item, idx) => `
    <div class="cart-item-row" data-idx="${idx}">
      <span class="ci-name">${escHtml(item.nome)}</span>
      <span class="ci-qty">x${item.quantidade}</span>
      <span class="ci-val">${fmtKz(item.subtotal)}</span>
      <button class="ci-del" data-idx="${idx}" aria-label="Remover item">✕</button>
    </div>`).join('');
  const rows = list.querySelectorAll('.cart-item-row');
  if (rows.length > 0) {
    const last = rows[rows.length - 1];
    if (!last.classList.contains('adding') && !last.classList.contains('removing')) {
      last.classList.add('adding');
      setTimeout(() => last.classList.remove('adding'), 400);
    }
  }
  const total = cartItems.reduce((s, i) => s + i.subtotal, 0);
  if (totalArea) totalArea.innerHTML =
    `<div class="cart-total-row"><span class="ct-label">Total</span><span class="ct-val">${fmtKz(total)}</span></div>`;
}

function openVendaModal() {
  cartItems = [];
  const clientSel = document.getElementById('venda-cliente');
  if (clientSel) {
    // REMOVIDA a opção "Cliente não identificado"
    clientSel.innerHTML = (state.clientes || []).map(c =>
      `<option value="${escHtml(c.nome)}">${escHtml(c.nome)}</option>`
    ).join('');
  }
  populateVendaSelects();
  renderCart();
  openModal('modal-venda');
}

document.addEventListener('click', function(e) {
  const delBtn = e.target.closest('.ci-del');
  if (delBtn) {
    const row = delBtn.closest('.cart-item-row');
    if (row) {
      row.classList.add('removing');
      const idx = parseInt(delBtn.dataset.idx);
      setTimeout(() => {
        if (!isNaN(idx) && idx >= 0 && idx < cartItems.length) {
          cartItems.splice(idx, 1);
          renderCart();
        }
      }, 250);
      e.preventDefault();
      e.stopPropagation();
    }
  }
});

// ====================================================================
//  SERVIÇO MODAL
// ====================================================================
function renderServicoProfissionais(selected = []) {
  const container = document.getElementById('servico-profissionais-container');
  if (!container) return;
  if (!state.profissionais.length) {
    container.innerHTML = '<span style="color:var(--text-muted);font-size:.75rem;">Nenhum profissional cadastrado</span>';
    return;
  }
  container.innerHTML = state.profissionais.map(p => `
    <label style="display:flex;align-items:center;gap:4px;font-size:.75rem;background:var(--bg-soft);padding:4px 10px;border-radius:30px;border:1px solid var(--border-soft);cursor:pointer;">
      <input type="checkbox" value="${escHtml(p.nome)}" ${selected.includes(p.nome) ? 'checked' : ''}>
      ${escHtml(p.nome)}
    </label>
  `).join('');
}

function getSelectedProfissionais() {
  const container = document.getElementById('servico-profissionais-container');
  if (!container) return [];
  const checks = container.querySelectorAll('input[type="checkbox"]:checked');
  return Array.from(checks).map(cb => cb.value);
}

function openServicoModal(id = null) {
  const title = document.getElementById('servico-modal-title');
  const nomeInput = document.getElementById('servico-nome');
  const precoInput = document.getElementById('servico-preco');
  const idInput = document.getElementById('servico-id');
  if (id) {
    const serv = state.servicos.find(s => s.id === id);
    if (!serv) return;
    title.textContent = 'Editar Serviço';
    nomeInput.value = serv.nome;
    precoInput.value = serv.precoBase;
    idInput.value = id;
    renderServicoProfissionais(serv.profissionais || []);
  } else {
    title.textContent = 'Novo Serviço';
    nomeInput.value = '';
    precoInput.value = '';
    idInput.value = '';
    renderServicoProfissionais([]);
  }
  openModal('modal-servico');
}

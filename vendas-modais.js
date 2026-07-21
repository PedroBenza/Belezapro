// ====================================================================
//  vendas-modais.js — extraído do app.js (Fase C da modularização)
//  Conteúdo: Sparkline, detalhe/recibo de venda, carrinho inteligente (agrupamento, +/- , persistência)
//  Linhas originais: 1143-1410
//  Carregar depois de core-*.js, db-indexeddb.js, sync-*.js, auth-supabase.js
// ====================================================================

let vendaAtual = null;

// ====================================================================
//  SPARKLINE — Linha fina, sem bolhas, sem brilhos
// ====================================================================
function desenharSparkline(canvasId, dados, cor = '#D4AF37') {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;
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
  const width = cssWidth;
  const height = cssHeight;

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
  if (dados.length >= 2) {
    const ultimoValor = dados[dados.length - 1];
    const penultimoValor = dados[dados.length - 2];
    const direcao = ultimoValor >= penultimoValor ? 1 : -1;
    const xSeta = lastX;
    const ySeta = lastY;
    const tamanhoSeta = 5;
    ctx.beginPath();
    if (direcao > 0) {
      ctx.moveTo(xSeta - tamanhoSeta, ySeta + tamanhoSeta);
      ctx.lineTo(xSeta, ySeta - tamanhoSeta);
      ctx.lineTo(xSeta + tamanhoSeta, ySeta + tamanhoSeta);
    } else {
      ctx.moveTo(xSeta - tamanhoSeta, ySeta - tamanhoSeta);
      ctx.lineTo(xSeta, ySeta + tamanhoSeta);
      ctx.lineTo(xSeta + tamanhoSeta, ySeta - tamanhoSeta);
    }
    ctx.closePath();
    ctx.fillStyle = cor;
    ctx.fill();
  }
}

// ====================================================================
//  DETALHE / RECIBO DE VENDA
// ====================================================================
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
  const mpIcon = { 'Numerário': '💵', 'Multicaixa Express': '📱', 'Transferência Bancária': '🏦', 'Cartão': '💳' } [mp] || '💳';
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
//  CARRINHO INTELIGENTE (agrupamento, +/- , persistência) — SEM PROFISSIONAL POR ITEM
// ====================================================================
let cartItems = [];
const CART_STORAGE_KEY = 'bp_cart_items';

// --- Persistência ---
function saveCartToStorage() {
  try { localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(cartItems)); } catch (e) {}
}

function loadCartFromStorage() {
  try {
    const data = localStorage.getItem(CART_STORAGE_KEY);
    if (data) {
      cartItems = JSON.parse(data);
      renderCart();
    }
  } catch (e) { cartItems = []; }
}

// --- Renderização do carrinho com botões + / - e total detalhado ---
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
      <span class="ci-qty-controls">
        <button class="qty-btn" data-idx="${idx}" data-action="decrement">−</button>
        <span class="qty-number">${item.quantidade}</span>
        <button class="qty-btn" data-idx="${idx}" data-action="increment">+</button>
      </span>
      <span class="ci-val">${fmtKz(item.subtotal)}</span>
      <button class="ci-del" data-idx="${idx}" aria-label="Remover item">✕</button>
    </div>
  `).join('');

  const total = cartItems.reduce((s, i) => s + i.subtotal, 0);
  const totalItems = cartItems.reduce((s, i) => s + i.quantidade, 0);
  if (totalArea) {
    totalArea.innerHTML = `
      <div class="cart-total-row">
        <span class="ct-label">Subtotal (${totalItems} itens)</span>
        <span class="ct-val">${fmtKz(total)}</span>
      </div>
    `;
  }

  saveCartToStorage();
}

// --- Ajustar quantidade ---
function adjustQuantity(idx, delta) {
  if (idx < 0 || idx >= cartItems.length) return;
  const item = cartItems[idx];
  const newQty = item.quantidade + delta;
  if (newQty <= 0) {
    cartItems.splice(idx, 1);
  } else {
    item.quantidade = newQty;
    item.subtotal = item.quantidade * item.precoUnit;
  }
  renderCart();
}

// --- Remover item (com confirmação) ---
function removeItemFromCart(idx) {
  if (idx < 0 || idx >= cartItems.length) return;
  const item = cartItems[idx];
  if (item.quantidade > 1) {
    const choice = confirm(`"${item.nome}" tem ${item.quantidade} unidades. Deseja remover todas?`);
    if (choice) {
      cartItems.splice(idx, 1);
    } else {
      adjustQuantity(idx, -(item.quantidade - 1));
    }
  } else {
    cartItems.splice(idx, 1);
  }
  renderCart();
}

// --- Função central de adição ao carrinho (sem profissional) ---
function addToCart(nome, valor) {
  const existingIndex = cartItems.findIndex(item => item.nome === nome);
  if (existingIndex !== -1) {
    // Se o preço for diferente, pergunta se quer atualizar
    const existing = cartItems[existingIndex];
    if (existing.precoUnit !== valor) {
      const choice = confirm(
        `"${nome}" já está no carrinho com preço ${fmtKz(existing.precoUnit)}.\n` +
        `Deseja atualizar para ${fmtKz(valor)}? (Cancelar = manter os dois separados)`
      );
      if (choice) {
        existing.precoUnit = valor;
        existing.subtotal = existing.quantidade * valor;
        renderCart();
        toast('Preço atualizado!', 'success');
        return;
      } else {
        // Adiciona como item separado com nome diferenciado
        cartItems.push({
          nome: `${nome} (${fmtKz(valor)})`,
          quantidade: 1,
          precoUnit: valor,
          subtotal: valor
        });
        renderCart();
        toast('Adicionado como item separado.', 'success');
        return;
      }
    }
    // Mesmo preço: incrementa
    existing.quantidade += 1;
    existing.subtotal = existing.quantidade * existing.precoUnit;
    renderCart();
    toast('Adicionado ao carrinho!', 'success');
    return;
  }

  // Novo item
  cartItems.push({
    nome,
    quantidade: 1,
    precoUnit: valor,
    subtotal: valor
  });
  renderCart();
  toast('Adicionado ao carrinho!', 'success');
}

// --- Event listeners (delegação para botões do carrinho) ---
document.addEventListener('click', function(e) {
  const qtyBtn = e.target.closest('.qty-btn');
  if (qtyBtn) {
    e.preventDefault();
    const idx = parseInt(qtyBtn.dataset.idx);
    const action = qtyBtn.dataset.action;
    if (action === 'increment') adjustQuantity(idx, 1);
    else if (action === 'decrement') adjustQuantity(idx, -1);
    return;
  }

  const delBtn = e.target.closest('.ci-del');
  if (delBtn) {
    e.preventDefault();
    const idx = parseInt(delBtn.dataset.idx);
    removeItemFromCart(idx);
    return;
  }
});

// --- Função de abertura do modal (restaurar carrinho) ---
function openVendaModal() {
  loadCartFromStorage();
  const clientSel = document.getElementById('venda-cliente');
  if (clientSel) {
    clientSel.innerHTML = (state.clientes || []).map(c =>
      `<option value="${escHtml(c.nome)}">${escHtml(c.nome)}</option>`
    ).join('');
  }
  populateVendaSelects();
  renderCart();
  openModal('modal-venda');
}

// --- Limpar carrinho (após venda ou cancelamento) ---
function clearCart() {
  cartItems = [];
  localStorage.removeItem(CART_STORAGE_KEY);
  renderCart();
}

// --- Expor funções globalmente (para outros ficheiros) ---
window.addToCart = addToCart;
window.clearCart = clearCart;
window.loadCartFromStorage = loadCartFromStorage;
window.saveCartToStorage = saveCartToStorage;

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
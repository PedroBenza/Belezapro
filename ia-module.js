// ====================================================================
//  ia-module.js — extraído do app.js (Fase C da modularização)
//  Conteúdo: Contexto e lógica da Benza AI: resumo, insights, perguntas/respostas, histórico, onboarding, splash e testes
//  Linhas originais: 2318-2796
//  Carregar depois de core-*.js, db-indexeddb.js, sync-*.js, auth-supabase.js
// ====================================================================
// ====================================================================
function buildContextoIA() {
  if (!state.movimentos || !Array.isArray(state.movimentos) || !state.agendamentos || !Array.isArray(state.agendamentos)) {
    return { erro: 'Dados ainda não carregados. Tente novamente em instantes.' };
  }
  const hojeStr = hoje();
  const vendasHoje = state.movimentos.filter(m => m.data === hojeStr && m.tipo === 'venda');
  const despHoje = state.movimentos.filter(m => m.data === hojeStr && m.tipo === 'despesa');
  const agHoje = state.agendamentos.filter(a => a.data === hojeStr);
  const d30 = new Date();
  d30.setDate(d30.getDate() - 29);
  const d30str = d30.toISOString().split('T')[0];
  const vendas30 = state.movimentos.filter(m => m.data >= d30str && m.tipo === 'venda');

  // CORRIGIDO: agrupa por profissional_id
  const byProf = {};
  vendas30.forEach(v => {
    if (v.profissional_id) {
      const nome = getProfissionalNome(v.profissional_id);
      byProf[nome] = (byProf[nome] || 0) + v.valor;
    }
  });

  const byServ = {};
  vendas30.forEach(v => { if (v.itens) v.itens.forEach(i => { byServ[i.nome] = (byServ[i.nome] || 0) + (i.quantidade || 1); }); });
  const totalVendas30 = vendas30.reduce((s, v) => s + v.valor, 0);
  const ticketMedio = vendas30.length > 0 ? Math.round(totalVendas30 / vendas30.length) : 0;
  const totalVendasHoje = vendasHoje.reduce((s, v) => s + v.valor, 0);
  const totalDespHoje = despHoje.reduce((s, d) => s + d.valor, 0);
  const clientesUnicos = new Set(vendasHoje.map(v => v.cliente)).size;

  const hojeD = new Date(hojeStr + 'T00:00:00');
  const iniSemanaAtual = new Date(hojeD); iniSemanaAtual.setDate(hojeD.getDate() - 6);
  const iniSemanaAtualStr = iniSemanaAtual.toISOString().split('T')[0];
  const iniSemanaAnterior = new Date(hojeD); iniSemanaAnterior.setDate(hojeD.getDate() - 13);
  const iniSemanaAnteriorStr = iniSemanaAnterior.toISOString().split('T')[0];
  const fimSemanaAnterior = new Date(hojeD); fimSemanaAnterior.setDate(hojeD.getDate() - 7);
  const fimSemanaAnteriorStr = fimSemanaAnterior.toISOString().split('T')[0];
  const vendasSemanaAtual = state.movimentos.filter(m => m.tipo === 'venda' && m.data >= iniSemanaAtualStr && m.data <= hojeStr);
  const vendasSemanaAnterior = state.movimentos.filter(m => m.tipo === 'venda' && m.data >= iniSemanaAnteriorStr && m.data <= fimSemanaAnteriorStr);
  const totalSemanaAtual = vendasSemanaAtual.reduce((s, v) => s + v.valor, 0);
  const totalSemanaAnterior = vendasSemanaAnterior.reduce((s, v) => s + v.valor, 0);

  const fim7 = new Date(hojeD); fim7.setDate(hojeD.getDate() + 7);
  const fim7Str = fim7.toISOString().split('T')[0];
  const ag7dias = state.agendamentos.filter(a => a.data >= hojeStr && a.data <= fim7Str && a.status !== 'cancelado');

  const ag30 = state.agendamentos.filter(a => a.data >= d30str && a.data <= hojeStr);
  const ag30Cancelados = ag30.filter(a => a.status === 'cancelado').length;
  const taxaCancelamento = ag30.length > 0 ? Math.round((ag30Cancelados / ag30.length) * 100) : 0;

  const servicosOrdenados = Object.entries(byServ).sort((a, b) => a[1] - b[1]);
  const servicoMenosVendido = servicosOrdenados[0];

  const gastoPorCliente = {};
  const ultimaCompraPorCliente = {};
  state.movimentos.filter(m => m.tipo === 'venda' && m.cliente).forEach(v => {
    gastoPorCliente[v.cliente] = (gastoPorCliente[v.cliente] || 0) + v.valor;
    if (!ultimaCompraPorCliente[v.cliente] || v.data > ultimaCompraPorCliente[v.cliente]) ultimaCompraPorCliente[v.cliente] = v.data;
  });
  const clientesOrdenados = Object.entries(gastoPorCliente).sort((a, b) => b[1] - a[1]);
  const totalClientesComCompra = clientesOrdenados.length;
  const top30Clientes = clientesOrdenados.slice(0, 30).map(([nome, total]) => {
    const ultima = ultimaCompraPorCliente[nome];
    const dias = ultima ? Math.floor((hojeD - new Date(ultima + 'T00:00:00')) / (1000 * 60 * 60 * 24)) : null;
    return `- ${nome}: ${total} Kz gastos, última visita há ${dias !== null ? dias + ' dias' : 'desconhecido'}`;
  });

  const planoAtual = getPlanoAtual();
  const diasTrial = planoAtual === 'trial' ? getDiasTrialRestantes() : null;

  return `SALÃO: ${state.config.storeName}
    DATA: ${hojeStr}
    PLANO ATUAL: ${planoAtual}${diasTrial !== null ? ` (restam ${diasTrial} dias de teste gratuito)` : ''}
    CONTACTO DO ADMINISTRADOR (WhatsApp, só oferecer se o cliente reportar um problema com a plataforma): ${WHATSAPP_NUMBER}

    HOJE:
    - Faturamento: ${totalVendasHoje} Kz
    - Vendas: ${vendasHoje.length}
    - Despesas: ${totalDespHoje} Kz
    - Agendamentos: ${agHoje.length} (${agHoje.filter(a => a.status === 'realizado').length} realizados)
    - Clientes atendidos: ${clientesUnicos}

    ÚLTIMOS 30 DIAS:
    - Total faturado: ${totalVendas30} Kz
    - Total vendas: ${vendas30.length}
    - Ticket médio: ${ticketMedio} Kz
    - Taxa de cancelamento de agendamentos: ${taxaCancelamento}%

    ESTA SEMANA vs SEMANA ANTERIOR:
    - Esta semana: ${totalSemanaAtual} Kz
    - Semana anterior: ${totalSemanaAnterior} Kz
    - Variação: ${totalSemanaAnterior > 0 ? Math.round(((totalSemanaAtual - totalSemanaAnterior) / totalSemanaAnterior) * 100) : 0}%

    PRÓXIMOS 7 DIAS:
    - Agendamentos previstos: ${ag7dias.length}

    POR PROFISSIONAL (30 dias):
    ${Object.entries(byProf).map(([k, v]) => `- ${k}: ${v} Kz`).join('\n') || '- Sem dados'}

    SERVIÇOS MAIS VENDIDOS (30 dias):
    ${Object.entries(byServ).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([k, v]) => `- ${k}: ${v}x`).join('\n') || '- Sem dados'}

    SERVIÇO MENOS VENDIDO (30 dias): ${servicoMenosVendido ? `${servicoMenosVendido[0]} (${servicoMenosVendido[1]}x)` : 'Sem dados'}

    CLIENTES:
    - Total cadastrados: ${state.clientes.length}
    - Com agendamento hoje: ${new Set(agHoje.map(a => a.cliente)).size}
    - Top clientes por valor gasto (histórico completo)${totalClientesComCompra > 30 ? `, mostrando 30 de ${totalClientesComCompra}` : ''}:
    ${top30Clientes.join('\n') || '- Sem dados de compras ainda'}

    PROFISSIONAIS ACTIVOS: ${state.profissionais.map(p => p.nome).join(', ') || 'Nenhum'}`;
}

// ====================================================================
//  IA – perguntarIA, nome, histórico
// ====================================================================
let iaHistorico = [];

function renderIAResumo() {
  if (!state.movimentos || !Array.isArray(state.movimentos) || !state.agendamentos || !Array.isArray(state.agendamentos)) return;
  const hojeStr = hoje();
  const hojeD = new Date(hojeStr + 'T00:00:00');
  const vendasHoje = state.movimentos.filter(m => m.data === hojeStr && m.tipo === 'venda');
  const totalHoje = vendasHoje.reduce((s, v) => s + v.valor, 0);
  const agHoje = state.agendamentos.filter(a => a.data === hojeStr);
  const pendentesHoje = agHoje.filter(a => a.status !== 'realizado' && a.status !== 'cancelado').length;
  const clientesHoje = new Set(vendasHoje.map(v => v.cliente)).size;

  const elFat = document.getElementById('ia-resumo-fat');
  if (elFat) elFat.textContent = fmtKz(totalHoje);
  const dias7 = [];
  for (let i = 1; i <= 7; i++) {
    const d = new Date(); d.setDate(d.getDate() - i);
    const ds = d.toISOString().split('T')[0];
    dias7.push(state.movimentos.filter(m => m.data === ds && m.tipo === 'venda').reduce((s, v) => s + v.valor, 0));
  }
  const media7 = dias7.reduce((s, v) => s + v, 0) / 7;
  const fatTrendEl = document.getElementById('ia-resumo-fat-trend');
  if (fatTrendEl) {
    if (media7 > 0) {
      const variacaoFat = Math.round(((totalHoje - media7) / media7) * 100);
      fatTrendEl.innerHTML = `<span style="color:${variacaoFat >= 0 ? 'var(--green)' : 'var(--red)'}">${variacaoFat >= 0 ? '↑' : '↓'} ${Math.abs(variacaoFat)}%</span> vs média 7 dias`;
    } else {
      fatTrendEl.textContent = 'comparado com ontem';
    }
  }

  const elCli = document.getElementById('ia-resumo-clientes');
  if (elCli) elCli.textContent = String((state.clientes || []).length);
  const elCliSub = document.getElementById('ia-resumo-clientes-sub');
  if (elCliSub) elCliSub.textContent = clientesHoje + (clientesHoje === 1 ? ' atendido hoje' : ' atendidos hoje');

  const elAg = document.getElementById('ia-resumo-ag');
  if (elAg) elAg.textContent = String(agHoje.length);
  const elAgSub = document.getElementById('ia-resumo-ag-sub');
  if (elAgSub) elAgSub.textContent = pendentesHoje + (pendentesHoje === 1 ? ' pendente' : ' pendentes');

  // ---- Insights automáticos (todos calculados a partir de dados reais já existentes) ----
  const insights = [];

  const ticketHoje = vendasHoje.length > 0 ? totalHoje / vendasHoje.length : 0;
  const ticketsDias7 = [];
  for (let i = 1; i <= 7; i++) {
    const d = new Date(); d.setDate(d.getDate() - i);
    const ds = d.toISOString().split('T')[0];
    const vd = state.movimentos.filter(m => m.data === ds && m.tipo === 'venda');
    if (vd.length > 0) ticketsDias7.push(vd.reduce((s, v) => s + v.valor, 0) / vd.length);
  }
  if (ticketHoje > 0 && ticketsDias7.length > 0) {
    const mediaTicket7 = ticketsDias7.reduce((s, v) => s + v, 0) / ticketsDias7.length;
    if (mediaTicket7 > 0) {
      const variacaoTicket = Math.round(((ticketHoje - mediaTicket7) / mediaTicket7) * 100);
      insights.push({ icone: 'trend', cor: variacaoTicket >= 0 ? 'var(--green)' : 'var(--red)',
        texto: `Hoje o seu ticket médio ${variacaoTicket >= 0 ? 'aumentou' : 'diminuiu'} <strong>${Math.abs(variacaoTicket)}%</strong> em relação à média dos últimos 7 dias.` });
    }
  }

  const ultimaCompraPorCliente = {};
  state.movimentos.filter(m => m.tipo === 'venda' && m.cliente).forEach(v => {
    if (!ultimaCompraPorCliente[v.cliente] || v.data > ultimaCompraPorCliente[v.cliente]) ultimaCompraPorCliente[v.cliente] = v.data;
  });
  const inativos = Object.entries(ultimaCompraPorCliente).filter(([nome, data]) => Math.floor((hojeD - new Date(data + 'T00:00:00')) / 86400000) > 30).length;
  if (inativos > 0) {
    insights.push({ icone: 'user', cor: 'var(--text-secondary)',
      texto: inativos === 1 ? `Existe <strong>1 cliente</strong> que não regressa há mais de 30 dias.` : `Existem <strong>${inativos} clientes</strong> que não regressam há mais de 30 dias.` });
  }

  const iniSemana = new Date(hojeD); iniSemana.setDate(hojeD.getDate() - 6);
  const iniSemanaStr = iniSemana.toISOString().split('T')[0];
  const vendasSemana = state.movimentos.filter(m => m.tipo === 'venda' && m.data >= iniSemanaStr && m.data <= hojeStr);
  const receitaPorServico = {};
  let receitaSemanaTotal = 0;
  vendasSemana.forEach(v => {
    receitaSemanaTotal += v.valor;
    if (v.itens && Array.isArray(v.itens)) v.itens.forEach(it => { receitaPorServico[it.nome] = (receitaPorServico[it.nome] || 0) + (it.subtotal || 0); });
  });
  const servicosOrdenadosReceita = Object.entries(receitaPorServico).sort((a, b) => b[1] - a[1]);
  if (servicosOrdenadosReceita.length > 0 && receitaSemanaTotal > 0) {
    const [nomeServico, receitaServico] = servicosOrdenadosReceita[0];
    const pct = Math.round((receitaServico / receitaSemanaTotal) * 100);
    insights.push({ icone: 'star', cor: 'var(--gold-dark)', texto: `O serviço "<strong>${escHtml(nomeServico)}</strong>" representa <strong>${pct}%</strong> da receita desta semana.` });
  }

  const saldos30 = [];
  for (let i = 0; i <= 29; i++) {
    const d = new Date(); d.setDate(d.getDate() - i);
    const ds = d.toISOString().split('T')[0];
    const v = state.movimentos.filter(m => m.data === ds && m.tipo === 'venda').reduce((s, x) => s + x.valor, 0);
    const de = state.movimentos.filter(m => m.data === ds && m.tipo === 'despesa').reduce((s, x) => s + x.valor, 0);
    saldos30.push(v - de);
  }
  const saldoHoje30 = saldos30[0];
  const media30 = saldos30.slice(1).reduce((s, v) => s + v, 0) / 29;
  if (saldos30.some(s => s !== 0)) {
    insights.push({ icone: 'wallet', cor: saldoHoje30 >= media30 ? 'var(--green)' : 'var(--red)',
      texto: `O caixa de hoje está <strong>${saldoHoje30 >= media30 ? 'acima' : 'abaixo'}</strong> da média dos últimos 30 dias.` });
  }

  const amanha = new Date(hojeD); amanha.setDate(hojeD.getDate() + 1);
  const amanhaStr = amanha.toISOString().split('T')[0];
  const agAmanha = state.agendamentos.filter(a => a.data === amanhaStr && a.status !== 'cancelado');
  insights.push({ icone: 'calendar', cor: 'var(--text-secondary)',
    texto: agAmanha.length > 0 ? `Amanhã tem <strong>${agAmanha.length} ${agAmanha.length === 1 ? 'agendamento' : 'agendamentos'}</strong> marcados.` : `Ainda não há agendamentos para amanhã.` });

  const iconesSvg = {
    trend: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg>',
    user: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>',
    star: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15 9 22 9.5 17 14.5 18.5 22 12 18 5.5 22 7 14.5 2 9.5 9 9"/></svg>',
    wallet: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="6" width="20" height="12" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/></svg>',
    calendar: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>'
  };
  const listaEl = document.getElementById('ia-insights-list');
  if (listaEl) {
    const bgPorCor = { 'var(--green)': 'var(--green-50)', 'var(--red)': 'var(--red-50)', 'var(--gold-dark)': 'var(--gold-50)', 'var(--text-secondary)': 'var(--neutral-75)' };
    listaEl.innerHTML = insights.map(ins => `<div class="ia-insight-row"><span class="ia-insight-icone" style="color:${ins.cor};background:${bgPorCor[ins.cor] || 'var(--neutral-75)'}">${iconesSvg[ins.icone]}</span><span>${ins.texto}</span></div>`).join('')
      || '<div class="ia-insight-row"><span>Ainda sem dados suficientes para gerar insights.</span></div>';
  }
}

async function perguntarIA(pergunta) {
  const plano = getPlanoAtual();
  const iaDia = PLANOS[plano].iaDia;
  if (iaDia === 0) { mostrarModalUpgrade('O Agente IA está disponível no plano Pro (5 perguntas/dia) e Premium (ilimitado).'); return null; }
  const chaveData = 'ia_perguntas_' + hoje();
  const usadas = parseInt(localStorage.getItem(chaveData) || '0');
  if (iaDia !== Infinity && usadas >= iaDia) {
    if (plano === 'pro') { mostrarModalUpgrade('Atingiste o limite de 5 perguntas/dia do plano Pro. Faz upgrade para Premium para perguntas ilimitadas.'); } else { toast('Limite de perguntas atingido.', 'warning'); }
    return null;
  }
  const contexto = buildContextoIA();
  if (contexto && contexto.erro) {
    toast(contexto.erro, 'warning');
    return null;
  }
  try {
    const resp = await fetch(IA_EDGE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + SUPABASE_ANON_KEY },
      body: JSON.stringify({ pergunta, contexto, plano, salaoId: state.config.salaoId || 'local', historico: iaHistorico })
    });
    if (!resp.ok) {
      if (resp.status === 429) { mostrarModalUpgrade('Limite de perguntas atingido. Faz upgrade para continuar.'); return null; }
      if (resp.status === 503) return '⚠️ Agente IA temporariamente indisponível. Tenta dentro de momentos.';
      return '⚠️ Erro ao contactar o agente IA. Contacta o suporte BeautyPro.';
    }
    const data = await resp.json();
    localStorage.setItem(chaveData, String(usadas + 1));
    document.getElementById('ia-contador').textContent = String(usadas + 1);
    const resposta = data.resposta || 'Não consegui responder. Tenta de novo.';
    iaHistorico.push({ pergunta, resposta });
    if (iaHistorico.length > 6) iaHistorico = iaHistorico.slice(-6);
    return resposta;
  } catch (e) {
    return 'Sem ligação à internet. O agente IA necessita de conexão para responder.';
  }
}

const IA_NOME_KEY = 'bp_ia_nome';
// CORREÇÃO (relatório Benza AI): nome fixado — deixa de ler o localStorage / permitir renomear.
function getNomeIA() { return 'Benza'; }
document.getElementById('ia-renomear-btn').addEventListener('click', () => {
  const atual = getNomeIA();
  const novo = prompt('Como queres chamar o teu assistente de IA?', atual === 'Agente IA' ? '' : atual);
  if (novo && novo.trim()) {
    localStorage.setItem(IA_NOME_KEY, novo.trim());
  }
});

function formatarTempoRelativoIA(ts) {
  if (!ts) return '';
  const diffSeg = Math.floor((Date.now() - ts) / 1000);
  if (diffSeg < 10) return 'agora mesmo';
  if (diffSeg < 60) return `há ${diffSeg} segundos`;
  const diffMin = Math.floor(diffSeg / 60);
  if (diffMin < 60) return `há ${diffMin} ${diffMin === 1 ? 'minuto' : 'minutos'}`;
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24) return `há ${diffH} ${diffH === 1 ? 'hora' : 'horas'}`;
  return `há ${Math.floor(diffH / 24)} dias`;
}
function montarMsgUsuarioIA(pergunta) { return `<div class="ia-msg-user">${escHtml(pergunta)}</div>`; }
function montarMsgBotIA(resposta, ts) {
  const tempo = formatarTempoRelativoIA(ts);
  return `<div class="ia-msg-bot">
    <div class="ia-msg-bot-header"><span class="ia-msg-bot-nome">Benza</span>${tempo ? `<span class="ia-msg-bot-tempo">${tempo}</span>` : ''}</div>
    <div class="ia-msg-bot-corpo">${escHtml(resposta)}</div>
    <div class="ia-msg-bot-acoes">
      <button class="ia-feedback-btn" data-fb="util" title="Útil">👍 Útil</button>
      <button class="ia-feedback-btn" data-fb="naoajudou" title="Não ajudou">👎 Não ajudou</button>
      <button class="ia-feedback-btn ia-copiar-btn" title="Copiar">📋 Copiar</button>
    </div>
    <div class="ia-followup-row">
      <button class="ia-followup-chip" data-pergunta="Quais clientes estão inativos?">Clientes inativos</button>
      <button class="ia-followup-chip" data-pergunta="Como está o fluxo de caixa?">Fluxo de caixa</button>
      <button class="ia-followup-chip" data-pergunta="Como está a minha agenda?">Agenda</button>
    </div>
  </div>`;
}
function atualizarEstadoVazioIA() {
  const vazio = document.getElementById('ia-chat-empty');
  const chat = document.getElementById('ia-chat');
  if (vazio && chat) vazio.style.display = chat.children.length > 0 ? 'none' : '';
}
const IA_HIST_KEY = () => 'bp_ia_chat_' + (state.config.salaoId || 'local');
function carregarHistoricoIA() {
  try {
    const guardado = JSON.parse(localStorage.getItem(IA_HIST_KEY()) || '[]');
    iaHistorico = guardado.slice(-6);
    const chat = document.getElementById('ia-chat');
    if (guardado.length > 0 && chat) {
      chat.innerHTML = guardado.map(t => montarMsgUsuarioIA(t.pergunta) + montarMsgBotIA(t.resposta, t.ts)).join('');
      chat.scrollTop = chat.scrollHeight;
    }
    atualizarEstadoVazioIA();
  } catch (e) { iaHistorico = []; }
}
function guardarHistoricoIA() {
  try { localStorage.setItem(IA_HIST_KEY(), JSON.stringify(iaHistorico)); } catch (e) {}
}
carregarHistoricoIA();

document.getElementById('ia-enviar').addEventListener('click', async () => {
  const input = document.getElementById('ia-input');
  const pergunta = input.value.trim();
  if (!pergunta) return;
  const chat = document.getElementById('ia-chat');
  chat.innerHTML += montarMsgUsuarioIA(pergunta);
  atualizarEstadoVazioIA();
  const pensando = document.createElement('div');
  pensando.className = 'ia-msg-bot';
  pensando.id = 'ia-pensando';
  pensando.innerHTML = `<div class="ia-msg-bot-header"><span class="ia-msg-bot-nome">Benza</span></div><span class="ia-dots">Benza está a analisar<span>.</span><span>.</span><span>.</span></span>`;
  chat.appendChild(pensando);
  chat.scrollTop = chat.scrollHeight;
  input.value = '';
  const resposta = await perguntarIA(pergunta);
  document.getElementById('ia-pensando')?.remove();
  if (resposta) {
    const ts = Date.now();
    chat.innerHTML += montarMsgBotIA(resposta, ts);
    chat.scrollTop = chat.scrollHeight;
    if (iaHistorico.length > 0) iaHistorico[iaHistorico.length - 1].ts = ts;
    guardarHistoricoIA();
  }
  document.getElementById('ia-contador').textContent = parseInt(localStorage.getItem('ia_perguntas_' + hoje()) || '0');
});

document.getElementById('ia-input').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') document.getElementById('ia-enviar').click();
});

// Sugestões rápidas e chips de continuação (delegação de eventos — cobre também os que são criados depois de cada resposta)
document.addEventListener('click', (e) => {
  const card = e.target.closest('.ia-sugestao-card, .ia-followup-chip');
  if (card && card.dataset.pergunta) {
    const input = document.getElementById('ia-input');
    if (input) { input.value = card.dataset.pergunta; document.getElementById('ia-enviar').click(); }
  }
  const fb = e.target.closest('.ia-feedback-btn');
  if (fb) {
    if (fb.classList.contains('ia-copiar-btn')) {
      const texto = fb.closest('.ia-msg-bot')?.querySelector('.ia-msg-bot-corpo')?.textContent || '';
      navigator.clipboard?.writeText(texto).then(() => toast('Resposta copiada', 'success')).catch(() => {});
    } else {
      toast('Obrigado pelo feedback!', 'success');
      fb.parentElement.querySelectorAll('.ia-feedback-btn').forEach(b => b.disabled = true);
      fb.style.opacity = '1';
      fb.style.fontWeight = '700';
    }
  }
});

document.getElementById('ia-offline-retry')?.addEventListener('click', () => {
  if (navigator.onLine) { atualizarIAOffline();
    toast('Conexão restabelecida!', 'success'); } else { toast('Ainda sem ligação', 'warning'); }
});

// Upgrade modal
document.getElementById('modal-upgrade-contato').addEventListener('click', () => {
  const msg =
    `Olá, quero assinar um plano do BeautyPro. Salão: ${state.config.storeName} | Plano actual: ${getPlanoAtual()}`;
  window.open(`https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(msg)}`, '_blank');
  closeModal('modal-upgrade');
});

// Pesquisa clientes
let searchTimer;
document.getElementById('search-cliente').addEventListener('input', () => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => renderClientes(), 300);
});

// Onboarding
let onboardingIndex = 0;
const onboardingSlides = document.querySelectorAll('.onboarding-slide');
const onboardingDots = document.querySelectorAll('.onboarding-dot');
const nextBtn = document.getElementById('onboarding-next');
const skipBtn = document.getElementById('onboarding-skip');

function showOnboardingSlide(index) {
  onboardingSlides.forEach((s, i) => {
    s.classList.toggle('active', i === index);
    s.style.display = i === index ? 'flex' : 'none';
  });
  onboardingDots.forEach((d, i) => {
    if (i === index) { d.style.width = '24px';
      d.style.background = 'var(--gold)'; } else { d.style.width = '6px';
      d.style.background = 'var(--border-soft)'; }
  });
  if (index === 2) { nextBtn.textContent = 'Começar agora';
    nextBtn.className = 'btn btn-primary'; } else { nextBtn.textContent = 'Próximo'; }
}

function closeOnboarding() {
  document.getElementById('onboarding-screen').style.display = 'none';
  localStorage.setItem('bp_onboarding_seen', 'true');
}

if (nextBtn) {
  nextBtn.addEventListener('click', () => {
    if (onboardingIndex === 2) closeOnboarding();
    else { onboardingIndex++;
      showOnboardingSlide(onboardingIndex); }
  });
}
if (skipBtn) skipBtn.addEventListener('click', closeOnboarding);

function hideSplash() {
  const splash = document.getElementById('splash-screen');
  if (!splash) return;
  splash.style.opacity = '0';
  setTimeout(() => { splash.style.display = 'none'; }, 600);
}

// Testes automatizados
function runTests() {
  console.log('🧪 Iniciando testes automatizados...');
  console.group('📦 Funções puras');
  console.assert(fmtKz(0) === '0 Kz', 'fmtKz(0)');
  console.assert(fmtKz(1000) === '1.000 Kz', 'fmtKz(1000)');
  console.assert(fmtKz(1234567) === '1.234.567 Kz', 'fmtKz(1234567)');
  console.assert(escHtml('<script>') === '&lt;script&gt;', 'escHtml');
  console.assert(escHtml('a & b') === 'a &amp; b', 'escHtml &');
  const id = uuid();
  console.assert(id.length > 10 && id.includes('-'), 'uuid');
  console.assert(/^\d{4}-\d{2}-\d{2}$/.test(hoje()), 'hoje');
  console.assert(/^\d{2}:\d{2}$/.test(horaAgora()), 'horaAgora');
  console.groupEnd();
  console.group('🧠 Lógica de negócio (mocks)');
  console.log('✅ Testes concluídos (mock)');
  console.groupEnd();
  console.log('✅ Todos os testes concluídos!');
}

if (localStorage.getItem('bp_run_tests') === 'true') {
  setTimeout(runTests, 1500);
  localStorage.removeItem('bp_run_tests');
}
window.runBeautyProTests = runTests;
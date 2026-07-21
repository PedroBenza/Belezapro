// ====================================================================
//  eventos-globais.js — extraído do app.js (Fase C da modularização)
//  Conteúdo: Eventos: navegação da agenda, menu de linha, online/offline, overlays de modal
//  Linhas originais: 2110-2317
//  Carregar depois de core-*.js, db-indexeddb.js, sync-*.js, auth-supabase.js
// ====================================================================
const originalMudarAgenda = window.mudarAgenda;
if (originalMudarAgenda) {
  window.mudarAgenda = function(delta) {
    const container = document.getElementById('agenda-full-list');
    if (!container) { originalMudarAgenda(delta); return; }
    container.classList.add('agenda-slide-out');
    setTimeout(() => {
      originalMudarAgenda(delta);
      container.classList.remove('agenda-slide-out');
      container.classList.add('agenda-slide-in');
      setTimeout(() => container.classList.remove('agenda-slide-in'), 300);
    }, 150);
  };
}

document.getElementById('agenda-prev').addEventListener('click', () => mudarAgenda(-1));
document.getElementById('agenda-next').addEventListener('click', () => mudarAgenda(1));

// Duplo clique no nome do salão
document.getElementById('store-name-display')?.addEventListener('dblclick', () => {
  const equipaNav = document.querySelector('.nav-item[data-tab="equipa"]');
  if (equipaNav && equipaNav.style.display !== 'none') equipaNav.click();
});

// Ripple global
document.addEventListener('click', function(e) {
  const target = e.target.closest('.btn, .list-item, .card, .kpi-card, .nav-item, .venda-cta-bar, .fab, .prof-card');
  if (target && !target.closest('.btn.is-loading')) {
    addRipple(target, e);
  }
});

// ====================================================================
//  MENU DE ACÇÕES DA LINHA (⋮)
// ====================================================================
function abrirMenuLinha(anchorEl, tipo, id) {
  const menu = document.getElementById('row-menu');
  const editLabel = document.getElementById('row-menu-edit-label');
  const delBtn = document.getElementById('row-menu-delete');
  const papel = normalizarRole(state.config.userRole);

  const config = {
    cliente:      { editLabel: 'Ajustar perfil', delAction: 'del-cliente', podeEliminar: papel === 'admin' || papel === 'gerente' },
    profissional: { editLabel: 'Ajustar',         delAction: 'del-p',       podeEliminar: papel === 'admin' },
    servico:      { editLabel: 'Ajustar',         delAction: 'del-servico', podeEliminar: papel === 'admin' },
  }[tipo];
  if (!config) return;

  if (menu.classList.contains('is-open') && menu.dataset.id === id && menu.dataset.tipo === tipo) {
    fecharMenuLinha();
    return;
  }

  editLabel.textContent = config.editLabel;
  menu.dataset.tipo = tipo;
  menu.dataset.id = id;
  delBtn.dataset.action = config.delAction;
  delBtn.dataset.id = id;
  delBtn.style.display = config.podeEliminar ? 'flex' : 'none';

  document.querySelectorAll('.row-menu-btn.is-open').forEach(b => b.classList.remove('is-open'));
  anchorEl.classList.add('is-open');

  menu.style.display = 'flex';
  const rect = anchorEl.getBoundingClientRect();
  const menuWidth = menu.offsetWidth || 168;
  const menuHeight = menu.offsetHeight || 90;
  let left = rect.right - menuWidth;
  if (left < 8) left = 8;
  let top = rect.bottom + 6;
  if (top + menuHeight > window.innerHeight - 8) top = rect.top - menuHeight - 6;
  menu.style.left = left + 'px';
  menu.style.top = top + 'px';
  requestAnimationFrame(() => menu.classList.add('is-open'));
  window._lastMenuTrigger = anchorEl;
  const firstItem = menu.querySelector('.row-menu-item:not([style*="display: none"])');
  if (firstItem) setTimeout(() => firstItem.focus(), 50);
}

function fecharMenuLinha() {
  const menu = document.getElementById('row-menu');
  if (!menu.classList.contains('is-open')) return;
  menu.classList.remove('is-open');
  document.querySelectorAll('.row-menu-btn.is-open').forEach(b => b.classList.remove('is-open'));
  setTimeout(() => {
    if (!menu.classList.contains('is-open')) menu.style.display = 'none';
    if (window._lastMenuTrigger) {
      window._lastMenuTrigger.focus();
      window._lastMenuTrigger = null;
    }
  }, 150);
}

document.addEventListener('click', (e) => {
  if (e.target.closest('#row-menu') || e.target.closest('[data-action="row-menu"]')) return;
  fecharMenuLinha();
});

document.getElementById('row-menu-edit').addEventListener('click', () => {
  const menu = document.getElementById('row-menu');
  const tipo = menu.dataset.tipo;
  const id = menu.dataset.id;
  if (tipo === 'cliente') openEditCliente(id);
  else if (tipo === 'profissional') openEditProf(id);
  else if (tipo === 'servico') openServicoModal(id);
});
// Confirm nativo substituído
document.addEventListener('click', async function(e) {
  const rowMenuBtn = e.target.closest('[data-action="row-menu"]');
  if (rowMenuBtn) {
    e.preventDefault();
    e.stopPropagation();
    abrirMenuLinha(rowMenuBtn, rowMenuBtn.dataset.tipo, rowMenuBtn.dataset.id);
    return;
  }

  if (e.target.closest('.row-menu-item')) {
    fecharMenuLinha();
  }

  const target = e.target.closest('[data-action="cancelar-agenda"]');
  if (target) {
    e.preventDefault();
    e.stopPropagation();
    const id = target.dataset.id;
    const ag = state.agendamentos.find(a => a.id === id);
    if (!ag) return;
    const confirmed = await showConfirmModal('Cancelar Agendamento?', `Tem a certeza que quer cancelar o agendamento de ${ag.cliente} para ${ag.servico}? Esta acção não pode ser desfeita.`, true);
    if (confirmed) { await deleteAgendamento(id);
      toast('Agendamento cancelado', 'warning'); }
    return;
  }

  const delProf = e.target.closest('[data-action="del-p"]');
  if (delProf) {
    e.preventDefault();
    e.stopPropagation();
    if (normalizarRole(state.config.userRole) !== 'admin') {
      toast('Não tem permissão para executar esta acção.', 'error');
      return;
    }
    const id = delProf.dataset.id;
    const prof = state.profissionais.find(p => p.id === id);
    if (!prof) return;
    const confirmed = await showConfirmModal('Remover Profissional?', `Tem a certeza que quer remover ${prof.nome}? Esta acção não pode ser desfeita.`, true);
    if (confirmed) await deleteProfissional(id);
    return;
  }

  const delServ = e.target.closest('[data-action="del-servico"]');
  if (delServ) {
    e.preventDefault();
    e.stopPropagation();
    if (normalizarRole(state.config.userRole) !== 'admin') {
      toast('Não tem permissão para executar esta acção.', 'error');
      return;
    }
    const id = delServ.dataset.id;
    const serv = state.servicos.find(s => s.id === id);
    if (!serv) return;
    const confirmed = await showConfirmModal('Eliminar Serviço?', `Tem a certeza que quer eliminar "${serv.nome}"? Esta acção não pode ser desfeita.`, true);
    if (confirmed) await deleteServico(id);
    return;
  }

  const delCliente = e.target.closest('[data-action="del-cliente"]');
  if (delCliente) {
    e.preventDefault();
    e.stopPropagation();
    const papel = normalizarRole(state.config.userRole);
    if (papel !== 'admin' && papel !== 'gerente') {
      toast('Não tem permissão para executar esta acção.', 'error');
      return;
    }
    const id = delCliente.dataset.id;
    const cli = state.clientes.find(c => c.id === id);
    if (!cli) return;
    const confirmed = await showConfirmModal('Eliminar Cliente?', `Tem a certeza que quer eliminar "${cli.nome}"? Esta acção não pode ser desfeita.`, true);
    if (confirmed) await deleteCliente(id);
    return;
  }
}, true);

// ONLINE/OFFLINE
window.addEventListener('online', () => {
  const container = document.getElementById('sync-status-container');
  if (container) container.style.display = 'none';
  document.getElementById('sync-dot')?.classList.add('online');
  document.getElementById('offline-banner')?.classList.remove('show');
  atualizarIAOffline();
  flushSyncQueue().then(atualizarIndicadorSync);
});

window.addEventListener('offline', () => {
  const container = document.getElementById('sync-status-container');
  if (container) container.style.display = 'flex';
  document.getElementById('sync-dot')?.classList.remove('online');
  document.getElementById('offline-banner')?.classList.add('show');
  atualizarIAOffline();
});

// Fechar modais ao clicar no overlay
document.querySelectorAll('.modal-overlay').forEach(el => {
  el.addEventListener('click', (e) => { if (e.target === el) closeModal(el.id); });
});

// ====================================================================
//  IA – buildContextoIA (CORRIGIDO: usa profissional_id)

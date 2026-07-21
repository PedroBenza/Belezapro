// ====================================================================
//  ui-events-navegacao.js — extraído do app.js (Fase C da modularização)
//  Conteúdo: Ativação de abas e sistema de permissões por papel
//  Linhas originais: 1629-1683
//  Carregar depois de core-*.js, db-indexeddb.js, sync-*.js, auth-supabase.js
// ====================================================================

function ativarAbaAtiva() {
  const pane = document.getElementById('tab-' + activeTab);
  if (!pane) return;
  document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));
  pane.classList.add('active');
  document.querySelectorAll('.nav-item').forEach(n => {
    n.classList.remove('active');
    n.setAttribute('aria-selected', 'false');
  });
  const navBtn = document.querySelector('.nav-item[data-tab="' + activeTab + '"]');
  if (navBtn) {
    navBtn.classList.add('active');
    navBtn.setAttribute('aria-selected', 'true');
  }
}

// ====================================================================
//  RBAC
// ====================================================================
function normalizarRole(role) {
  if (RBAC_ROLES.includes(role)) return role;
  if (role) console.warn('[RBAC] role desconhecido recebido do perfil ("' + role + '") — a aplicar acesso mínimo (operador).');
  return 'operador';
}

function aplicarPermissoes() {
  const role = normalizarRole(state.config.userRole);
  state.config.userRole = role;

  document.querySelectorAll('[data-role]').forEach(el => {
    const allowed = el.dataset.role.split(',').map(r => r.trim());
    const permitido = allowed.includes(role);
    if (el.dataset.roleMode === 'disable') {
      el.disabled = !permitido;
      el.style.opacity = permitido ? '' : '0.45';
      el.style.pointerEvents = permitido ? '' : 'none';
      el.title = permitido ? '' : 'Acção não disponível para o seu papel de utilizador';
    } else {
      el.style.display = permitido ? '' : 'none';
    }
  });

  const equipaNav = document.querySelector('.nav-item[data-tab="equipa"]');
  const tabEquipaAtiva = document.getElementById('tab-equipa')?.classList.contains('active');
  if (equipaNav && equipaNav.style.display === 'none' && tabEquipaAtiva) {
    equipaNav.parentElement?.querySelector('.nav-item[data-tab="dashboard"]')?.click();
    toast('Não tem permissão para aceder a essa área.', 'error');
  }
}

// ====================================================================
//  EVENT LISTENERS
// ====================================================================
// (Login handler movido para auth-supabase.js)

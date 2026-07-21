// ====================================================================
//  eventos-cadastros.js — extraído do app.js (Fase C da modularização)
//  Conteúdo: Eventos: login/menu/logout, nova venda, agenda, clientes e profissionais
//  Linhas originais: 1684-1876
//  Carregar depois de core-*.js, db-indexeddb.js, sync-*.js, auth-supabase.js
// ====================================================================
document.getElementById('signup-link')?.addEventListener('click', (e) => {
  e.preventDefault();
  toast('Peça ao administrador para criar a sua conta.', 'warning');
});

// Menu hambúrguer do header (substitui o antigo botão de logout direto)
document.getElementById('menu-btn')?.addEventListener('click', function(e) {
  e.stopPropagation();
  const dropdown = document.getElementById('menu-dropdown');
  const aberto = dropdown.style.display === 'block';
  dropdown.style.display = aberto ? 'none' : 'block';
  this.setAttribute('aria-expanded', aberto ? 'false' : 'true');
});
document.addEventListener('click', function(e) {
  const dropdown = document.getElementById('menu-dropdown');
  const menuBtn = document.getElementById('menu-btn');
  if (dropdown && dropdown.style.display === 'block' && !dropdown.contains(e.target) && e.target !== menuBtn) {
    dropdown.style.display = 'none';
    menuBtn?.setAttribute('aria-expanded', 'false');
  }
});

document.getElementById('logout-btn')?.addEventListener('click', async function() {
  document.getElementById('menu-dropdown').style.display = 'none';
  logoutVoluntarioEmCurso = true;
  const confirmed = await showConfirmModal('Sair da aplicação', 'Tem a certeza que quer sair?', false);
  if (!confirmed) logoutVoluntarioEmCurso = false;
  if (confirmed) {
    await supabaseClient.auth.signOut();
    location.reload();
  }
});

document.getElementById('nova-venda-hero-btn').addEventListener('click', openVendaModal);

document.getElementById('fab-agendar').addEventListener('click', () => {
  const sel = document.getElementById('agenda-cliente');
  sel.innerHTML = '<option value="">Selecionar cliente</option>' + state.clientes.map(c =>
    `<option value="${escHtml(c.nome)}">${escHtml(c.nome)}</option>`).join('');
  populateAgendaSelects();
  const now = new Date();
  const isoNow = now.toISOString().slice(0, 16);
  const dtInput = document.getElementById('agenda-datetime');
  dtInput.value = isoNow;
  dtInput.min = isoNow;
  openModal('modal-agenda');
});

// CORREÇÃO: modal-agenda-save separa ID e nome do profissional
document.getElementById('modal-agenda-save').addEventListener('click', async () => {
  const cliente = document.getElementById('agenda-cliente').value;
  const servico = document.getElementById('agenda-servico').value;
  const profissionalId = document.getElementById('agenda-profissional').value;
  const datetime = document.getElementById('agenda-datetime').value;
  const preco = parseFloat(document.getElementById('agenda-preco').value);
  if (!cliente || !servico || !datetime) { toast('Preencha todos os campos obrigatórios', 'error'); return; }
  if (isNaN(preco) || preco <= 0) { toast('Insira um preço válido', 'error'); return; }
  const data = datetime.split('T')[0];
  const hora = datetime.split('T')[1].slice(0, 5);
  // Buscar o nome do profissional a partir do ID
  const profObj = state.profissionais.find(p => p.id === profissionalId);
  const profissionalNome = profObj ? profObj.nome : '';
  const result = await addAgendamento({
    cliente,
    servico,
    profissional: profissionalNome,
    profissional_id: profissionalId,
    data,
    hora,
    preco
  });
  if (result) { closeModal('modal-agenda');
    toast('Agendamento criado!', 'success'); }
});

document.getElementById('modal-agenda-cancel').addEventListener('click', () => closeModal('modal-agenda'));

// Cliente rápido
document.getElementById('agenda-add-cliente-rapido').addEventListener('click', () => {
  closeModal('modal-agenda');
  document.getElementById('cliente-rapido-nome').value = '';
  document.getElementById('cliente-rapido-telefone').value = '';
  openModal('modal-cliente-rapido');
});

document.getElementById('modal-cliente-rapido-save').addEventListener('click', async () => {
  const nome = document.getElementById('cliente-rapido-nome').value.trim();
  const telefone = document.getElementById('cliente-rapido-telefone').value.trim();
  if (!nome) { toast('Nome é obrigatório', 'error'); return; }
  await addCliente({ nome, telefone, notas: '' });
  closeModal('modal-cliente-rapido');
  toast('Cliente adicionado!', 'success');
  openModal('modal-agenda');
  const sel = document.getElementById('agenda-cliente');
  sel.innerHTML = '<option value="">Selecionar cliente</option>' + state.clientes.map(c =>
    `<option value="${escHtml(c.nome)}">${escHtml(c.nome)}</option>`).join('');
  sel.value = nome;
});

document.getElementById('modal-cliente-rapido-cancel').addEventListener('click', () => {
  closeModal('modal-cliente-rapido');
  openModal('modal-agenda');
});

// CRUD Cliente
let editClienteId = null;

function openEditCliente(id) {
  const c = state.clientes.find(c => c.id === id);
  if (!c) return;
  editClienteId = id;
  document.getElementById('cliente-modal-title').textContent = 'Editar Cliente';
  document.getElementById('cliente-nome').value = c.nome;
  document.getElementById('cliente-telefone').value = c.telefone || '';
  document.getElementById('cliente-notas').value = c.notas || '';
  document.getElementById('cliente-id').value = id;
  openModal('modal-cliente');
}

document.getElementById('add-cliente-btn').addEventListener('click', () => {
  editClienteId = null;
  document.getElementById('cliente-modal-title').textContent = 'Novo Cliente';
  ['cliente-nome', 'cliente-telefone', 'cliente-notas', 'cliente-id'].forEach(id => document.getElementById(id).value = '');
  openModal('modal-cliente');
});

document.getElementById('modal-cliente-save').addEventListener('click', async () => {
  const nome = document.getElementById('cliente-nome').value.trim();
  const telefone = document.getElementById('cliente-telefone').value.trim();
  const notas = document.getElementById('cliente-notas').value.trim();
  const id = document.getElementById('cliente-id').value;
  if (!nome) { toast('Nome é obrigatório', 'error'); return; }
  if (id) { await updateCliente(id, { nome, telefone, notas });
    toast('Cliente actualizado', 'success'); } else { await addCliente({ nome, telefone, notas });
    toast('Cliente adicionado', 'success'); }
  closeModal('modal-cliente');
});

document.getElementById('modal-cliente-cancel').addEventListener('click', () => closeModal('modal-cliente'));

// CRUD Profissional
let editProfId = null;

function openEditProf(id) {
  const p = state.profissionais.find(p => p.id === id);
  if (!p) return;
  editProfId = id;
  document.getElementById('prof-modal-title').textContent = 'Editar Profissional';
  document.getElementById('prof-nome').value = p.nome;
  document.getElementById('prof-esp').value = p.especialidade || '';
  document.getElementById('prof-id').value = id;
  openModal('modal-prof');
}

document.getElementById('add-prof-btn').addEventListener('click', () => {
  editProfId = null;
  document.getElementById('prof-modal-title').textContent = 'Novo Profissional';
  document.getElementById('prof-nome').value = '';
  document.getElementById('prof-esp').value = '';
  document.getElementById('prof-id').value = '';
  openModal('modal-prof');
});

document.getElementById('modal-prof-save').addEventListener('click', async () => {
  const nome = document.getElementById('prof-nome').value.trim();
  const esp = document.getElementById('prof-esp').value.trim();
  const id = document.getElementById('prof-id').value;
  if (!nome) { toast('Nome é obrigatório', 'error'); return; }
  if (id) { await updateProfissional(id, { nome, especialidade: esp });
    toast('Profissional actualizado', 'success'); } else { await addProfissional({ nome, especialidade: esp });
    toast('Profissional adicionado', 'success'); }
  closeModal('modal-prof');
});

document.getElementById('modal-prof-cancel').addEventListener('click', () => closeModal('modal-prof'));

// CRUD Serviço
document.getElementById('add-servico-btn').addEventListener('click', () => openServicoModal());

document.getElementById('modal-servico-save').addEventListener('click', async () => {
  const nome = document.getElementById('servico-nome').value.trim();
  const precoBase = parseFloat(document.getElementById('servico-preco').value);
  const id = document.getElementById('servico-id').value;
  const profissionais = getSelectedProfissionais();
  if (!nome || isNaN(precoBase) || precoBase <= 0) { toast('Preencha nome e preço válido', 'error'); return; }
  if (id) { await updateServico(id, { nome, precoBase, profissionais });
    toast('Serviço actualizado!', 'success'); } else { await addServico({ nome, precoBase, profissionais });
    toast('Serviço criado!', 'success'); }
  closeModal('modal-servico');
  updateUI();
});

document.getElementById('modal-servico-cancel').addEventListener('click', () => closeModal('modal-servico'));

// ====================================================================
//  FILA DE SINCRONIZAÇÃO (extraído do app.js na Fase B da modularização)
// ====================================================================

// ================================================================
//  LISTA NEGRA DE ELIMINADOS (evita reimportação)
// ================================================================
const DELETED_KEY = 'bp_deleted_items';

function getDeletedItems() {
  try { return JSON.parse(localStorage.getItem(DELETED_KEY) || '[]'); }
  catch { return []; }
}

function saveDeletedItems(items) {
  try { localStorage.setItem(DELETED_KEY, JSON.stringify(items)); }
  catch {}
}

function addDeletedItem(id, tabela) {
  const items = getDeletedItems();
  if (!items.find(i => i.id === id && i.tabela === tabela)) {
    items.push({ id, tabela, ts: Date.now() });
    saveDeletedItems(items);
  }
}

function removeDeletedItem(id, tabela) {
  const items = getDeletedItems().filter(i => !(i.id === id && i.tabela === tabela));
  saveDeletedItems(items);
}

function getSyncQueue() {
  try { return JSON.parse(localStorage.getItem(SYNC_QUEUE_KEY) || '[]'); }
  catch { return []; }
}

function saveSyncQueue(q) {
  try { localStorage.setItem(SYNC_QUEUE_KEY, JSON.stringify(q)); }
  catch {}
}

function atualizarIndicadorSync() {
  const dot  = document.getElementById('sync-dot');
  const text = document.getElementById('sync-text');
  if (!dot || !text) return;
  if (!navigator.onLine) { dot.classList.remove('online'); text.textContent = 'Offline'; return; }
  const fila = getSyncQueue();
  const pendentes = fila.filter(op => op.failed !== true).length;
  const falhados = fila.length - pendentes;
  dot.classList.add('online');
  text.textContent = pendentes > 0
    ? `Online (${pendentes} pendente${pendentes > 1 ? 's' : ''})`
    : (falhados > 0 ? `Online (${falhados} com falha)` : 'Online');
}

function addToSyncQueue(tabela, operacao, payload) {
  const q = getSyncQueue().filter(item => !(item.tabela === tabela && item.payload?.id === payload?.id));
  q.push({ id: uuid(), tabela, operacao, payload, ts: Date.now(), attempts: 0 });
  saveSyncQueue(q);
}

async function flushSyncQueue() {
  const q = getSyncQueue();
  if (q.length === 0) return;

  const MAX_ATTEMPTS = 5;
  const restantes = [];
  let interrompido = false;
  const itensFalhos = [];

  for (let i = 0; i < q.length; i++) {
    const op = q[i];

    if (op.failed === true) {
      restantes.push(op);
      continue;
    }

    if (interrompido) {
      restantes.push(op);
      continue;
    }

    try {
      if (op.operacao === 'delete') {
        await supabaseDelete(op.tabela, op.payload.id);
        // DELETE bem-sucedido → remover da lista negra
        removeDeletedItem(op.payload.id, op.tabela);
      } else {
        await supabaseUpsert(op.tabela, op.payload);
      }
    } catch (err) {
      // ================================================================
      // CORREÇÃO OFFLINE: SESSION_EXPIRED só é tratado se estiver online.
      // Se estiver offline, não faz logout — apenas adia a operação.
      // ================================================================
      if (err.message === 'SESSION_EXPIRED') {
        if (navigator.onLine) {
          // Online: sessão expirada → força logout e interrompe a fila
          restantes.push(op);
          for (let j = i + 1; j < q.length; j++) {
            restantes.push(q[j]);
          }
          saveSyncQueue(restantes);
          await supabaseClient.auth.signOut();
          interrompido = true;
          break;
        } else {
          // Offline: não faz logout, apenas adia a operação
          console.warn('[flushSyncQueue] SESSION_EXPIRED offline — adiando operação.');
          op.attempts = (op.attempts || 0) + 1;
          if (op.attempts >= MAX_ATTEMPTS) {
            op.failed = true;
            itensFalhos.push(op.id || 'item');
            restantes.push(op);
          } else {
            const delay = Math.min(Math.pow(2, op.attempts) * 1000, 60000) + Math.random() * 1000;
            op.nextRetry = Date.now() + delay;
            restantes.push(op);
          }
          continue;
        }
      }

      op.attempts = (op.attempts || 0) + 1;

      if (op.attempts >= MAX_ATTEMPTS) {
        op.failed = true;
        itensFalhos.push(op.id || 'item');
        restantes.push(op);
      } else {
        const delay = Math.min(Math.pow(2, op.attempts) * 1000, 60000) + Math.random() * 1000;
        op.nextRetry = Date.now() + delay;
        restantes.push(op);
      }
    }
  }

  if (!interrompido) {
    saveSyncQueue(restantes);
  }

  if (itensFalhos.length > 0) {
    const msg = `Falha ao sincronizar ${itensFalhos.length} operação(ões) após ${MAX_ATTEMPTS} tentativas. Contacte o suporte.`;
    toast(msg, 'error');
  }
}

// ====================================================================
//  OVERRIDE PARA SUPABASE (mantido)
// ====================================================================
const _dbPutOriginal    = dbPut;
const _dbDeleteOriginal = dbDelete;

dbPut = async function(store, item) {
  await _dbPutOriginal(store, item);
  const tabela = STORE_TO_TABLE[store];
  if (!tabela || !state.config.salaoId) return item;
  if (navigator.onLine) {
    try { await supabaseUpsert(tabela, item); }
    catch { addToSyncQueue(tabela, 'upsert', item); }
  } else {
    addToSyncQueue(tabela, 'upsert', item);
  }
  return item;
};

dbDelete = async function(store, id) {
  // Adiciona à lista negra ANTES de eliminar localmente
  const tabela = STORE_TO_TABLE[store];
  if (tabela) {
    addDeletedItem(id, tabela);
  }

  await _dbDeleteOriginal(store, id);

  if (!tabela || !state.config.salaoId) return;
  if (navigator.onLine) {
    try { await supabaseDelete(tabela, id); }
    catch { addToSyncQueue(tabela, 'delete', { id }); }
  } else {
    addToSyncQueue(tabela, 'delete', { id });
  }
};
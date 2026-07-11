// ====================================================================
//  FILA DE SINCRONIZAÇÃO (extraído do app.js na Fase B da modularização)
// ====================================================================
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
  const pendentes = getSyncQueue().length;
  dot.classList.add('online');
  text.textContent = pendentes > 0 ? `Online (${pendentes} pendente${pendentes > 1 ? 's' : ''})` : 'Online';
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

  // Ignora itens já marcados como falha permanente
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
    } else {
      await supabaseUpsert(op.tabela, op.payload);
    }
  } catch (err) {
    if (err.message === 'SESSION_EXPIRED') {
      restantes.push(op);
      for (let j = i + 1; j < q.length; j++) {
        restantes.push(q[j]);
      }
      saveSyncQueue(restantes);
      await supabaseClient.auth.signOut();
      interrompido = true;
      break;
    }

    // Incrementa tentativas (inicializa se ausente)
    op.attempts = (op.attempts || 0) + 1;

    if (op.attempts >= MAX_ATTEMPTS) {
      op.failed = true;
      itensFalhos.push(op.id || 'item');
      // Mantém o item na fila (não perde)
      restantes.push(op);
    } else {
      // Mantém para nova tentativa
      restantes.push(op);
    }
  }
}

if (!interrompido) {
  saveSyncQueue(restantes);
}

// Notificação única para itens que atingiram o limite
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
      await _dbDeleteOriginal(store, id);
      const tabela = STORE_TO_TABLE[store];
      if (!tabela || !state.config.salaoId) return;
      if (navigator.onLine) {
        try { await supabaseDelete(tabela, id); }
        catch { addToSyncQueue(tabela, 'delete', { id }); }
      } else {
        addToSyncQueue(tabela, 'delete', { id });
      }
    };

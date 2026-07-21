// ====================================================================
//  DB — INDEXEDDB + FALLBACK LOCALSTORAGE (extraído do app.js na Fase B
//  da modularização)
// ====================================================================
let db = null;
const STORES = ['config', 'clientes', 'agendamentos', 'movimentos', 'profissionais', 'servicos', 'fechos_caixa'];

function openDB() {
  return new Promise((res, rej) => {
    try {
      const req = indexedDB.open('BelezaProDB', 8);
      req.onupgradeneeded = e => {
        const d = e.target.result;
        STORES.forEach(s => { if (!d.objectStoreNames.contains(s)) d.createObjectStore(s, { keyPath: 'id' }); });
      };
      req.onsuccess = e => { db = e.target.result;
        res(db); };
      req.onerror = e => rej(e.target.error);
    } catch (err) { rej(err); }
  });
}

async function dbGetAll(store) {
  try {
    if (db) {
      const tx = db.transaction(store, 'readonly');
      const r = tx.objectStore(store).getAll();
      return await new Promise((res, rej) => { r.onsuccess = () => res(r.result);
        r.onerror = () => rej(r.error); });
    }
  } catch (e) { /* cai no fallback abaixo */ }
  try { const d = localStorage.getItem('bp_' + store); return d ? JSON.parse(d) : []; } catch (e) { return []; }
}

let dbPut = async function(store, item) {
  if (!item.id) item.id = uuid();
  item.updated_at = new Date().toISOString(); // sempre gera novo timestamp na escrita local
  try {
    if (db) {
      const tx = db.transaction(store, 'readwrite');
      const r = tx.objectStore(store).put(item);
      await new Promise((res, rej) => { r.onsuccess = res;
        r.onerror = rej; });
      return item;
    }
  } catch (e) {}
  try {
    const items = await dbGetAll(store);
    const idx = items.findIndex(i => i.id === item.id);
    if (idx !== -1) items[idx] = item;
    else items.push(item);
    localStorage.setItem('bp_' + store, JSON.stringify(items));
    return item;
  } catch (e) { return item; }
};
// Função de escrita local pura (NUNCA dispara sync)
async function dbPutLocal(store, item) {
  if (!item.id) item.id = uuid();
  // Só gera timestamp se não existir (preserva o vindo do servidor)
  if (!item.updated_at) {
    item.updated_at = new Date().toISOString();
  }
  try {
    if (db) {
      const tx = db.transaction(store, 'readwrite');
      const r = tx.objectStore(store).put(item);
      await new Promise((res, rej) => { r.onsuccess = res; r.onerror = rej; });
      return item;
    }
  } catch (e) { /* silencioso, fallback para localStorage */ }
  try {
    const items = await dbGetAll(store);
    const idx = items.findIndex(i => i.id === item.id);
    if (idx !== -1) items[idx] = item;
    else items.push(item);
    localStorage.setItem('bp_' + store, JSON.stringify(items));
    return item;
  } catch (e) { return item; }
}

let dbDelete = async function(store, id) {
  try {
    if (db) {
      const tx = db.transaction(store, 'readwrite');
      const r = tx.objectStore(store).delete(id);
      await new Promise((res, rej) => { r.onsuccess = res;
        r.onerror = rej; });
      return;
    }
  } catch (e) {}
  try {
    const items = await dbGetAll(store);
    localStorage.setItem('bp_' + store, JSON.stringify(items.filter(i => i.id !== id)));
  } catch (e) {}
};

async function dbClear(store) {
  try {
    if (db) {
      const tx = db.transaction(store, 'readwrite');
      await new Promise((res, rej) => { const r = tx.objectStore(store).clear();
        r.onsuccess = res; r.onerror = rej; });
      return;
    }
  } catch (e) {}
  try { localStorage.removeItem('bp_' + store); } catch (e) {}
}
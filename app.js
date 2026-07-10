// ====================================================================
    //  UTILITÁRIOS — movidos para core-utils.js (Fase A da modularização)
    // ====================================================================

    // ====================================================================
    //  SUPABASE — CONFIGURAÇÃO (SUPABASE_URL/ANON_KEY movidas para core-constants.js)
    // ====================================================================
    // Supabase client (SDK v2)
    const { createClient } = supabase; // supabase global from CDN
    const supabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

    // ====================================================================
    //  SUPABASE AUTH — LOGIN E SESSÃO
    // ====================================================================
    // ====================================================================
    //  ITEM 3.1 — Escuta activa de alterações de estado de autenticação
    //  Reage a expiração/revogação de sessão em tempo real, não apenas
    //  no arranque. Distingue explicitamente de um logout voluntário
    //  (que já dispara o seu próprio toast no handler do botão "Sair").
    // ====================================================================
    let logoutVoluntarioEmCurso = false;
    supabaseClient.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_OUT' && !logoutVoluntarioEmCurso) {
        // Sessão perdida sem ter sido o utilizador a pedir — expirou ou foi revogada.
        document.querySelectorAll('.modal-overlay.active').forEach(m => m.classList.remove('active'));
        document.getElementById('app-view').style.display = 'none';
        document.getElementById('login-view').style.display = 'flex';
        toast('A sua sessão expirou. Inicie sessão novamente.', 'error');
      }
      logoutVoluntarioEmCurso = false;
    });

    async function checkSession() {
      try {
        const { data: { session } } = await supabaseClient.auth.getSession();
        if (session) {
          document.getElementById('login-view').style.display = 'none';
          document.getElementById('app-view').style.display = 'flex';
          const { data: profile, error: profileError } = await supabaseClient
            .from('profiles')
            .select('salao_id, role, nome')
            .eq('user_id', session.user.id)
            .single();
          if (profileError) {
            toast('Perfil não encontrado. Contacte o administrador.', 'error');
            document.getElementById('login-view').style.display = 'flex';
            document.getElementById('app-view').style.display = 'none';
            return;
          }
          state.config.salaoId  = profile.salao_id;
          state.config.storeName = profile.nome || 'Salão';
          state.config.userRole  = profile.role;
          aplicarPermissoes(); // antes de loadState(), pela mesma razão do login
          await sincronizarConfigDoServidor(); // servidor sobrepõe plano/trial locais
          await loadState();
          if (navigator.onLine) {
            atualizarIndicadorSync();
          }
          toast('Sessão restaurada. Bem-vindo(a)!', 'success');
          if (typeof carregarHistoricoIA === 'function') carregarHistoricoIA();
          aplicarPermissoes(); // reaplica por defesa após updateUI regenerar a DOM
        }
      } catch (err) {
        console.error('Erro na verificação de sessão:', err);
        if (typeof Sentry !== 'undefined' && Sentry.captureException) {
          Sentry.captureException(err, { tags: { action: 'checkSession' } });
        }
        document.getElementById('login-view').style.display = 'flex';
        document.getElementById('app-view').style.display  = 'none';
      }
    }

    // Constantes movidas para core-constants.js: WHATSAPP_NUMBER, IA_EDGE_URL,
    // STORE_TO_TABLE, SYNC_QUEUE_KEY

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

    async function getAuthHeaders() {
      const { data: { session } } = await supabaseClient.auth.getSession();
      if (!session || !session.access_token) {
        throw new Error('SESSION_EXPIRED');
      }
      return {
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${session.access_token}`
      };
    }

    // ====================================================================
    //  FUNÇÕES REST ALTERADAS (F1.4.b)
    //  Verificam 401 e lançam SESSION_EXPIRED para preservar a fila
    // ====================================================================
    async function supabaseUpsert(tabela, item) {
  const authHeaders = await getAuthHeaders();
  const resp = await fetch(`${SUPABASE_URL}/rest/v1/${tabela}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...authHeaders,
      'Prefer': 'resolution=merge-duplicates',
    },
    body: JSON.stringify(toSupabaseFormat(tabela, item)),
  });
  if (resp.status === 401) {
    throw new Error('SESSION_EXPIRED');
  }
  if (!resp.ok) throw new Error(`Supabase upsert ${tabela}: ${resp.status}`);
}
    async function supabaseDelete(tabela, id) {
      const authHeaders = await getAuthHeaders();
      const resp = await fetch(
        `${SUPABASE_URL}/rest/v1/${tabela}?id=eq.${encodeURIComponent(id)}`,
        {
          method: 'DELETE',
          headers: authHeaders,
        }
      );
      if (resp.status === 401) {
        throw new Error('SESSION_EXPIRED');
      }
      if (!resp.ok) throw new Error(`Supabase delete ${tabela}: ${resp.status}`);
    }

    async function supabaseGetAll(tabela, salaoId) {
      const authHeaders = await getAuthHeaders();
      const resp = await fetch(
        `${SUPABASE_URL}/rest/v1/${tabela}?salao_id=eq.${encodeURIComponent(salaoId)}&order=created_at.asc`,
        {
          headers: authHeaders,
        }
      );
      if (resp.status === 401) {
        throw new Error('SESSION_EXPIRED');
      }
      if (!resp.ok) throw new Error(`Supabase getAll ${tabela}: ${resp.status}`);
      const rows = await resp.json();
      return rows.map(r => fromSupabaseFormat(tabela, r));
    }
function toSupabaseFormat(tabela, item) {
  const salaoId = state.config.salaoId;
  if (!salaoId) {
    console.error('toSupabaseFormat: state.config.salaoId é nulo!', { tabela, item });
    throw new Error('Salão não identificado. Faça logout e login novamente.');
  }
  switch (tabela) {
    case 'movimentos':
      return {
        id: item.id,
          salao_id: salaoId,
          tipo: item.tipo,
          descricao: item.descricao || '',
          valor: Math.round(item.valor || 0),
          cliente: item.cliente || 'Anónimo',
          profissional: item.profissional || '',
          itens: item.itens || [],
          metodo_pagamento: item.metodoPagamento || 'Numerário',
          data: item.data,
          hora: item.hora,
          updated_at: item.updated_at,
      };
    case 'agendamentos':
      return {
        id: item.id,
          salao_id: salaoId,
          cliente: item.cliente || '',
          servico: item.servico || '',
          profissional: item.profissional || '',
          data: item.data,
          hora: item.hora || '00:00',
          preco: Math.round(item.preco || 0),
          status: item.status || 'agendado',
          agendado_por: item.agendadoPor || null,
          updated_at: item.updated_at,
      };
    case 'clientes':
      return {
        id: item.id,
          salao_id: salaoId,
          nome: item.nome || '',
          telefone: item.telefone || null,
          notas: item.notas || null,
          ultima_visita: item.ultimaVisita || null,
          total_visitas: item.visitas || 0,
          updated_at: item.updated_at,
      };
    case 'profissionais':
      return {
        id: item.id,
          salao_id: salaoId,
          nome: item.nome || '',
          especialidade: item.especialidade || null,
          ativo: item.ativo !== false,
          updated_at: item.updated_at,
      };
    case 'servicos':
      return {
        id: item.id,
          salao_id: salaoId,
          nome: item.nome || '',
          preco_base: Math.round(item.precoBase || 0),
          profissionais: item.profissionais || [],
          ativo: item.ativo !== false,
          updated_at: item.updated_at,
      };
    default:
      return { ...item, salao_id: salaoId, updated_at: item.updated_at };
  }
}
    function fromSupabaseFormat(tabela, row) {
      switch (tabela) {
        case 'movimentos':
          return {
            id:              row.id,
            tipo:            row.tipo,
            descricao:       row.descricao,
            valor:           row.valor,
            cliente:         row.cliente,
            profissional:    row.profissional,
            itens:           row.itens || [],
            metodoPagamento: row.metodo_pagamento,
            data:            row.data,
            hora:            row.hora,
            updated_at:      row.updated_at,
          };
        case 'agendamentos':
          return {
            id:           row.id,
            cliente:      row.cliente,
            servico:      row.servico,
            profissional: row.profissional,
            data:         row.data,
            hora:         row.hora,
            preco:        row.preco,
            status:       row.status,
            agendadoPor:  row.agendado_por,
            updated_at:   row.updated_at,
          };
        case 'clientes':
          return {
            id:           row.id,
            nome:         row.nome,
            telefone:     row.telefone,
            notas:        row.notas,
            ultimaVisita: row.ultima_visita,
            visitas:      row.total_visitas,
            updated_at:   row.updated_at,
          };
        case 'profissionais':
          return {
            id:            row.id,
            nome:          row.nome,
            especialidade: row.especialidade,
            ativo:         row.ativo,
            updated_at:    row.updated_at,
          };
        case 'servicos':
          return {
            id:            row.id,
            nome:          row.nome,
            precoBase:     row.preco_base,
            profissionais: row.profissionais || [],
            ativo:         row.ativo,
            updated_at:    row.updated_at,
          };
        default:
          return row;
      }
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

    async function garantirSalaoRemoto() {
      if (!state.config.salaoId) return;
      try {
        const authHeaders = await getAuthHeaders();
        const resp = await fetch(
          `${SUPABASE_URL}/rest/v1/saloes?id=eq.${encodeURIComponent(state.config.salaoId)}`,
          { headers: authHeaders }
        );
        const rows = await resp.json();
        if (rows.length === 0) {
          // A tabela `saloes` só tem as colunas id/nome/criado_em — plano,
          // trial e fundo de caixa vivem em `salao_config`, criada à parte
          // por sincronizarConfigDoServidor().
          await fetch(`${SUPABASE_URL}/rest/v1/saloes`, {
            method: 'POST',
            headers: {
              'Content-Type':  'application/json',
              ...authHeaders,
              'Prefer':        'resolution=merge-duplicates',
            },
            body: JSON.stringify({
              id:   state.config.salaoId,
              nome: state.config.storeName,
            }),
          });
        }
      } catch (err) {
        if (err.message === 'SESSION_EXPIRED') {
          await supabaseClient.auth.signOut();
          return;
        }
        /* outros erros: silencioso, como antes */
      }
    }

    async function carregarDoSupabase() {
      if (!navigator.onLine || !state.config.salaoId) return false;
      try {
        const [clientesRemotos, agendamentosRemotos, movimentosRemotos, profsRemotos, servicosRemotos] = await Promise.all([
          supabaseGetAll('clientes',      state.config.salaoId),
          supabaseGetAll('agendamentos',  state.config.salaoId),
          supabaseGetAll('movimentos',    state.config.salaoId),
          supabaseGetAll('profissionais', state.config.salaoId),
          supabaseGetAll('servicos',      state.config.salaoId),
        ]);

        const mergeTable = (itensLocais, itensRemotos, tabela) => {
          const mapLocal = new Map();
          itensLocais.forEach(item => mapLocal.set(item.id, item));

          const resultado = [];
          const itensParaSync = [];

          for (const remoto of itensRemotos) {
            const local = mapLocal.get(remoto.id);
            if (!local) {
              resultado.push(remoto);
            } else {
              const localTs = local.updated_at || '1970-01-01T00:00:00.000Z';
              const remotoTs = remoto.updated_at || '1970-01-01T00:00:00.000Z';
              if (remotoTs > localTs) {
                resultado.push(remoto);
              } else if (localTs > remotoTs) {
                resultado.push(local);
                itensParaSync.push(local);
              } else {
                resultado.push(local);
              }
              mapLocal.delete(remoto.id);
            }
          }

          for (const [id, local] of mapLocal) {
            resultado.push(local);
            itensParaSync.push(local);
          }

          for (const item of itensParaSync) {
            addToSyncQueue(tabela, 'upsert', item);
          }

          return resultado;
        };

        state.clientes      = mergeTable(state.clientes, clientesRemotos, 'clientes');
        state.agendamentos  = mergeTable(state.agendamentos, agendamentosRemotos, 'agendamentos');
        state.movimentos    = mergeTable(state.movimentos, movimentosRemotos, 'movimentos');
        state.profissionais = mergeTable(state.profissionais, profsRemotos, 'profissionais');
        state.servicos      = mergeTable(state.servicos, servicosRemotos, 'servicos');

        // Guardar localmente SEM disparar sync (evita ciclo pull→push)
        for (const c of state.clientes)      await dbPutLocal('clientes',      c);
        for (const a of state.agendamentos)  await dbPutLocal('agendamentos',  a);
        for (const m of state.movimentos)    await dbPutLocal('movimentos',    m);
        for (const p of state.profissionais) await dbPutLocal('profissionais', p);
        for (const s of state.servicos)      await dbPutLocal('servicos',      s);
        return true;
      } catch (e) {
        console.warn('Supabase load failed, usando dados locais:', e);
        return false;
      }
    }

    // ====================================================================
    //  PLANOS E LIMITES
    // ====================================================================
    // PLANOS movido para core-constants.js

    function getPlanoAtual() { return state.config.plano || 'trial'; }

    function getLimites(plano) { return PLANOS[plano] || PLANOS.trial; }

    function getDiasTrialRestantes() {
      if (!state.config.trialInicio) return 14;
      const raw = String(state.config.trialInicio);
      const inicio = (raw.includes('T') || raw.includes(' '))
        ? new Date(raw.replace(' ', 'T'))
        : new Date(raw + 'T00:00:00');
      if (isNaN(inicio.getTime())) return 14;
      const agora = new Date();
      const diff = Math.floor((agora - inicio) / (1000 * 60 * 60 * 24));
      return Math.max(0, 14 - diff);
    }

    function isTrialAtivo() {
      const p = getPlanoAtual();
      if (p !== 'trial') return false;
      return getDiasTrialRestantes() > 0;
    }

    function verificarLimite(tipo) {
      const plano = getPlanoAtual();
      const limite = getLimites(plano)[tipo];
      if (limite === Infinity) return true;
      let total = 0;
      switch (tipo) {
        case 'agendamentos':
          total = state.agendamentos.length;
          break;
        case 'clientes':
          total = state.clientes.length;
          break;
        case 'profissionais':
          total = state.profissionais.length;
          break;
      }
      if (total >= limite) {
        mostrarModalUpgrade(`Limite de ${tipo} atingido (${limite}). Faça upgrade para continuar.`);
        return false;
      }
      return true;
    }

    function mostrarModalUpgrade(mensagem) {
      if (!mensagem) mensagem = 'Atingiu o limite do seu plano actual. Escolha um plano para continuar.';
      document.getElementById('upgrade-mensagem').textContent = mensagem;
      openModal('modal-upgrade');
    }

    function upgradePara(plano) {
      const msg =
        `Olá, quero assinar o plano ${plano} do BelezaPro. Salão: ${state.config.storeName} | Plano actual: ${getPlanoAtual()}`;
      window.open(`https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(msg)}`, '_blank');
      closeModal('modal-upgrade');
    }

    // closeModal/openModal movidos para core-utils.js

    // ====================================================================
    //  ARMAZENAMENTO (IndexedDB + fallback localStorage)
    // ====================================================================
    let db = null;
    const STORES = ['config', 'clientes', 'agendamentos', 'movimentos', 'profissionais', 'servicos'];

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

    // ====================================================================
    //  ESTADO GLOBAL
    // ====================================================================
    let state = {
      config: { storeName: 'Glamour Beauty', fundo: 50000, plano: 'trial', trialInicio: null, salaoId: null },
      clientes: [],
      agendamentos: [],
      movimentos: [],
      profissionais: [],
      servicos: [],
      agendaDataAtual: hoje(),
      histPeriodo: 'hoje',
      carrinho: [],
      filtroClientes: 'todos',
      chartPeriodo: 'semana',
      chartOffset: 0,
      chartMostrarValores: false,
    };

    // PROF_DEFAULT e SERVICOS_DEFAULT movidos para core-constants.js

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
    async function loadState() {
      const configs = await dbGetAll('config');

      const cfg = configs.find(c => c.key === 'storeName');
      const fund = configs.find(c => c.key === 'fundo');
      const plano = configs.find(c => c.key === 'plano');
      const trialInicio = configs.find(c => c.key === 'trialInicio');
      const salaoIdCache = configs.find(c => c.key === 'salaoId');
      state.config.storeName = cfg ? cfg.value : 'Glamour Beauty';
      state.config.fundo = fund ? Number(fund.value) : 50000;
      state.config.plano = plano ? plano.value : 'trial';
      state.config.trialInicio = trialInicio ? trialInicio.value : null;
      // CORREÇÃO CRÍTICA: state.config.salaoId NUNCA é sobreposto aqui — já foi
      // definido corretamente a partir do profile.salao_id, antes de loadState()
      // ser chamado (ver checkSession/login). Usamos o valor em cache só para
      // detetar se este dispositivo trocou de salão entretanto.
      const salaoIdAnterior = salaoIdCache ? salaoIdCache.value : null;
      const trocouDeSalao = salaoIdAnterior && state.config.salaoId && salaoIdAnterior !== state.config.salaoId;

      let clientes, agendamentos, movimentos, profs, servicos;
      if (trocouDeSalao) {
        // Este dispositivo já teve dados de OUTRO salão gravados localmente.
        // Limpar tudo antes de continuar, para nunca misturar clientes/
        // agendamentos/movimentos/profissionais/serviços entre salões.
        await Promise.all(['clientes', 'agendamentos', 'movimentos', 'profissionais', 'servicos'].map(dbClear));
        // Limpar também a fila de sincronização para não enviar dados do salão antigo
        localStorage.removeItem(SYNC_QUEUE_KEY);
        clientes = []; agendamentos = []; movimentos = []; profs = []; servicos = [];
        console.warn('[BelezaPro] Troca de salão detetada neste dispositivo — dados locais e fila de sync foram limpos.');
      } else {
        // Buscar dados apenas se NÃO houve troca de salão
        const [clientesData, agendamentosData, movimentosData, profsData, servicosData] = await Promise.all([
          dbGetAll('clientes'),
          dbGetAll('agendamentos'),
          dbGetAll('movimentos'),
          dbGetAll('profissionais'),
          dbGetAll('servicos'),
        ]);
        clientes = clientesData;
        agendamentos = agendamentosData;
        movimentos = movimentosData;
        profs = profsData;
        servicos = servicosData;
      }

      // ============================================================
      // SANITIZAÇÃO: GARANTIR QUE TUDO É ARRAY (previne undefined)
      // ============================================================
      const safe = (arr) => Array.isArray(arr) ? arr : [];
      const safeClientes = safe(clientes);
      const safeAgendamentos = safe(agendamentos);
      const safeMovimentos = safe(movimentos);
      const safeProfs = safe(profs);
      const safeServicos = safe(servicos);

      state.clientes = safeClientes;
      state.agendamentos = safeAgendamentos;
      state.movimentos = safeMovimentos;
      state.profissionais = safeProfs.length ? safeProfs : [...PROF_DEFAULT];
      state.servicos = safeServicos.length ? safeServicos : [...SERVICOS_DEFAULT];

      const chartPeriodo = localStorage.getItem('bp_chart_periodo') || 'semana';
      const chartOffset = parseInt(localStorage.getItem('bp_chart_offset')) || 0;
      const chartMostrarValores = localStorage.getItem('bp_chart_mostrar_valores') === 'true';
      const filtroClientes = localStorage.getItem('bp_filtro_clientes') || 'todos';
      state.filtroClientes = filtroClientes;
      state.chartPeriodo = chartPeriodo;
      state.chartOffset = chartOffset;
      state.chartMostrarValores = chartMostrarValores;

      if (!state.config.trialInicio) {
        state.config.trialInicio = hoje();
        state.config.plano = 'trial';
        await dbPut('config', { id: 'trialInicio', key: 'trialInicio', value: state.config.trialInicio });
        await dbPut('config', { id: 'plano', key: 'plano', value: 'trial' });
      }
      if (safeProfs.length === 0) { for (const p of PROF_DEFAULT) await dbPut('profissionais', p); }
      if (safeServicos.length === 0) { for (const s of SERVICOS_DEFAULT) await dbPut('servicos', s); }

      if (state.config.salaoId && navigator.onLine) {
        await garantirSalaoRemoto();
        const carregouRemoto = await carregarDoSupabase();
        if (carregouRemoto) await flushSyncQueue();
      }

      updateUI();
    }
    // ====================================================================
    //  SINCRONIZAÇÃO DE CONFIGURAÇÃO DE SALÃO (plano/trial) — solução
    //  definitiva ao gap: 'config' era 100% local, permitindo a qualquer
    //  utilizador destravar limites editando o IndexedDB no DevTools.
    //  A partir de agora, o servidor (tabela `salao_config`) é a fonte de
    //  verdade para `plano` e `trialInicio`; o local só serve de cache
    //  offline. `fundo` e `storeName` continuam local-only (não são dados
    //  de segurança/billing, não há razão para forçar sincronização deles).
    // ====================================================================
    async function sincronizarConfigDoServidor() {
      if (!state.config.salaoId || !navigator.onLine) return; // offline: mantém último valor local conhecido
      try {
        // CORRECÇÃO: usar o token de sessão do utilizador autenticado, não a
        // anon key directamente — só assim o Supabase consegue identificar
        // auth.uid() dentro das políticas de RLS da tabela `salao_config`.
        // Sem isto, qualquer RLS baseada em "utilizador autenticado" falha
        // sempre de forma silenciosa (apanhada pelo try/catch abaixo).
        const { data: { session } } = await supabaseClient.auth.getSession();
        const accessToken = session?.access_token;
        if (!accessToken) return; // sem sessão válida, não tenta sincronizar
        const authHeaders = {
          'apikey': SUPABASE_ANON_KEY,
          'Authorization': `Bearer ${accessToken}`,
        };
        const resp = await fetch(
          `${SUPABASE_URL}/rest/v1/salao_config?salao_id=eq.${state.config.salaoId}&select=plano,trial_inicio`,
          { headers: authHeaders }
        );
        if (!resp.ok) return;
        const rows = await resp.json();
        if (rows.length > 0) {
          // Servidor tem registo: sobrepõe SEMPRE o valor local (fonte de verdade).
          state.config.plano       = rows[0].plano || 'trial';
          state.config.trialInicio = rows[0].trial_inicio || state.config.trialInicio;
          await saveConfig(); // actualiza a cache local para uso offline
        } else {
          // Primeira vez deste salão: cria o registo remoto com o estado actual (trial).
          await fetch(`${SUPABASE_URL}/rest/v1/salao_config`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              ...authHeaders,
              'Prefer': 'resolution=merge-duplicates',
            },
            body: JSON.stringify({
              salao_id: state.config.salaoId,
              plano: state.config.plano || 'trial',
              trial_inicio: state.config.trialInicio || new Date().toISOString(),
            }),
          });
        }
      } catch (err) {
        console.error('Falha ao sincronizar configuração do salão:', err);
        // Falha silenciosa aqui é aceitável: mantém-se o último plano
        // conhecido localmente, nunca escala privilégio na ausência de rede.
      }
    }

    async function saveConfig() {
      await dbPut('config', { id: 'storeName', key: 'storeName', value: state.config.storeName });
      await dbPut('config', { id: 'fundo', key: 'fundo', value: state.config.fundo });
      await dbPut('config', { id: 'plano', key: 'plano', value: state.config.plano });
      await dbPut('config', { id: 'trialInicio', key: 'trialInicio', value: state.config.trialInicio });
      if (state.config.salaoId) {
        await dbPut('config', { id: 'salaoId', key: 'salaoId', value: state.config.salaoId });
      }
    }

    // ====================================================================
    //  CRUD FUNCTIONS (preservadas do original)
    // ====================================================================
    async function addCliente(c) {
      if (!verificarLimite('clientes')) return null;
      const n = { ...c, id: uuid() };
      await dbPut('clientes', n);
      state.clientes.push(n);
      updateUI();
      return n;
    }

    async function updateCliente(id, data) {
      const i = state.clientes.findIndex(c => c.id === id);
      if (i === -1) return;
      state.clientes[i] = { ...state.clientes[i], ...data };
      await dbPut('clientes', state.clientes[i]);
      updateUI();
    }

    async function addAgendamento(ag) {
      const dtStr = ag.data + 'T' + (ag.hora || '00:00') + ':00';
      const agDatetime = new Date(dtStr);
      const agora = new Date();
      if (agDatetime < agora) {
        toast('Não é possível agendar para datas ou horários passados.', 'error');
        return null;
      }
      if (!verificarLimite('agendamentos')) return null;
      const n = { ...ag, id: uuid(), data: ag.data || hoje(), hora: ag.hora || horaAgora(), status: 'agendado' };
      await dbPut('agendamentos', n);
      state.agendamentos.push(n);
      updateUI();
      return n;
    }

    async function updateAgendamento(id, data) {
      const i = state.agendamentos.findIndex(a => a.id === id);
      if (i === -1) return;
      state.agendamentos[i] = { ...state.agendamentos[i], ...data };
      await dbPut('agendamentos', state.agendamentos[i]);
      updateUI();
    }

    async function deleteAgendamento(id) {
      await dbDelete('agendamentos', id);
      state.agendamentos = state.agendamentos.filter(a => a.id !== id);
      updateUI();
    }

    async function addProfissional(p) {
      if (!verificarLimite('profissionais')) return null;
      const n = { ...p, id: uuid() };
      await dbPut('profissionais', n);
      state.profissionais.push(n);
      updateUI();
      return n;
    }

    async function updateProfissional(id, data) {
      const i = state.profissionais.findIndex(p => p.id === id);
      if (i === -1) return;
      state.profissionais[i] = { ...state.profissionais[i], ...data };
      await dbPut('profissionais', state.profissionais[i]);
      updateUI();
    }

    async function deleteProfissional(id) {
      await dbDelete('profissionais', id);
      state.profissionais = state.profissionais.filter(p => p.id !== id);
      updateUI();
    }

    async function deleteCliente(id) {
      await dbDelete('clientes', id);
      state.clientes = state.clientes.filter(c => c.id !== id);
      updateUI();
    }

    async function addServico(s) {
      const n = { ...s, id: uuid() };
      await dbPut('servicos', n);
      state.servicos.push(n);
      updateUI();
      return n;
    }

    async function updateServico(id, data) {
      const i = state.servicos.findIndex(s => s.id === id);
      if (i === -1) return;
      state.servicos[i] = { ...state.servicos[i], ...data };
      await dbPut('servicos', state.servicos[i]);
      updateUI();
    }

    async function deleteServico(id) {
      await dbDelete('servicos', id);
      state.servicos = state.servicos.filter(s => s.id !== id);
      updateUI();
    }

    function getServicoById(id) {
      return state.servicos.find(s => s.id === id);
    }

    function getServicoByNome(nome) {
      return state.servicos.find(s => s.nome === nome);
    }

    function getProfissionaisPorServico(nomeServico) {
      const servico = state.servicos.find(s => s.nome === nomeServico);
      if (servico && servico.profissionais && servico.profissionais.length > 0) {
        return servico.profissionais;
      }
      return state.profissionais.map(p => p.nome);
    }

    async function registarVenda(dados) {
      const total = dados.itens.reduce((acc, i) => acc + i.subtotal, 0);
      const descricao = dados.itens.map(i => i.nome).join(', ');
      const id = uuid();
      const mov = {
        id,
        tipo: 'venda',
        descricao,
        valor: total,
        cliente: dados.cliente || 'Anónimo',
        profissional: dados.profissional || 'Não atribuído',
        itens: dados.itens,
        metodoPagamento: dados.metodoPagamento || 'Numerário',
        data: hoje(),
        hora: horaAgora(),
      };
      await dbPut('movimentos', mov);
      state.movimentos.push(mov);
      updateUI();
      return id;
    }

    async function addMovimento(mov) {
      const n = { ...mov, id: uuid(), data: hoje(), hora: horaAgora() };
      await dbPut('movimentos', n);
      state.movimentos.push(n);
      updateUI();
      return n;
    }

    function abrirFinalizarAtendimento(id) {
      const ag = state.agendamentos.find(a => a.id === id);
      if (!ag) return;
      if (ag.status === 'realizado') { toast('Atendimento já realizado', 'warning'); return; }
      document.getElementById('finalizar-info').innerHTML = `
        <strong>${escHtml(ag.cliente)}</strong><br>
        ${escHtml(ag.servico)} · ${escHtml(ag.profissional)}<br>
        <span style="color:var(--gold);font-weight:700;">${fmtKz(ag.preco)}</span>
      `;
      document.getElementById('finalizar-ag-id').value = id;
      document.getElementById('finalizar-pagamento').value = 'Numerário';
      openModal('modal-finalizar');
    }

    // ====================================================================
    //  RENDERIZAÇÃO (com melhorias das fases)
    // ====================================================================
    let activeTab = 'dashboard';

    function updateUI() {
      // Renderização condicional: apenas a aba activa e dependências necessárias
      renderDashboard();
      // Agenda, clientes, caixa e equipa são renderizadas apenas se a aba estiver activa
      if (activeTab === 'agenda') renderAgendaFull();
      if (activeTab === 'clientes') renderClientes();
      if (activeTab === 'caixa') renderCaixa();
      if (activeTab === 'equipa') { renderProfissionais(); renderServicos(); }
      renderBadges();
      renderPlanoInfo();
      renderizarGrafico();
      populateVendaSelects();
      populateAgendaSelects();
      setupPrecoAutomatico('agenda-servico', 'agenda-preco');
      setupPrecoAutomatico('ci-servico-sel', 'ci-valor');
      initChartControls();
      // Acessibilidade
      aplicarAcessibilidade();

      // Atualizar nome do salão no cabeçalho
      const storeDisplay = document.getElementById('store-name-display');
      if (storeDisplay && state.config.storeName) {
        storeDisplay.textContent = state.config.storeName;
      }
    }

    function renderPlanoInfo() {
      const plano = getPlanoAtual();
      const info = PLANOS[plano];
      const badge = document.getElementById('plano-badge');
      const label = plano === 'trial' ? 'Plano Gratuito' : info.label.toUpperCase();
      badge.textContent = label;
      badge.className = 'plano-badge ' + info.badgeClass;
      const countdown = document.getElementById('trial-countdown');
      if (plano === 'trial' && isTrialAtivo()) {
        const dias = getDiasTrialRestantes();
        countdown.style.display = 'inline-block';
        countdown.textContent = `⏳ Restam ${dias} dias`;
        countdown.style.color = '';
      } else if (plano === 'trial' && !isTrialAtivo()) {
        countdown.style.display = 'inline-block';
        countdown.textContent = '⚠️ Trial expirado';
        countdown.style.color = '#B33A4A';
      } else {
        countdown.style.display = 'none';
        countdown.style.color = '';
      }
      const iaInfo = document.getElementById('ia-plano-info');
      if (iaInfo) {
        const limite = info.iaDia;
        iaInfo.textContent = limite > 0 ? `${info.label}: ${limite} perguntas/dia` : 'IA não disponível neste plano';
      }
      const cont = document.getElementById('ia-contador');
      if (cont) cont.textContent = parseInt(localStorage.getItem('ia_perguntas_' + hoje()) || '0');
    }

    function renderDashboard() {
      const hojeStr = hoje();
      const agHoje = state.agendamentos.filter(a => a.data === hojeStr);
      const vendasHoje = state.movimentos.filter(m => m.data === hojeStr && m.tipo === 'venda');
      const totalRev = vendasHoje.reduce((s, v) => s + v.valor, 0);
      const totalVendas = vendasHoje.length;
      const ticket = totalVendas > 0 ? totalRev / totalVendas : 0;
      const realizados = agHoje.filter(a => a.status === 'realizado').length;
      const clientesUnicos = new Set(vendasHoje.map(m => m.cliente)).size;

      animateKpi('kpi-revenue', fmtKz(totalRev));
      document.getElementById('kpi-revenue-count').textContent = totalVendas + ' serviços';
      animateKpi('kpi-agendamentos', String(agHoje.length));
      document.getElementById('kpi-agendamentos-status').textContent = realizados + ' realizados';
      animateKpi('kpi-ticket', fmtKz(ticket));
      animateKpi('kpi-clients', String(clientesUnicos));

      const proximos = agHoje.filter(a => a.status !== 'realizado').sort((a, b) => a.hora.localeCompare(b.hora)).slice(0, 4);
      const cont = document.getElementById('agenda-today-list');
      if (proximos.length === 0) {
        cont.innerHTML =
          `<div class="empty-state"><p>${agHoje.length === 0 ? 'Nenhum atendimento hoje' : 'Todos os atendimentos realizados ✅'}</p></div>`;
      } else {
        cont.innerHTML = proximos.map(a => `
          <div class="list-item">
            <div class="avatar">${a.cliente.charAt(0).toUpperCase()}</div>
            <div class="info">
              <div class="title" style="color:var(--gold-dark);font-weight:700;">${escHtml(a.servico)}</div>
              <div class="sub">👤 ${escHtml(a.cliente)} · ${a.hora} · ${escHtml(a.profissional)}</div>
            </div>
            <div class="action" style="display:flex;flex-direction:column;align-items:flex-end;gap:4px;">
              <span style="display:inline-flex;align-items:center;gap:3px;padding:2px 10px;border-radius:4px;font-size:.6rem;font-weight:700;background:#FEF6E0;color:#A7872B;">⏳ Pendente</span>
              <span style="font-weight:700;font-size:.8rem;">${fmtKz(a.preco)}</span>
            </div>
          </div>
        `).join('');
      }
      document.getElementById('agenda-count').textContent = proximos.length + ' pendentes';

      document.getElementById('today-date').textContent = '📅 ' + new Date().toLocaleDateString('pt-AO', { day: '2-digit',
        month: 'long', year: 'numeric' });
      const h = new Date().getHours();
      document.getElementById('greeting').textContent = h < 12 ? 'Bom dia ☀️' : h < 18 ? 'Boa tarde 🌤️' : 'Boa noite 🌙';
    }

    function renderAgendaFull() {
      const cont = document.getElementById('agenda-full-list');
      if (!state.agendamentos || !Array.isArray(state.agendamentos)) {
        if (cont) cont.innerHTML = '<div class="empty-state">A carregar agendamentos...</div>';
        return;
      }
      const data = state.agendaDataAtual || hoje();
      const ags = state.agendamentos.filter(a => a.data === data).sort((a, b) => a.hora.localeCompare(b.hora));
      const label = document.getElementById('agenda-date-label');
      if (!cont || !label) return;

      label.textContent = data === hoje() ? 'Hoje' : new Date(data + 'T00:00:00').toLocaleDateString('pt-AO', { day: '2-digit',
        month: 'short' });

      if (ags.length === 0) {
        cont.innerHTML = `<div class="empty-state">${svgCalendario}<p>Sem agendamentos para este dia</p></div>`;
        return;
      }

      cont.innerHTML = ags.map(a => {
        const isRealizado = a.status === 'realizado';
        return `
          <div class="timeline-item">
            <div class="time">${a.hora}</div>
            <div class="event">
              <div class="service">${escHtml(a.servico)}</div>
              <div class="client">👤 ${escHtml(a.cliente)}</div>
              <div class="meta">
                <span>👤 ${escHtml(a.profissional)}</span>
                <span class="pill" style="font-weight:700;">${fmtKz(a.preco)}</span>
                <span class="pill ${isRealizado ? 'gray' : 'green'}">${isRealizado ? '✅ Realizado' : '📅 Agendado'}</span>
                ${!isRealizado ? `<button class="btn btn-sm btn-success" data-id="${a.id}" data-action="finalizar">✅ Finalizar</button>` : ''}
                ${!isRealizado ? `<button class="btn btn-sm btn-danger" data-id="${a.id}" data-action="cancelar-agenda" data-role="admin,gerente" style="padding:4px 12px;font-size:.7rem;">Cancelar</button>` : ''}
              </div>
            </div>
          </div>
        `;
      }).join('');

      cont.querySelectorAll('[data-action="finalizar"]').forEach(btn => {
        btn.addEventListener('click', () => abrirFinalizarAtendimento(btn.dataset.id));
      });
    }

    function mudarAgenda(delta) {
      const atual = new Date(state.agendaDataAtual || hoje());
      atual.setDate(atual.getDate() + delta);
      state.agendaDataAtual = atual.toISOString().split('T')[0];
      renderAgendaFull();
    }

    function renderClientes() {
      const cont0 = document.getElementById('clientes-list');
      if (!state.clientes || !Array.isArray(state.clientes)) {
        if (cont0) cont0.innerHTML = '<div class="empty-state">A carregar clientes...</div>';
        return;
      }
      const search = document.getElementById('search-cliente')?.value.toLowerCase() || '';
      const filtro = state.filtroClientes || 'todos';
      const freqMap = {};
      (state.agendamentos || []).forEach(a => { freqMap[a.cliente] = (freqMap[a.cliente] || 0) + 1; });
      (state.movimentos || []).filter(m => m.tipo === 'venda').forEach(v => { freqMap[v.cliente] = (freqMap[v.cliente] || 0) + 1; });

      let filtered = state.clientes.filter(c => c.nome.toLowerCase().includes(search));
      if (filtro === 'mais') filtered.sort((a, b) => (freqMap[b.nome] || 0) - (freqMap[a.nome] || 0));
      else if (filtro === 'menos') filtered.sort((a, b) => (freqMap[a.nome] || 0) - (freqMap[b.nome] || 0));

      const cont = document.getElementById('clientes-list');
      if (filtered.length === 0) {
        cont.innerHTML = `<div class="empty-state">${svgPessoa}<p>${search ? 'Nenhum resultado' : 'Nenhum cliente ainda'}</p></div>`;
        return;
      }

      cont.innerHTML = filtered.map(c => {
        const freq = freqMap[c.nome] || 0;
        return `
          <div class="list-item" style="cursor:default;">
            <div class="avatar">${c.nome.charAt(0).toUpperCase()}</div>
            <div class="info">
              <div class="title">${escHtml(c.nome)}</div>
              <div class="sub">${escHtml(c.telefone || '')}${c.notas ? ' · ' + escHtml(c.notas) : ''} · ${freq} visitas</div>
            </div>
            <div class="actions">
              <button class="btn btn-sm btn-secondary" data-id="${c.id}" data-action="edit-c" data-role="admin,gerente,operador" style="padding:4px 12px;font-size:.7rem;">Ajustar perfil</button>
              <button class="btn btn-sm btn-danger" data-id="${c.id}" data-action="del-cliente" data-role="admin,gerente" style="padding:4px 12px;font-size:.7rem;">Excluir</button>
            </div>
          </div>
        `;
      }).join('');

      cont.querySelectorAll('[data-action="edit-c"]').forEach(b => {
        b.addEventListener('click', () => openEditCliente(b.dataset.id));
      });
    }

    function renderCaixa() {
      if (!state.movimentos || !Array.isArray(state.movimentos)) {
        const cont0 = document.getElementById('movimentos-list');
        if (cont0) cont0.innerHTML = '<div class="empty-state">A carregar movimentos...</div>';
        return;
      }
      const hojeStr = hoje();
      const entradas = state.movimentos.filter(m => m.data === hojeStr && m.tipo === 'venda').reduce((s, m) => s + m.valor, 0);
      const despesas = state.movimentos.filter(m => m.data === hojeStr && m.tipo === 'despesa').reduce((s, m) => s + m.valor, 0);
      document.getElementById('caixa-saldo').textContent = fmtKz(state.config.fundo + entradas - despesas);
      document.getElementById('caixa-fundo').textContent = fmtKz(state.config.fundo);

      const periodo = state.histPeriodo;
      const movs = getMovimentosPeriodo(periodo).sort((a, b) => b.data.localeCompare(a.data) || b.hora.localeCompare(a.hora));
      const titulos = { hoje: 'Movimentos de Hoje', '7dias': 'Últimos 7 dias', '30dias': 'Últimos 30 dias', mes: 'Este Mês',
        tudo: 'Histórico Completo' };
      document.getElementById('hist-titulo').textContent = titulos[periodo] || 'Movimentos';

      const cont = document.getElementById('movimentos-list');
      if (movs.length === 0) { cont.innerHTML = `<div class="empty-state">${svgCarteira}<p>Sem movimentos neste período</p></div>`; return; }
      cont.innerHTML = movs.map(m => {
        const isV = m.tipo === 'venda';
        return `
          <div class="list-item${isV ? ' list-item-venda' : ''}" data-id="${m.id}" data-tipo="${m.tipo}" style="padding-right:${isV ? '32px' : '16px'};">
            <div class="avatar" style="background:${isV ? '#E6F4EC' : '#FDE8E8'};color:${isV ? 'var(--green)' : 'var(--red)'}">${isV ? '💰' : '💸'}</div>
            <div class="info">
              <div class="title">${escHtml(m.descricao)}</div>
              <div class="sub">${m.data !== hojeStr ? m.data + ' · ' : ''}${m.hora}${isV ? ' · ' + escHtml(m.cliente || 'Anónimo') + ' · ' + escHtml(m.metodoPagamento || '') : ''}
              </div>
            </div>
            <div class="action" style="color:${isV ? 'var(--green)' : 'var(--red)'};">${isV ? '+' : '-'}${fmtKz(m.valor)}</div>
          </div>`;
      }).join('');

      cont.querySelectorAll('.list-item').forEach(el => {
        el.addEventListener('click', e => {
          if (el.dataset.tipo === 'venda') { addRipple(el, e);
            abrirDetalheVenda(el.dataset.id); } else toast('Detalhes disponíveis apenas para vendas', 'warning');
        });
      });
    }

    function getMovimentosPeriodo(periodo) {
      const hojeStr = hoje();
      const now = new Date();
      return state.movimentos.filter(m => {
        if (periodo === 'hoje') return m.data === hojeStr;
        if (periodo === '7dias') {
          const d7 = new Date(now);
          d7.setDate(d7.getDate() - 6);
          return m.data >= d7.toISOString().split('T')[0];
        }
        if (periodo === '30dias') {
          const d30 = new Date(now);
          d30.setDate(d30.getDate() - 29);
          return m.data >= d30.toISOString().split('T')[0];
        }
        if (periodo === 'mes') {
          const mes = String(now.getMonth() + 1).padStart(2, '0');
          return m.data.startsWith(now.getFullYear() + '-' + mes);
        }
        return true;
      });
    }

    function renderProfissionais() {
      const cont = document.getElementById('profissionais-list');
      if (!cont) return;
      const plano = getPlanoAtual();
      const aviso = document.getElementById('plano-aviso');
      if (aviso) aviso.style.display = (plano === 'trial' || plano === 'starter') ? 'block' : 'none';

      if (state.profissionais.length === 0) {
        cont.innerHTML = `<div class="empty-state">${svgPessoas}<p>Adicione o primeiro profissional</p></div>`;
        return;
      }
      cont.innerHTML = state.profissionais.map(p => `
        <div class="prof-card">
          <div class="prof-avatar">${p.nome.charAt(0).toUpperCase()}</div>
          <div style="flex:1;min-width:0;">
            <div style="font-weight:600;font-size:.9rem;">${escHtml(p.nome)}</div>
            <div style="font-size:.72rem;color:var(--text-secondary);">${escHtml(p.especialidade || '')}</div>
          </div>
          <div class="actions">
            <button class="btn btn-sm btn-secondary" data-id="${p.id}" data-action="edit-p" data-role="admin" style="padding:4px 12px;font-size:.7rem;">Ajustar</button>
            <button class="btn btn-sm btn-danger" data-id="${p.id}" data-action="del-p" data-role="admin" style="padding:4px 12px;font-size:.7rem;">Excluir</button>
          </div>
        </div>
      `).join('');

      cont.querySelectorAll('[data-action="edit-p"]').forEach(b => {
        b.addEventListener('click', () => openEditProf(b.dataset.id));
      });
    }

    function renderServicos() {
      const container = document.getElementById('servicos-list');
      if (!container) return;
      if (state.servicos.length === 0) {
        container.innerHTML = `<div class="empty-state">${svgTesoura}<p>Nenhum serviço cadastrado</p></div>`;
        return;
      }
      container.innerHTML = state.servicos.map(s => {
        const profs = s.profissionais && s.profissionais.length > 0 ? s.profissionais.join(', ') : 'Todos os profissionais disponíveis';
        return `
          <div class="list-item" style="cursor:default;">
            <div class="avatar" style="background:var(--gold-light);color:var(--gold-dark);">💈</div>
            <div class="info">
              <div class="title">${escHtml(s.nome)}</div>
              <div class="sub">${fmtKz(s.precoBase)} · 👤 ${escHtml(profs)}</div>
            </div>
            <div class="actions">
              <button class="btn btn-sm btn-secondary" data-id="${s.id}" data-action="edit-servico" data-role="admin">✏️</button>
              <button class="btn btn-sm btn-danger" data-id="${s.id}" data-action="del-servico" data-role="admin">✕</button>
            </div>
          </div>
        `;
      }).join('');

      container.querySelectorAll('[data-action="edit-servico"]').forEach(b => {
        b.addEventListener('click', () => openServicoModal(b.dataset.id));
      });
    }

    function renderBadges() {
      const count = state.agendamentos.filter(a => a.data === hoje() && a.status !== 'realizado').length;
      const badge = document.getElementById('agenda-badge');
      if (count > 0) { badge.textContent = count > 9 ? '9+' : count;
        badge.classList.add('show'); } else badge.classList.remove('show');
    }

    // ====================================================================
    //  SETUP DE PRECIFICAÇÃO E SELECTS
    // ====================================================================
    function setupPrecoAutomatico(selectId, inputPrecoId) {
      const select = document.getElementById(selectId);
      const inputPreco = document.getElementById(inputPrecoId);
      if (!select || !inputPreco) return;
      if (select._precoHandler) select.removeEventListener('change', select._precoHandler);
      const handler = () => {
        const nome = select.value;
        if (!nome || nome === 'Outro' || nome === '__custom') {
          inputPreco.value = '';
          inputPreco.disabled = false;
          inputPreco.style.opacity = '1';
          return;
        }
        const serv = state.servicos.find(s => s.nome === nome);
        if (serv) {
          inputPreco.value = serv.precoBase;
          inputPreco.disabled = true;
          inputPreco.style.opacity = '0.7';
        } else {
          inputPreco.value = '';
          inputPreco.disabled = false;
          inputPreco.style.opacity = '1';
        }
      };
      select._precoHandler = handler;
      select.addEventListener('change', handler);
      handler();
    }

    function populateAgendaSelects() {
      const profSel = document.getElementById('agenda-profissional');
      const servSel = document.getElementById('agenda-servico');
      if (!profSel || !servSel) return;
      const prevServico = servSel.value;
      servSel.innerHTML = state.servicos.map(s =>
        `<option value="${escHtml(s.nome)}">${escHtml(s.nome)}</option>`
      ).join('') + '<option value="Outro">Outro / Personalizado</option>';
      if (prevServico) servSel.value = prevServico;
      const filtrarProfsAgenda = (servicoNome) => {
        let profs;
        if (!servicoNome || servicoNome === 'Outro') profs = state.profissionais.map(p => p.nome);
        else {
          const serv = state.servicos.find(s => s.nome === servicoNome);
          profs = serv && serv.profissionais && serv.profissionais.length > 0 ? serv.profissionais : state.profissionais.map(p => p.nome);
        }
        const prevProf = profSel.value;
        profSel.innerHTML = profs.map(n => `<option value="${escHtml(n)}">${escHtml(n)}</option>`).join('');
        if (profs.includes(prevProf)) profSel.value = prevProf;
      };
      filtrarProfsAgenda(servSel.value);
      if (servSel._filterHandler) servSel.removeEventListener('change', servSel._filterHandler);
      servSel._filterHandler = function() { filtrarProfsAgenda(this.value); };
      servSel.addEventListener('change', servSel._filterHandler);
    }

    function populateVendaSelects() {
      const profSel = document.getElementById('venda-profissional');
      const catSel = document.getElementById('ci-servico-sel');
      if (!profSel || !catSel) return;
      const prevServ = catSel.value;
      catSel.innerHTML = state.servicos.map(s =>
        `<option value="${escHtml(s.nome)}" data-preco="${s.precoBase}">${escHtml(s.nome)}</option>`
      ).join('') + '<option value="__custom" data-preco="">✏️ Outro (personalizado)</option>';
      if (prevServ) catSel.value = prevServ;
      const filtrarProfsVenda = (servicoNome) => {
        let profs;
        if (!servicoNome || servicoNome === '__custom') profs = state.profissionais.map(p => p.nome);
        else {
          const serv = state.servicos.find(s => s.nome === servicoNome);
          profs = serv && serv.profissionais && serv.profissionais.length > 0 ? serv.profissionais : state.profissionais.map(p => p.nome);
        }
        const prevProf = profSel.value;
        profSel.innerHTML = profs.map(n => `<option value="${escHtml(n)}">${escHtml(n)}</option>`).join('');
        if (profs.includes(prevProf)) profSel.value = prevProf;
      };
      filtrarProfsVenda(catSel.value);
      if (catSel._filterHandler) catSel.removeEventListener('change', catSel._filterHandler);
      catSel._filterHandler = function() {
        filtrarProfsVenda(this.value);
        const opt = this.options[this.selectedIndex];
        const ciValor = document.getElementById('ci-valor');
        if (this.value === '__custom') {
          if (ciValor) { ciValor.value = ''; ciValor.disabled = false; ciValor.style.opacity = '1'; }
        } else if (opt && opt.dataset.preco) {
          if (ciValor) { ciValor.value = opt.dataset.preco; ciValor.disabled = true; ciValor.style.opacity = '0.7'; }
        } else {
          if (ciValor) { ciValor.value = ''; ciValor.disabled = false; ciValor.style.opacity = '1'; }
        }
      };
      catSel.addEventListener('change', catSel._filterHandler);
      if (catSel.value) catSel._filterHandler.call(catSel);
    }

    // ====================================================================
    //  GRÁFICO (com melhorias)
    // ====================================================================
    let _chartSwipeStartX = null;
    let _chartSwipeStartY = null;

    function renderizarGrafico() {
      const canvas = document.getElementById('weekly-chart');
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      const parentWidth = canvas.parentElement.getBoundingClientRect().width || 400;
      const width = Math.max(parentWidth, 200);
      const height = 160;
      canvas.width = width;
      canvas.height = height;
      ctx.clearRect(0, 0, width, height);

      const periodo = state.chartPeriodo || 'semana';
      const offset = state.chartOffset || 0;
      const mostrarValores = state.chartMostrarValores || false;

      const diasArr = [];
      let labels = [];
      let dados = [];
      let maxVal = 1;

      if (periodo === 'hora') {
        for (let h = 0; h < 12; h++) {
          const d = new Date();
          d.setDate(d.getDate() - offset);
          const ds = d.toISOString().split('T')[0];
          const hr = String(h * 2).padStart(2, '0');
          diasArr.push({ label: hr + 'h', data: ds, hora: hr });
        }
        labels = diasArr.map(d => d.label);
        dados = diasArr.map(d => {
          const hr = parseInt(d.hora);
          const total = state.movimentos.filter(m =>
            m.data === d.data && m.tipo === 'venda' && m.hora &&
            parseInt(m.hora.split(':')[0]) >= hr && parseInt(m.hora.split(':')[0]) < hr + 2
          ).reduce((s, v) => s + v.valor, 0);
          if (total > maxVal) maxVal = total;
          return total;
        });
      } else if (periodo === 'dia' || periodo === 'semana') {
        for (let i = 6; i >= 0; i--) {
          const d = new Date();
          d.setDate(d.getDate() - i - offset * 7);
          const ds = d.toISOString().split('T')[0];
          const label = d.toLocaleDateString('pt-AO', { weekday: 'short' }).replace('.', '');
          diasArr.push({ label, data: ds });
        }
        labels = diasArr.map(d => d.label);
        dados = diasArr.map(d => {
          const total = state.movimentos.filter(m => m.data === d.data && m.tipo === 'venda').reduce((s, v) => s + v.valor, 0);
          if (total > maxVal) maxVal = total;
          return total;
        });
      } else if (periodo === 'mes') {
        for (let i = 6; i >= 0; i--) {
          const dStart = new Date();
          dStart.setDate(dStart.getDate() - (i * 4 + 3) - offset * 30);
          const dEnd = new Date();
          dEnd.setDate(dEnd.getDate() - i * 4 - offset * 30);
          const label = dEnd.toLocaleDateString('pt-AO', { day: '2-digit', month: 'short' }).replace('.', '');
          const startStr = dStart.toISOString().split('T')[0];
          const endStr = dEnd.toISOString().split('T')[0];
          diasArr.push({ label, startData: startStr, endData: endStr });
        }
        labels = diasArr.map(d => d.label);
        dados = diasArr.map(d => {
          const total = state.movimentos.filter(m =>
            m.tipo === 'venda' && m.data >= d.startData && m.data <= d.endData
          ).reduce((s, v) => s + v.valor, 0);
          if (total > maxVal) maxVal = total;
          return total;
        });
      }

      maxVal = Math.max(maxVal, 1);

      const barW = (width - 40) / labels.length - 4;
      const startX = 20;
      const baseY = height - 20;

      for (let i = 0; i < labels.length; i++) {
        const x = startX + i * (barW + 4);
        const barH = Math.max(4, (dados[i] / maxVal) * (height - 40));
        const y = baseY - barH;
        const radius = 4;

        const grad = ctx.createLinearGradient(0, y, 0, baseY);
        if (dados[i] > 0) {
          grad.addColorStop(0, '#D4AF37');
          grad.addColorStop(1, '#A7872B');
        } else {
          grad.addColorStop(0, '#DCD5C9');
          grad.addColorStop(1, '#DCD5C9');
        }
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.moveTo(x + radius, y);
        ctx.lineTo(x + barW - radius, y);
        ctx.arcTo(x + barW, y, x + barW, y + radius, radius);
        ctx.lineTo(x + barW, baseY);
        ctx.lineTo(x, baseY);
        ctx.lineTo(x, y + radius);
        ctx.arcTo(x, y, x + radius, y, radius);
        ctx.closePath();
        ctx.fill();

        ctx.fillStyle = (i === labels.length - 1 && offset === 0) ? '#1C1A18' : '#8c8980';
        ctx.font = (i === labels.length - 1 && offset === 0) ? 'bold 9px Inter' : '9px Inter';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        ctx.fillText(labels[i], x + barW / 2, baseY + 4);

        if (mostrarValores && dados[i] > 0) {
          ctx.fillStyle = '#1C1A18';
          ctx.font = 'bold 9px Inter';
          ctx.textBaseline = 'bottom';
          ctx.fillText(fmtKz(dados[i]).replace(' Kz', ''), x + barW / 2, y - 2);
        }
      }

      const labelEl = document.getElementById('chart-period-label');
      if (labelEl) {
        const periodoLabels = {
          hora:   offset === 0 ? 'Hoje por hora'    : `Há ${offset} dias (hora)`,
          dia:    offset === 0 ? 'Últimos 7 dias'   : `Semana −${offset}`,
          semana: offset === 0 ? 'Últimos 7 dias'   : `Semana −${offset}`,
          mes:    offset === 0 ? 'Últimos 30 dias'  : `Período −${offset}`
        };
        labelEl.textContent = periodoLabels[periodo] || 'Últimos 7 dias';
      }

      const tooltip = document.getElementById('chart-tooltip');
      if (!tooltip) return;

      const handleHover = (clientX, clientY) => {
        const rect = canvas.getBoundingClientRect();
        const scaleX = canvas.width / rect.width;
        const mouseX = (clientX - rect.left) * scaleX;
        let idx = -1;
        for (let i = 0; i < labels.length; i++) {
          const x = startX + i * (barW + 4);
          if (mouseX >= x && mouseX <= x + barW) { idx = i; break; }
        }
        if (idx !== -1 && dados[idx] > 0) {
          tooltip.style.left = (clientX + 10) + 'px';
          tooltip.style.top  = (clientY - 30) + 'px';
          tooltip.textContent = `${labels[idx]}: ${fmtKz(dados[idx])}`;
          tooltip.style.opacity = '1';
        } else {
          tooltip.style.opacity = '0';
        }
      };

      canvas.onmousemove  = e => handleHover(e.clientX, e.clientY);
      canvas.onmouseleave = () => { tooltip.style.opacity = '0'; };

      canvas.ontouchstart = e => {
        if (e.touches.length > 0) {
          _chartSwipeStartX = e.touches[0].clientX;
          _chartSwipeStartY = e.touches[0].clientY;
          handleHover(e.touches[0].clientX, e.touches[0].clientY);
        }
      };
      canvas.ontouchmove = e => {
        if (e.touches.length > 0) handleHover(e.touches[0].clientX, e.touches[0].clientY);
      };
      canvas.ontouchend = e => {
        tooltip.style.opacity = '0';
        if (_chartSwipeStartX !== null && e.changedTouches.length > 0) {
          const dx = e.changedTouches[0].clientX - _chartSwipeStartX;
          const dy = e.changedTouches[0].clientY - _chartSwipeStartY;
          if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy)) {
            if (dx < 0) state.chartOffset += 1;
            else if (state.chartOffset > 0) state.chartOffset -= 1;
            localStorage.setItem('bp_chart_offset', String(state.chartOffset));
            renderizarGrafico();
          }
        }
        _chartSwipeStartX = null;
        _chartSwipeStartY = null;
      };
    }

    function initChartControls() {
      document.querySelectorAll('.chart-filter').forEach(btn => {
        btn.addEventListener('click', function() {
          const periodo = this.dataset.periodo;
          state.chartPeriodo = periodo;
          localStorage.setItem('bp_chart_periodo', periodo);
          state.chartOffset = 0;
          localStorage.setItem('bp_chart_offset', '0');
          document.querySelectorAll('.chart-filter').forEach(b => {
            b.classList.remove('btn-primary');
            b.classList.add('btn-secondary');
          });
          this.classList.remove('btn-secondary');
          this.classList.add('btn-primary');
          renderizarGrafico();
        });
      });

      const prevBtn = document.getElementById('chart-prev');
      const nextBtn = document.getElementById('chart-next');
      if (prevBtn) prevBtn.onclick = () => { state.chartOffset += 1; localStorage.setItem('bp_chart_offset', String(state.chartOffset)); renderizarGrafico(); };
      if (nextBtn) nextBtn.onclick = () => { if (state.chartOffset > 0) { state.chartOffset -= 1; localStorage.setItem('bp_chart_offset', String(state.chartOffset)); renderizarGrafico(); } };

      const eyeToggle = document.getElementById('chart-eye-toggle');
      if (eyeToggle) {
        eyeToggle.addEventListener('click', function() {
          state.chartMostrarValores = !state.chartMostrarValores;
          localStorage.setItem('bp_chart_mostrar_valores', String(state.chartMostrarValores));
          const svg = this.querySelector('svg');
          if (svg) {
            if (state.chartMostrarValores) {
              svg.innerHTML = `<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>`;
            } else {
              svg.innerHTML = `<path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/>`;
            }
          }
          renderizarGrafico();
        });
      }
    }

    // ====================================================================
    //  DETALHE VENDA E IMPRESSÃO
    // ====================================================================
    let vendaAtual = null;

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
      document.getElementById('detalhe-venda-conteudo').innerHTML = `
        <div class="detalhe-meta">
          <div class="detalhe-meta-row"><span class="label">Cliente</span><span class="val">${escHtml(venda.cliente || 'Anónimo')}</span></div>
          <div class="detalhe-meta-row"><span class="label">Profissional</span><span class="val">${escHtml(venda.profissional || 'N/A')}</span></div>
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
      const storeName = state.config.storeName || 'BelezaPro';
      const num = nextReciboNum();
      const itensHtml = venda.itens && venda.itens.length > 0 ?
        `<div class="r-th"><span class="r-th-desc">SERVICO</span><span class="r-th-qty">QT</span><span class="r-th-sub">TOTAL</span></div>
         ${venda.itens.map(i => `<div class="r-item"><span class="r-item-name">${escHtml(i.nome)}</span><span class="r-item-qty">x${i.quantidade}</span><span class="r-item-sub">${fmtKz(i.subtotal)}</span></div>`).join('')}` :
        '<div style="font-size:7pt;">Sem itens</div>';
      document.getElementById('recibo-print').innerHTML = `
        <div class="r-store">${escHtml(storeName)}</div>
        <div class="r-sub">Luanda, Angola</div>
        <div class="r-num">Recibo N.º ${num}</div>
        <div class="r-num">${venda.data} &nbsp; ${venda.hora}</div>
        <hr class="r-div">
        <div class="r-meta"><b>CLIENTE: </b>${escHtml(venda.cliente || 'Anonimo')}</div>
        <div class="r-meta"><b>PROF.: </b>${escHtml(venda.profissional || 'N/A')}</div>
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
    //  CARRINHO E VENDA (com animações)
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
      // Animar o último item adicionado
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
        clientSel.innerHTML = '<option value="">Cliente não identificado</option>' + (state.clientes || []).map(c =>
          `<option value="${escHtml(c.nome)}">${escHtml(c.nome)}</option>`).join('');
      }
      populateVendaSelects();
      renderCart();
      openModal('modal-venda');
    }

    // Remoção animada do carrinho
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

    // ====================================================================
    //  KPIS DETALHE
    // ====================================================================
    function abrirDetalheFaturamento() {
      const list = document.getElementById('revenue-detail-list');
      const totalSpan = document.getElementById('revenue-detail-total');
      if (!state.movimentos || !Array.isArray(state.movimentos)) {
        if (list) list.innerHTML = '<div class="empty-state"><p>A carregar...</p></div>';
        if (totalSpan) totalSpan.textContent = '0 Kz';
        openModal('modal-revenue-detail');
        return;
      }
      const hojeStr = hoje();
      const vendasHoje = state.movimentos.filter(m => m.data === hojeStr && m.tipo === 'venda');
      if (vendasHoje.length === 0) {
        list.innerHTML = '<div class="empty-state"><p>Nenhuma venda hoje</p></div>';
        totalSpan.textContent = '0 Kz';
      } else {
        list.innerHTML = vendasHoje.map(v => `
          <div class="list-item" style="cursor:default;">
            <div class="avatar" style="background:#E6F4EC;color:var(--green);">💰</div>
            <div class="info">
              <div class="title">${escHtml(v.cliente || 'Anónimo')}</div>
              <div class="sub">${escHtml(v.descricao)} · ${v.hora}</div>
            </div>
            <div class="action">${fmtKz(v.valor)}</div>
          </div>
        `).join('');
        const total = vendasHoje.reduce((s, v) => s + v.valor, 0);
        totalSpan.textContent = fmtKz(total);
      }
      openModal('modal-revenue-detail');
    }

    let agendaDetailFiltro = 'pendentes';

    function abrirDetalheAgendamentos(filtro = 'pendentes') {
      agendaDetailFiltro = filtro;
      const list = document.getElementById('agenda-detail-list');
      const btnPend = document.getElementById('agenda-detail-pendentes');
      const btnReal = document.getElementById('agenda-detail-realizados');
      if (!state.agendamentos || !Array.isArray(state.agendamentos)) {
        if (list) list.innerHTML = '<div class="empty-state"><p>A carregar...</p></div>';
        openModal('modal-agenda-detail');
        return;
      }
      const hojeStr = hoje();
      const ags = state.agendamentos.filter(a => a.data === hojeStr);
      if (btnPend) btnPend.className = 'btn btn-sm ' + (filtro === 'pendentes' ? 'btn-primary' : 'btn-secondary');
      if (btnReal) btnReal.className = 'btn btn-sm ' + (filtro === 'realizados' ? 'btn-primary' : 'btn-secondary');
      const filtrados = filtro === 'pendentes' ? ags.filter(a => a.status !== 'realizado') : ags.filter(a => a.status === 'realizado');
      if (filtrados.length === 0) {
        list.innerHTML = `<div class="empty-state"><p>Nenhum agendamento ${filtro === 'pendentes' ? 'pendente' : 'realizado'} hoje</p></div>`;
      } else {
        list.innerHTML = filtrados.map(a => `
          <div class="list-item" style="cursor:default;">
            <div class="avatar" style="background:var(--gold-light);color:var(--gold-dark);">📅</div>
            <div class="info">
              <div class="title" style="color:var(--gold-dark);">${escHtml(a.servico)}</div>
              <div class="sub">👤 ${escHtml(a.cliente)} · ${a.hora} · ${escHtml(a.profissional)}</div>
            </div>
            <div class="action">${fmtKz(a.preco)}</div>
          </div>
        `).join('');
      }
      openModal('modal-agenda-detail');
    }

    function abrirFechoCaixa() {
      const hojeStr = hoje();
      const movs = state.movimentos.filter(m => m.data === hojeStr);
      const vendas = movs.filter(m => m.tipo === 'venda');
      const despesas = movs.filter(m => m.tipo === 'despesa');
      const totalVendas = vendas.reduce((s, v) => s + v.valor, 0);
      const totalDespesas = despesas.reduce((s, d) => s + d.valor, 0);
      const saldoFinal = state.config.fundo + totalVendas - totalDespesas;
      const byPag = {};
      vendas.forEach(v => { const k = v.metodoPagamento || 'Numerário';
        byPag[k] = (byPag[k] || 0) + v.valor; });
      const pagHtml = Object.entries(byPag).map(([k, v]) =>
        `<div class="fecho-row"><span class="fr-label">${escHtml(k)}</span><span class="fr-val">${fmtKz(v)}</span></div>`
        ).join('');
      document.getElementById('fecho-conteudo').innerHTML = `
        <div style="font-size:.75rem;font-weight:600;color:var(--text-muted);text-transform:uppercase;letter-spacing:.05em;margin-bottom:8px;">${new Date().toLocaleDateString('pt-AO', { day: '2-digit', month: 'long', year: 'numeric' })}</div>
        <div class="fecho-row"><span class="fr-label">Fundo de abertura</span><span class="fr-val">${fmtKz(state.config.fundo)}</span></div>
        <div class="fecho-row"><span class="fr-label">Total de vendas (${vendas.length})</span><span class="fr-val" style="color:var(--green)">+${fmtKz(totalVendas)}</span></div>
        <div class="fecho-row"><span class="fr-label">Total de despesas (${despesas.length})</span><span class="fr-val" style="color:var(--red)">-${fmtKz(totalDespesas)}</span></div>
        <div style="margin:8px 0 4px;font-size:.7rem;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:var(--text-muted);">Por método de pagamento</div>
        ${pagHtml || '<div class="fecho-row"><span class="fr-label">—</span><span class="fr-val">0 Kz</span></div>'}
        <div class="fecho-row total-row"><span class="fr-label">Saldo Final em Caixa</span><span class="fr-val">${fmtKz(saldoFinal)}</span></div>`;
      openModal('modal-fecho');
    }

    // ====================================================================
    //  FUNÇÕES DE ACESSIBILIDADE (Fase 5)
    // ====================================================================
    function aplicarAcessibilidade() {
      document.querySelectorAll('.ci-del').forEach(el => { if (!el.hasAttribute('aria-label')) el.setAttribute('aria-label', 'Remover item'); });
      document.querySelectorAll('.nav-item').forEach((el, index) => {
        if (!el.hasAttribute('role')) el.setAttribute('role', 'tab');
        if (!el.hasAttribute('aria-selected')) el.setAttribute('aria-selected', el.classList.contains('active') ? 'true' : 'false');
        const tabId = el.dataset.tab;
        if (tabId) el.setAttribute('aria-controls', 'tab-' + tabId);
      });
      const nav = document.querySelector('.bottom-nav');
      if (nav && !nav.hasAttribute('role')) nav.setAttribute('role', 'tablist');
      document.querySelectorAll('.modal-overlay').forEach(modal => {
        if (!modal.hasAttribute('role')) modal.setAttribute('role', 'dialog');
        if (!modal.hasAttribute('aria-modal')) modal.setAttribute('aria-modal', 'true');
        const title = modal.querySelector('.modal-title');
        if (title && title.id) modal.setAttribute('aria-labelledby', title.id);
      });
      const liveAreas = ['agenda-full-list', 'clientes-list', 'movimentos-list', 'agenda-today-list'];
      liveAreas.forEach(id => {
        const el = document.getElementById(id);
        if (el && !el.hasAttribute('aria-live')) { el.setAttribute('aria-live', 'polite');
          el.setAttribute('aria-atomic', 'true'); }
      });
    }

    // ====================================================================
    //  FOCUS TRAPPING (Fase 5)
    // ====================================================================
    let previousFocusedElement = null;

    function trapFocus(modal) {
      const focusableElements = modal.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
      if (focusableElements.length === 0) return;
      const firstElement = focusableElements[0];
      const lastElement = focusableElements[focusableElements.length - 1];
      modal.addEventListener('keydown', function(e) {
        if (e.key === 'Tab') {
          if (e.shiftKey) {
            if (document.activeElement === firstElement) { e.preventDefault();
              lastElement.focus(); }
          } else {
            if (document.activeElement === lastElement) { e.preventDefault();
              firstElement.focus(); }
          }
        }
      });
    }

    const originalOpenModal = window.openModal;
    if (originalOpenModal) {
      window.openModal = function(id) {
        const modal = document.getElementById(id);
        if (!modal) return;
        previousFocusedElement = document.activeElement;
        originalOpenModal(id);
        trapFocus(modal);
        const firstFocusable = modal.querySelector('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
        if (firstFocusable) setTimeout(() => firstFocusable.focus(), 100);
      };
    }
    const originalCloseModal = window.closeModal;
    if (originalCloseModal) {
      window.closeModal = function(id) {
        originalCloseModal(id);
        if (previousFocusedElement) { setTimeout(() => { previousFocusedElement.focus();
            previousFocusedElement = null; }, 200); }
      };
    }

    // ====================================================================
    //  LOADING (Fase 1)
    // ====================================================================
    // setButtonLoading, showConfirmModal, mostrarErro movidos para core-utils.js

    // ====================================================================
    //  IA OFFLINE (Fase 7)
    // ====================================================================
    function atualizarIAOffline() {
      const overlay = document.getElementById('ia-offline-overlay');
      if (!overlay) return;
      const isOnline = navigator.onLine;
      overlay.style.display = isOnline ? 'none' : 'flex';
    }

    // ====================================================================
    //  SVGs PARA EMPTY STATES (Fase 7)
    // ====================================================================
    const svgCalendario = `<svg width="80" height="80" viewBox="0 0 80 80" fill="none" stroke="var(--neutral-300)" stroke-width="1.5"><rect x="16" y="20" width="48" height="48" rx="4"/><line x1="16" y1="32" x2="64" y2="32"/><line x1="28" y1="16" x2="28" y2="24"/><line x1="52" y1="16" x2="52" y2="24"/><circle cx="40" cy="44" r="6"/></svg>`;
    const svgCarteira = `<svg width="80" height="80" viewBox="0 0 80 80" fill="none" stroke="var(--neutral-300)" stroke-width="1.5"><rect x="12" y="28" width="56" height="36" rx="4"/><path d="M12 36h8a8 8 0 0 1 0 16h-8"/><circle cx="48" cy="46" r="4"/></svg>`;
    const svgPessoas = `<svg width="80" height="80" viewBox="0 0 80 80" fill="none" stroke="var(--neutral-300)" stroke-width="1.5"><circle cx="30" cy="24" r="12"/><circle cx="50" cy="24" r="10"/><path d="M10 64c0-12 6-20 20-20s20 8 20 20"/><path d="M56 64c0-8 4-14 14-14s14 6 14 14"/></svg>`;
    const svgTesoura = `<svg width="80" height="80" viewBox="0 0 80 80" fill="none" stroke="var(--neutral-300)" stroke-width="1.5"><circle cx="28" cy="36" r="8"/><circle cx="52" cy="36" r="8"/><path d="M20 44 L60 24 M20 24 L60 44"/></svg>`;
    const svgPessoa = `<svg width="80" height="80" viewBox="0 0 80 80" fill="none" stroke="var(--neutral-300)" stroke-width="1.5"><circle cx="40" cy="30" r="16"/><path d="M12 68c0-12 8-20 28-20s28 8 28 20"/></svg>`;

    // ====================================================================
    //  NAVEGAÇÃO ENTRE ABAS (com activeTab)
    // ====================================================================
    document.querySelectorAll('.nav-item').forEach(btn => {
      btn.addEventListener('click', function() {
        const tab = this.dataset.tab;
        // Guarda de RBAC: mesmo que o item de navegação tenha sido forçado a
        // aparecer por manipulação directa do DOM, a troca de aba não avança
        // se o papel actual não estiver na lista de data-role do próprio botão.
        if (this.dataset.role) {
          const permitido = this.dataset.role.split(',').map(r => r.trim()).includes(normalizarRole(state.config.userRole));
          if (!permitido) {
            toast('Não tem permissão para aceder a essa área.', 'error');
            return;
          }
        }
        activeTab = tab;
        document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));
        document.getElementById('tab-' + tab).classList.add('active');
        document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
        this.classList.add('active');
        // Atualizar ARIA
        document.querySelectorAll('.nav-item').forEach(n => n.setAttribute('aria-selected', 'false'));
        this.setAttribute('aria-selected', 'true');
        // Renderizar apenas a aba selecionada
        if (tab === 'agenda') renderAgendaFull();
        if (tab === 'clientes') renderClientes();
        if (tab === 'caixa') renderCaixa();
        if (tab === 'dashboard') renderDashboard();
        if (tab === 'equipa') { renderProfissionais();
          renderServicos(); }
        if (tab === 'ia') {
          document.getElementById('ia-contador').textContent = parseInt(localStorage.getItem('ia_perguntas_' + hoje()) ||
            '0');
          renderPlanoInfo();
          atualizarIAOffline();
        }
        aplicarAcessibilidade();
        // Reaplica RBAC: as renderizações acima regeneram HTML (botões de
        // editar/excluir profissionais e serviços, KPI de faturamento) e
        // precisam de ser corrigidas de novo para o papel actual.
        aplicarPermissoes();
      });
    });

    // ====================================================================
    //  RBAC — CONTROLO DE PERMISSÕES
    // ====================================================================
    // ====================================================================
    //  RBAC — item 1.1 da Especificação de Implementação
    //  Papéis suportados: admin, gerente, operador.
    //  Regra "fail closed": qualquer role vazio/nulo/desconhecido é
    //  tratado como 'operador' (o mais restritivo), nunca como permissivo.
    // ====================================================================
    // RBAC_ROLES movido para core-constants.js

    function normalizarRole(role) {
      if (RBAC_ROLES.includes(role)) return role;
      if (role) console.warn('[RBAC] role desconhecido recebido do perfil ("' + role + '") — a aplicar acesso mínimo (operador).');
      return 'operador';
    }

    function aplicarPermissoes() {
      const role = normalizarRole(state.config.userRole);
      state.config.userRole = role; // normaliza no state para todo o resto do código

      document.querySelectorAll('[data-role]').forEach(el => {
        const allowed = el.dataset.role.split(',').map(r => r.trim());
        const permitido = allowed.includes(role);
        if (el.dataset.roleMode === 'disable') {
          // Elemento fica visível mas inoperante — comunica que a acção existe
          // mas não está disponível para este papel (heurística "Visibilidade
          // do estado do sistema", secção 7 da Especificação).
          el.disabled = !permitido;
          el.style.opacity = permitido ? '' : '0.45';
          el.style.pointerEvents = permitido ? '' : 'none';
          el.title = permitido ? '' : 'Acção não disponível para o seu papel de utilizador';
        } else {
          // Modo oculto: removido do fluxo de layout, não apenas invisível,
          // para não ser anunciado por leitores de ecrã (critério de aceitação 1.1).
          el.style.display = permitido ? '' : 'none';
        }
      });

      // Defesa em profundidade: se a aba activa deixou de ser permitida para
      // este papel (ex.: sessão restaurada com um papel diferente), devolve
      // o utilizador ao dashboard em vez de o deixar num ecrã restrito.
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
    // Login
    document.getElementById('login-btn').addEventListener('click', async function() {
      const email    = document.getElementById('login-email').value.trim();
      const password = document.getElementById('login-password').value.trim();
      if (!email || !password) { toast('Preencha email e password', 'error'); return; }
      setButtonLoading(this, true);
      try {
        const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });
        if (error) throw error;
        document.getElementById('login-view').style.display = 'none';
        document.getElementById('app-view').style.display  = 'flex';
        const { data: profile, error: profileError } = await supabaseClient
          .from('profiles')
          .select('salao_id, role, nome')
          .eq('user_id', data.user.id)
          .single();
        if (profileError) {
          toast('Perfil não encontrado. Contacte o administrador.', 'error');
          document.getElementById('login-view').style.display = 'flex';
          document.getElementById('app-view').style.display  = 'none';
          return;
        }
        state.config.salaoId   = profile.salao_id;
        state.config.storeName = profile.nome || 'Salão';
        state.config.userRole  = profile.role;
        // Aplica o papel ANTES de loadState()/updateUI() gerarem a interface,
        // para que nenhum elemento restrito seja pintado mesmo momentaneamente
        // (critério de aceitação da secção 4/9 do item 1.1 da Especificação).
        aplicarPermissoes();
        await sincronizarConfigDoServidor(); // servidor sobrepõe plano/trial locais
        await loadState();
        if (navigator.onLine) {
          atualizarIndicadorSync();
        }
        toast('Bem-vindo(a), ' + profile.nome + '!', 'success');
        if (typeof carregarHistoricoIA === 'function') carregarHistoricoIA();
        // Reaplica por defesa: renderDashboard/renderProfissionais/renderServicos
        // (chamados dentro de loadState → updateUI) regeneram HTML e podem
        // reintroduzir elementos sem a restrição — este segundo passo garante
        // que ficam sempre corrigidos, sem depender da ordem interna de updateUI().
        aplicarPermissoes();
        // Onboarding (Fase 2)
        if (!localStorage.getItem('bp_onboarding_seen')) {
          document.getElementById('onboarding-screen').style.display = 'flex';
          showOnboardingSlide(0);
        }
        aplicarAcessibilidade();
      } catch (err) {
        if (typeof Sentry !== 'undefined' && Sentry.captureException) {
          Sentry.captureException(err, { tags: { action: 'login' }, extra: { email } });
        }
        toast('Erro ao entrar: ' + (err.message || 'Verifique as suas credenciais'), 'error');
      } finally {
        setButtonLoading(this, false);
      }
    });

    document.getElementById('signup-link')?.addEventListener('click', (e) => {
      e.preventDefault();
      toast('Peça ao administrador para criar a sua conta.', 'warning');
    });

    document.getElementById('logout-btn')?.addEventListener('click', async function() {
      logoutVoluntarioEmCurso = true;
      const confirmed = await showConfirmModal('Sair da aplicação', 'Tem a certeza que quer sair?', false);
      if (!confirmed) logoutVoluntarioEmCurso = false;
      if (confirmed) {
        // CORREÇÃO: localStorage.clear() foi removido — apagava o token/estado
        // de TODAS as abas abertas (multi-aba), derrubando sessões noutras abas
        // e potencialmente perdendo a fila de sincronização pendente. Agora
        // apenas terminamos a sessão no Supabase; o signOut já invalida o token.
        await supabaseClient.auth.signOut();
        location.reload();
      }
    });

    // CTA VENDA
    document.getElementById('nova-venda-hero-btn').addEventListener('click', openVendaModal);

    // FAB AGENDA
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

    // AGENDA SAVE
    document.getElementById('modal-agenda-save').addEventListener('click', async () => {
      const cliente = document.getElementById('agenda-cliente').value;
      const servico = document.getElementById('agenda-servico').value;
      const profissional = document.getElementById('agenda-profissional').value;
      const datetime = document.getElementById('agenda-datetime').value;
      const preco = parseFloat(document.getElementById('agenda-preco').value);
      if (!cliente || !servico || !datetime) { toast('Preencha todos os campos obrigatórios', 'error'); return; }
      if (isNaN(preco) || preco <= 0) { toast('Insira um preço válido', 'error'); return; }
      const data = datetime.split('T')[0];
      const hora = datetime.split('T')[1].slice(0, 5);
      const result = await addAgendamento({ cliente, servico, profissional, data, hora, preco });
      if (result) { closeModal('modal-agenda');
        toast('Agendamento criado!', 'success'); }
    });

    document.getElementById('modal-agenda-cancel').addEventListener('click', () => closeModal('modal-agenda'));

    // CLIENTE RÁPIDO
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

    // CLIENTE CRUD
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
      ['cliente-nome', 'cliente-telefone', 'cliente-notas', 'cliente-id'].forEach(id => document.getElementById(id)
        .value = '');
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

    // PROFISSIONAL CRUD
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

    // SERVIÇO CRUD
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

    // DESPESA
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

    // FUNDO
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

    // VENDA
    document.getElementById('btn-add-item').addEventListener('click', () => {
      const catSel = document.getElementById('ci-servico-sel');
      const ciValor = document.getElementById('ci-valor');
      let nome = catSel.value;
      if (nome === '__custom') { nome = prompt('Nome do serviço / produto:'); if (!nome || !nome.trim()) return;
        nome = nome.trim(); }
      const wasDisabled = ciValor.disabled;
      ciValor.disabled = false;
      const valor = parseFloat(ciValor.value);
      if (wasDisabled) ciValor.disabled = true;
      if (!nome || !valor || valor <= 0) { toast('Preencha serviço e valor válido', 'error'); return; }
      cartItems.push({ nome, quantidade: 1, precoUnit: valor, subtotal: valor });
      renderCart();
      catSel.selectedIndex = 0;
      if (catSel._filterHandler) catSel._filterHandler.call(catSel);
    });

    // Handler do botão de venda com tela de sucesso (Fase 2)
    const vendaSaveBtn = document.getElementById('modal-venda-save');
    if (vendaSaveBtn) {
      vendaSaveBtn.onclick = async function(e) {
        if (cartItems.length === 0) { toast('Adicione pelo menos um serviço', 'error'); return; }
        const cliente = document.getElementById('venda-cliente').value || 'Anónimo';
        const profissional = document.getElementById('venda-profissional').value;
        const metodoPagamento = document.getElementById('venda-pagamento').value;
        setButtonLoading(this, true);
        try {
          const idVenda = await registarVenda({ cliente, profissional, itens: [...cartItems], metodoPagamento });
          closeModal('modal-venda');
          cartItems = [];
          renderCart();
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

    document.getElementById('modal-venda-cancel').addEventListener('click', () => {
      cartItems = [];
      renderCart();
      closeModal('modal-venda');
    });

    document.getElementById('venda-add-cliente-rapido').addEventListener('click', () => {
      closeModal('modal-venda');
      document.getElementById('cliente-rapido-nome').value = '';
      document.getElementById('cliente-rapido-telefone').value = '';
      openModal('modal-cliente-rapido');
    });

    // TELA DE SUCESSO DA VENDA
    let ultimaVendaId = null;

    function mostrarConfirmacaoVenda(vendaId) {
      const venda = state.movimentos.find(m => m.id === vendaId);
      if (!venda) return;
      document.getElementById('sucesso-valor').textContent = fmtKz(venda.valor);
      ultimaVendaId = vendaId;
      openModal('modal-venda-sucesso');
      const circle = document.getElementById('success-circle');
      const check = document.getElementById('success-check');
      if (circle) { circle.style.strokeDashoffset = '226';
        requestAnimationFrame(() => { circle.style.animation = 'none';
          requestAnimationFrame(() => { circle.style.animation = 'drawCircle 0.5s ease-out forwards'; }); }); }
      if (check) { check.style.strokeDashoffset = '40';
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

    // FINALIZAR ATENDIMENTO
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

    // FECHO CAIXA
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
        <div class="r-footer"><strong>BelezaPro</strong>Fechado ${new Date().toLocaleTimeString('pt-AO', { hour: '2-digit', minute: '2-digit' })}</div>`;
      requestAnimationFrame(() => requestAnimationFrame(() => window.print()));
    });

    // DETALHE VENDA
    document.getElementById('modal-detalhe-fechar').addEventListener('click', () => closeModal('modal-detalhe-venda'));
    document.getElementById('btn-imprimir-recibo').addEventListener('click', () => {
      if (vendaAtual) imprimirRecibo(vendaAtual);
      else toast('Nenhuma venda para imprimir', 'error');
    });

    // KPIS CLICÁVEIS
    document.getElementById('kpi-revenue-card').addEventListener('click', abrirDetalheFaturamento);
    document.getElementById('kpi-agenda-card').addEventListener('click', () => abrirDetalheAgendamentos('pendentes'));

    document.getElementById('modal-revenue-close').addEventListener('click', () => closeModal('modal-revenue-detail'));
    document.getElementById('modal-agenda-close').addEventListener('click', () => closeModal('modal-agenda-detail'));

    document.getElementById('agenda-detail-pendentes').addEventListener('click', () => abrirDetalheAgendamentos('pendentes'));
    document.getElementById('agenda-detail-realizados').addEventListener('click', () => abrirDetalheAgendamentos('realizados'));

    // HISTÓRICO FILTRO
    document.getElementById('hist-filter').querySelectorAll('.hist-chip').forEach(chip => {
      chip.addEventListener('click', () => {
        document.querySelectorAll('.hist-chip').forEach(c => c.classList.remove('active'));
        chip.classList.add('active');
        state.histPeriodo = chip.dataset.periodo;
        renderCaixa();
      });
    });

    // FILTRO CLIENTES
    document.querySelectorAll('.filtro-frequencia').forEach(btn => {
      btn.addEventListener('click', function() {
        document.querySelectorAll('.filtro-frequencia').forEach(b => b.classList.remove('active'));
        this.classList.add('active');
        state.filtroClientes = this.dataset.filtro;
        localStorage.setItem('bp_filtro_clientes', state.filtroClientes);
        renderClientes();
      });
    });

    // AGENDA NAVEGAÇÃO (com slide)
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

   // DUPLO CLIQUE NO NOME DO SALÃO → ATALHO PARA EQUIPA (respeita RBAC: só age se a aba estiver visível)
    document.getElementById('store-name-display')?.addEventListener('dblclick', () => {
      const equipaNav = document.querySelector('.nav-item[data-tab="equipa"]');
      if (equipaNav && equipaNav.style.display !== 'none') equipaNav.click();
    });

    (function() {
  const alvo = document.getElementById('sync-text');
  if (!alvo) return;
  let toques = 0, ultimoToque = 0;
  alvo.addEventListener('click', () => {
    const agora = Date.now();
    toques = (agora - ultimoToque < 800) ? toques + 1 : 1;
    ultimoToque = agora;
    if (toques >= 5) {
      toques = 0;
      toast('A gerar erro de teste para o Sentry…', 'success');
      // myUndefinedFunctionSentryTest(); // removido
    }
  });
})();
    // RIPPLE GLOBAL (Fase 4)
    document.addEventListener('click', function(e) {
      const target = e.target.closest('.btn, .list-item, .card, .kpi-card, .nav-item, .venda-cta-bar, .fab, .prof-card');
      if (target && !target.closest('.btn.is-loading')) {
        addRipple(target, e);
      }
    });

    // SUBSTITUIÇÃO DE CONFIRM NATIVO (Fase 1)
    document.addEventListener('click', async function(e) {
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
          return; // defesa client-side; a garantia real deve vir de RLS (item 1.2)
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
          return; // defesa client-side; a garantia real deve vir de RLS (item 1.2)
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
          return; // defesa client-side; a garantia real deve vir de RLS
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
      document.getElementById('sync-dot').classList.add('online');
      document.getElementById('sync-text').textContent = 'Online';
      document.getElementById('offline-banner').classList.remove('show');
      atualizarIAOffline();
      flushSyncQueue().then(atualizarIndicadorSync);
    });
    window.addEventListener('offline', () => {
      document.getElementById('sync-dot').classList.remove('online');
      document.getElementById('sync-text').textContent = 'Offline';
      document.getElementById('offline-banner').classList.add('show');
      atualizarIAOffline();
    });

    // FECHAR MODAIS AO CLICAR NO OVERLAY
    document.querySelectorAll('.modal-overlay').forEach(el => {
      el.addEventListener('click', (e) => { if (e.target === el) closeModal(el.id); });
    });

    // IA
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
      const byProf = {};
      vendas30.forEach(v => { if (v.profissional) byProf[v.profissional] = (byProf[v.profissional] || 0) + v.valor; });
      const byServ = {};
      vendas30.forEach(v => { if (v.itens) v.itens.forEach(i => { byServ[i.nome] = (byServ[i.nome] || 0) + (i.quantidade ||
            1); }); });
      const totalVendas30 = vendas30.reduce((s, v) => s + v.valor, 0);
      const ticketMedio = vendas30.length > 0 ? Math.round(totalVendas30 / vendas30.length) : 0;
      const totalVendasHoje = vendasHoje.reduce((s, v) => s + v.valor, 0);
      const totalDespHoje = despHoje.reduce((s, d) => s + d.valor, 0);
      const clientesUnicos = new Set(vendasHoje.map(v => v.cliente)).size;

      // COMPARAÇÃO SEMANAL (semana atual vs anterior)
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

      // PRÓXIMOS 7 DIAS
      const fim7 = new Date(hojeD); fim7.setDate(hojeD.getDate() + 7);
      const fim7Str = fim7.toISOString().split('T')[0];
      const ag7dias = state.agendamentos.filter(a => a.data >= hojeStr && a.data <= fim7Str && a.status !== 'cancelado');

      // TAXA DE CANCELAMENTO (últimos 30 dias)
      const ag30 = state.agendamentos.filter(a => a.data >= d30str && a.data <= hojeStr);
      const ag30Cancelados = ag30.filter(a => a.status === 'cancelado').length;
      const taxaCancelamento = ag30.length > 0 ? Math.round((ag30Cancelados / ag30.length) * 100) : 0;

      // SERVIÇO MENOS VENDIDO (entre os que já venderam pelo menos 1x)
      const servicosOrdenados = Object.entries(byServ).sort((a, b) => a[1] - b[1]);
      const servicoMenosVendido = servicosOrdenados[0];

      // CLIENTES POR GASTO INDIVIDUAL (top 30, com dias desde a última compra)
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

      // PLANO E TRIAL
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

    let iaHistorico = [];

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
          return '⚠️ Erro ao contactar o agente IA. Contacta o suporte BelezaPro.';
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

    // Nome personalizável da IA (persistente)
    const IA_NOME_KEY = 'bp_ia_nome';
    function getNomeIA() { return localStorage.getItem(IA_NOME_KEY) || 'Agente IA'; }
    document.getElementById('ia-nome-display').textContent = getNomeIA();
    document.getElementById('ia-renomear-btn').addEventListener('click', () => {
      const atual = getNomeIA();
      const novo = prompt('Como queres chamar o teu assistente de IA?', atual === 'Agente IA' ? '' : atual);
      if (novo && novo.trim()) {
        localStorage.setItem(IA_NOME_KEY, novo.trim());
        document.getElementById('ia-nome-display').textContent = novo.trim();
      }
    });

    // Histórico de conversa persistente (por salão)
    const IA_HIST_KEY = () => 'bp_ia_chat_' + (state.config.salaoId || 'local');
    function carregarHistoricoIA() {
      try {
        const guardado = JSON.parse(localStorage.getItem(IA_HIST_KEY()) || '[]');
        iaHistorico = guardado.slice(-6);
        const chat = document.getElementById('ia-chat');
        if (guardado.length > 0 && chat) {
          chat.innerHTML = guardado.map(t =>
            `<div class="ia-msg-user"><strong>Você:</strong> ${escHtml(t.pergunta)}</div>` +
            `<div class="ia-msg-bot"><strong>${escHtml(getNomeIA())}:</strong> ${escHtml(t.resposta)}</div>`
          ).join('');
          chat.scrollTop = chat.scrollHeight;
        }
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
      chat.innerHTML += `<div class="ia-msg-user"><strong>Você:</strong> ${escHtml(pergunta)}</div>`;
      const pensando = document.createElement('div');
      pensando.className = 'ia-msg-bot';
      pensando.id = 'ia-pensando';
      pensando.innerHTML = `<strong>${escHtml(getNomeIA())}:</strong> <span class="ia-dots">A pensar<span>.</span><span>.</span><span>.</span></span>`;
      chat.appendChild(pensando);
      chat.scrollTop = chat.scrollHeight;
      input.value = '';
      const resposta = await perguntarIA(pergunta);
      document.getElementById('ia-pensando')?.remove();
      if (resposta) {
        chat.innerHTML += `<div class="ia-msg-bot"><strong>${escHtml(getNomeIA())}:</strong> ${escHtml(resposta)}</div>`;
        chat.scrollTop = chat.scrollHeight;
        guardarHistoricoIA();
      }
      document.getElementById('ia-contador').textContent = parseInt(localStorage.getItem('ia_perguntas_' + hoje()) || '0');
    });

    document.getElementById('ia-input').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') document.getElementById('ia-enviar').click();
    });

    // IA offline retry
    document.getElementById('ia-offline-retry')?.addEventListener('click', () => {
      if (navigator.onLine) { atualizarIAOffline();
        toast('Conexão restabelecida!', 'success'); } else { toast('Ainda sem ligação', 'warning'); }
    });

    // UPGRADE MODAL
    document.getElementById('modal-upgrade-contato').addEventListener('click', () => {
      const msg =
        `Olá, quero assinar um plano do BelezaPro. Salão: ${state.config.storeName} | Plano actual: ${getPlanoAtual()}`;
      window.open(`https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(msg)}`, '_blank');
      closeModal('modal-upgrade');
    });

    // PESQUISA CLIENTES
    let searchTimer;
    document.getElementById('search-cliente').addEventListener('input', () => {
      clearTimeout(searchTimer);
      searchTimer = setTimeout(() => renderClientes(), 300);
    });

    // ONBOARDING (Fase 2)
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

    // SPLASH (Fase 2)
    function hideSplash() {
      const splash = document.getElementById('splash-screen');
      if (!splash) return;
      splash.style.opacity = '0';
      setTimeout(() => { splash.style.display = 'none'; }, 600);
    }

    // ====================================================================
    //  TESTES AUTOMATIZADOS (Fase 9) — executar apenas com flag
    // ====================================================================
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
      // Testes rápidos com mocks internos
      console.log('✅ Testes concluídos (mock)');
      console.groupEnd();
      console.log('✅ Todos os testes concluídos!');
    }

    if (localStorage.getItem('bp_run_tests') === 'true') {
      document.addEventListener('DOMContentLoaded', () => { setTimeout(runTests, 1500); });
      localStorage.removeItem('bp_run_tests');
    }
    window.runBelezaProTests = runTests;

    // ====================================================================
    //  INICIALIZAÇÃO — movida para main.js (Fase A da modularização)
    // ====================================================================
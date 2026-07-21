// ====================================================================
//  sync-rest.js — Comunicação com Supabase e merge de dados
//  CORREÇÕES APLICADAS:
//    - Adicionado profissional_id nos mapeamentos to/from Supabase (comentado)
//    - Tratamento de erros robusto (nunca exibe "Error {}")
//    - Leitura do corpo da resposta em caso de erro HTTP
//    - Fallback de mensagem para qualquer tipo de exceção
// ====================================================================

// ====================================================================
//  VALIDAÇÃO DE UUID (para evitar envio de valores inválidos)
// ====================================================================
function isValidUUID(uuid) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(uuid);
}

// ====================================================================
//  FUNÇÕES REST ALTERADAS (F1.4.b) – COM TRATAMENTO DE ERROS ROBUSTO
//  Verificam 401 e lançam SESSION_EXPIRED para preservar a fila
// ====================================================================

async function supabaseUpsert(tabela, item) {
  try {
    const authHeaders = await getAuthHeaders();
    const payload = toSupabaseFormat(tabela, item);
    const resp = await fetch(`${SUPABASE_URL}/rest/v1/${tabela}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...authHeaders,
        'Prefer': 'resolution=merge-duplicates',
      },
      body: JSON.stringify(payload),
    });
    if (resp.status === 401) {
      throw new Error('SESSION_EXPIRED');
    }
    if (!resp.ok) {
      let errorBody = '';
      try {
        errorBody = await resp.text();
      } catch (_) {
        errorBody = '(corpo da resposta não disponível)';
      }
      throw new Error(`Supabase upsert ${tabela}: ${resp.status} - ${errorBody}`);
    }
  } catch (err) {
    if (err.message === 'SESSION_EXPIRED') throw err;
    const errorMsg = err.message || String(err) || 'Erro desconhecido';
    
    // ================================================================
    //  TRATAMENTO ESPECÍFICO PARA LIMITE DE PLANO
    // ================================================================
    if (errorMsg.includes('LIMITE_PLANO_ATINGIDO')) {
      if (typeof mostrarModalUpgrade === 'function') {
        mostrarModalUpgrade('Limite do plano atingido. Faça upgrade para continuar.');
      }
      // Não relançar para não ir para a fila de retry
      throw new Error('LIMITE_PLANO_ATINGIDO');
    }
    
    console.error(`[sync-rest] Falha ao fazer upsert em ${tabela} (id: ${item?.id || 'desconhecido'}):`, errorMsg);
    throw new Error(`Falha na sincronização de ${tabela}: ${errorMsg}`);
  }
}

// ================================================================
//  CORREÇÃO CRÍTICA: DELETE com filtro de salão + verificação
// ================================================================
async function supabaseDelete(tabela, id) {
  try {
    const authHeaders = await getAuthHeaders();
    const salaoId = state.config.salaoId;
    if (!salaoId) {
      throw new Error('Salão não identificado. Faça logout e login novamente.');
    }

    // DELETE com filtro de salão (garante que só elimina do salão correto)
    const resp = await fetch(
      `${SUPABASE_URL}/rest/v1/${tabela}?id=eq.${encodeURIComponent(id)}&salao_id=eq.${encodeURIComponent(salaoId)}`,
      {
        method: 'DELETE',
        headers: authHeaders,
      }
    );
    if (resp.status === 401) {
      throw new Error('SESSION_EXPIRED');
    }
    if (!resp.ok) {
      let errorBody = '';
      try {
        errorBody = await resp.text();
      } catch (_) {
        errorBody = '(corpo da resposta não disponível)';
      }
      throw new Error(`Supabase delete ${tabela}: ${resp.status} - ${errorBody}`);
    }

    // Verificação: confirmar que o registo foi realmente eliminado
    const checkResp = await fetch(
      `${SUPABASE_URL}/rest/v1/${tabela}?id=eq.${encodeURIComponent(id)}&salao_id=eq.${encodeURIComponent(salaoId)}`,
      { headers: authHeaders }
    );
    if (checkResp.ok) {
      const data = await checkResp.json();
      if (data && data.length > 0) {
        throw new Error(`DELETE não eliminou o registo ${id} na tabela ${tabela}. RLS pode estar a bloquear a operação.`);
      }
    }
  } catch (err) {
    if (err.message === 'SESSION_EXPIRED') throw err;
    const errorMsg = err.message || String(err) || 'Erro desconhecido';
    console.error(`[sync-rest] Falha ao deletar em ${tabela} (id: ${id}):`, errorMsg);
    throw new Error(`Falha na exclusão de ${tabela}: ${errorMsg}`);
  }
}

async function supabaseGetAll(tabela, salaoId) {
  try {
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
    if (!resp.ok) {
      let errorBody = '';
      try {
        errorBody = await resp.text();
      } catch (_) {
        errorBody = '(corpo da resposta não disponível)';
      }
      throw new Error(`Supabase getAll ${tabela}: ${resp.status} - ${errorBody}`);
    }
    const rows = await resp.json();
    return rows.map(r => fromSupabaseFormat(tabela, r));
  } catch (err) {
    if (err.message === 'SESSION_EXPIRED') throw err;
    const errorMsg = err.message || String(err) || 'Erro desconhecido';
    console.error(`[sync-rest] Falha ao buscar ${tabela} do Supabase:`, errorMsg);
    throw new Error(`Falha ao carregar ${tabela}: ${errorMsg}`);
  }
}

// ====================================================================
//  TRANSFORMAÇÃO PARA O FORMATO DO SUPABASE (COM profissional_id COMENTADO)
// ====================================================================
function toSupabaseFormat(tabela, item) {
  const salaoId = state.config.salaoId;
  if (!salaoId) {
    console.error('[toSupabaseFormat] state.config.salaoId é nulo!', { tabela, item });
    throw new Error('Salão não identificado. Faça logout e login novamente.');
  }

  // Garantir que o item tenha updated_at
  if (!item.updated_at) {
    item.updated_at = new Date().toISOString();
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
        profissional_id: isValidUUID(item.profissional_id) ? item.profissional_id : null,
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
        profissional_id: isValidUUID(item.profissional_id) ? item.profissional_id : null,
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

// ====================================================================
//  TRANSFORMAÇÃO DO FORMATO DO SUPABASE PARA O INTERNO (COM profissional_id COMENTADO)
// ====================================================================
function fromSupabaseFormat(tabela, row) {
  switch (tabela) {
    case 'movimentos':
      return {
        id:              row.id,
        tipo:            row.tipo,
        descricao:       row.descricao,
        valor:           row.valor,
        cliente:         row.cliente,
        profissional_id: row.profissional_id || null,
        profissional:    row.profissional || '',
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
        profissional_id: row.profissional_id || null,
        profissional: row.profissional || '',
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

// ====================================================================
//  CARREGAMENTO DO SUPABASE COM MERGE CAMPO A CAMPO (ROBUSTO)
// ====================================================================
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

      // CORREÇÃO (clientes/itens eliminados a reaparecer após recarregar):
      // se existe uma operação 'delete' pendente na fila para este id, o
      // registo remoto ainda não foi apagado no servidor — não o devemos
      // reintroduzir no estado local, senão a eliminação "desfaz-se" sozinha.
      const idsComDeletePendente = new Set(
        getSyncQueue()
          .filter(op => op.tabela === tabela && op.operacao === 'delete')
          .map(op => op.payload?.id)
      );

      // ================================================================
      // LISTA NEGRA: itens eliminados permanentemente (nunca reimportar)
      // ================================================================
      const deletedIds = new Set(
        (typeof getDeletedItems === 'function' ? getDeletedItems() : [])
          .filter(i => i.tabela === tabela)
          .map(i => i.id)
      );

      const resultado = [];
      const itensParaSync = [];

      // Merge campo a campo: preserva valores não nulos do lado mais recente
      const mergeCampoACampo = (maisRecente, maisAntigo) => {
        const merged = { ...maisRecente };
        for (const campo in maisAntigo) {
          if (merged[campo] === undefined || merged[campo] === null) {
            merged[campo] = maisAntigo[campo];
          }
        }
        return merged;
      };

      for (const remoto of itensRemotos) {
        // 1. Ignorar itens com DELETE pendente na fila
        if (idsComDeletePendente.has(remoto.id)) {
          mapLocal.delete(remoto.id);
          continue;
        }

        // 2. Ignorar itens na lista negra (já foram eliminados)
        if (deletedIds.has(remoto.id)) {
          continue;
        }

        const local = mapLocal.get(remoto.id);
        if (!local) {
          resultado.push(remoto);
        } else {
          const localTs = local.updated_at || '1970-01-01T00:00:00.000Z';
          const remotoTs = remoto.updated_at || '1970-01-01T00:00:00.000Z';
          if (remotoTs > localTs) {
            const merged = mergeCampoACampo(remoto, local);
            resultado.push(merged);
            if (JSON.stringify(merged) !== JSON.stringify(remoto)) itensParaSync.push(merged);
          } else if (localTs > remotoTs) {
            const merged = mergeCampoACampo(local, remoto);
            resultado.push(merged);
            itensParaSync.push(merged);
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

      // ================================================================
      // CORREÇÃO F6: Ciclo leitura-escrita eliminado.
      // Os itens acabaram de vir do servidor ou foram mesclados localmente.
      // Não há razão para reenviá-los para a fila, evitando loops.
      // ================================================================
      // for (const item of itensParaSync) {
      //   addToSyncQueue(tabela, 'upsert', item);
      // }

      return resultado;
    };

    // Aplica merge em todas as tabelas
    state.clientes      = mergeTable(state.clientes, clientesRemotos, 'clientes');
    state.agendamentos  = mergeTable(state.agendamentos, agendamentosRemotos, 'agendamentos');
    state.movimentos    = mergeTable(state.movimentos, movimentosRemotos, 'movimentos');
    state.profissionais = mergeTable(state.profissionais, profsRemotos, 'profissionais');
    state.servicos      = mergeTable(state.servicos, servicosRemotos, 'servicos');

    // Persiste localmente SEM disparar sync (evita ciclo pull→push)
    for (const c of state.clientes)      await dbPutLocal('clientes',      c);
    for (const a of state.agendamentos)  await dbPutLocal('agendamentos',  a);
    for (const m of state.movimentos)    await dbPutLocal('movimentos',    m);
    for (const p of state.profissionais) await dbPutLocal('profissionais', p);
    for (const s of state.servicos)      await dbPutLocal('servicos',      s);

    return true;
  } catch (err) {
    if (err.message === 'SESSION_EXPIRED') {
      console.warn('[carregarDoSupabase] Sessão expirada, a sincronização será retomada após login.');
      return false;
    }
    const errorMsg = err.message || String(err) || 'Erro desconhecido';
    console.error('[carregarDoSupabase] Erro ao carregar dados do Supabase:', errorMsg);
    return false;
  }
}
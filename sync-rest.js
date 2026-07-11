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

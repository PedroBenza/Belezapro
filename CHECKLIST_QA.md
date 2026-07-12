# BelezaPro — Checklist de Regressão (F1.6)

Correr antes de qualquer deploy para produção. Marcar cada item ao testar.
Se algo falhar, não faças deploy até corrigir.

## 1. Autenticação e sessão
- [ ] Login com conta válida entra corretamente.
- [ ] Login com password errada mostra erro claro.
- [ ] Sessão restaura sozinha ao reabrir a app sem fazer login de novo.
- [ ] Logout limpa a sessão e volta ao ecrã de login.
- [ ] Trocar de conta (logout + login noutra conta) mostra os dados do salão certo,
      não do salão anterior (histórico: bug crítico já corrigido, não pode voltar).

## 2. Onboarding
- [ ] Primeira vez no dispositivo (flag `bp_onboarding_seen` vazia): onboarding aparece
      após login manual.
- [ ] Onboarding também aparece numa sessão restaurada automaticamente (não só no
      clique em "Entrar").
- [ ] Onboarding não reaparece depois de fechado uma vez (flag gravada).

## 3. Navegação
- [ ] Trocar de aba (Dashboard, Agenda, Clientes, Caixa, Equipa) funciona.
- [ ] Recarregar a página numa aba que não seja o Dashboard mantém essa aba
      (não deve voltar ao Dashboard).
- [ ] Utilizador "operador" não vê a aba "Equipa".

## 4. Sincronização
- [ ] Indicador Online/Offline mostra o estado correto quase imediatamente ao abrir
      (não deve ficar "Offline" durante vários segundos com internet ligada).
- [ ] Criar um registo (cliente/agendamento/venda) num dispositivo aparece no outro
      dispositivo em até ~30s, sem precisar recarregar.
- [ ] Criar um registo offline e voltar a ligar a internet sincroniza sozinho.
- [ ] Contador de "pendentes" desce a 0 depois de sincronizar.

## 5. Permissões (RBAC)
- [ ] Conta "admin" consegue eliminar clientes/profissionais.
- [ ] Conta "operador" é bloqueada ao tentar eliminar, com mensagem clara.
- [ ] Conta "operador" não vê botões/ações restritas a admin/gerente.

## 6. Dados por salão (isolamento entre contas)
- [ ] Uma conta de um salão nunca vê dados de outro salão, em nenhuma aba.
- [ ] Criar/editar um registo grava sempre no salão da conta ativa (confirmar pelo
      `salao_id` visível no tooltip do nome do salão, no topo).

## 7. Operações principais
- [ ] Criar cliente novo.
- [ ] Criar agendamento novo.
- [ ] Registar uma venda/movimento de caixa.
- [ ] Adicionar profissional novo.
- [ ] Adicionar serviço novo.
- [ ] Editar e eliminar cada um dos itens acima.
- [ ] Lista de profissionais e de serviços aparece em ordem alfabética, igual em
      todos os dispositivos.

## 8. Offline / PWA
- [ ] App abre e mostra a última tela sem internet (modo avião).
- [ ] Ícone e nome da app corretos ao instalar como PWA no telemóvel.
- [ ] Sem erros vermelhos na Consola ao carregar a app pela primeira vez.

## 9. Antes de considerar o deploy concluído
- [ ] `node -c` (ou equivalente) sem erros em todos os ficheiros `.js` alterados.
- [ ] Nenhuma função duplicada entre ficheiros (script de verificação já usado
      nesta sessão: concatenar todos os `.js` na ordem do `index.html` e correr
      `node -c` no resultado — apanha declarações `let`/`const` duplicadas).
- [ ] `sw.js` com o número de cache atualizado se algum ficheiro do `APP_SHELL` mudou.

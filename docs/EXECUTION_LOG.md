# ATHENA — diário de execução

Registrar uma entrada por tentativa relevante. Cada entrada deve informar data, ID, agente, resumo do diff, verificações, revisão do coordenador, pendências e próximo passo. `Concluída` no quadro exige evidência aqui.

## 2026-09-12 — Início

- Coordenador: agente principal; execução planejada uma tarefa por vez com `gpt-5.6-luna` em esforço médio.
- Baseline: `corepack pnpm test`, `corepack pnpm build` e `corepack pnpm lint` passaram antes de iniciar o programa.
- Árvore de trabalho: seis arquivos de frontend alterados/não versionados referentes à reformulação e ao editor de templates; preservar e revisar antes da ATH-006.
- Decisões: três papéis, `VIEWER` pode comentar; banco novo, sem migração do RequisitoGraph; IA e integrações em fases; limites deliberados no backlog futuro.
- Próximo passo: executar ATH-001, revisar, validar e atualizar o quadro.

## 2026-09-12 — ATH-001 concluída

- Agente: `gpt-5.6-luna`, esforço médio. Coordenador revisou diff e pediu ajuste de precisão em REST e checklist; o agente corrigiu.
- Oito documentos existentes foram alinhados aos três papéis (`VIEWER` comenta), à baseline sem migração legada e ao estado parcial de IA/integrações. O `POST` manual de referência foi descrito como rota legada ainda presente, a desativar na ATH-009.
- Verificação: busca textual dirigida, revisão de rotas e `git diff --check` passou. Nenhum código foi alterado pela tarefa.
- Próximo passo: ATH-002. Há uma stack Docker do usuário em execução com PostgreSQL persistente; testes de integração precisam usar banco/container isolado, sem tocar esse volume.

## 2026-09-12 — ATH-002 concluída

- Agente: `gpt-5.6-luna`, esforço médio, com três ciclos de revisão. O coordenador exigiu transação serializável para proteger o último Owner, autorização dentro da transação, ausência de vazamento de existência de e-mail e resposta de conflito com revisão atual.
- Código: validação TipTap rejeita propriedades desconhecidas, preservando texto literal com caracteres de HTML; operações de membros protegem último Owner sob concorrência; conflito otimista inclui `details.currentRevision` na corrida.
- Testes: nova suíte opt-in `requirements.integration.spec.ts` exige `TEST_DATABASE_URL` para banco `athena_test*`, cria/limpa apenas seus próprios registros e cobre papéis, isolamento, recursos principais, notificações, último Owner concorrente, revisão e códigos simultâneos. O agente executou três vezes. O coordenador repetiu: 6 testes passaram no PostgreSQL temporário `athena-ath002-db` (127.0.0.1:32768). `corepack pnpm test`, `build`, `lint` e `git diff --check` passaram.
- Limite: E2E HTTP autenticado e cobertura exaustiva de cada endpoint ficam na ATH-011; esta suíte testa o serviço e persistência reais. Container de teste temporário, sem volume persistente, permanece disponível para as próximas tarefas.
- Próximo passo: ATH-003, arquivamento transacional e consulta de Canceladas.

## 2026-09-12 — ATH-003 concluída

- Agente: `gpt-5.6-luna`, esforço médio. Coordenador revisou o fluxo de URL direta, API e PostgreSQL; solicitou teste de integração antes de aceitar.
- Backend: lista padrão permanece ativa e `status=archived` expõe Canceladas; arquivamento idempotente remove relações e registra `REQUIREMENT_ARCHIVED` na transação, preservando documento, versões e comentários. A US cancelada bloqueia edição e novas operações de comentário.
- Frontend: aba Canceladas com busca/lista e abertura somente leitura. O teste de URL direta confirma ausência de toolbar, salvar e criação de comentários. Invalidação por prefixo `['requirements', projectId]` também atualiza a lista arquivada.
- Verificação: `corepack pnpm test`, `build`, `lint`, `git diff --check` passaram; coordenador repetiu suíte PostgreSQL isolada, 7/7 casos aprovados, incluindo arquivamento, idempotência, isolamento e preservação.
- Próximo passo: ATH-004, fechar navegação Pastas → US → Grafo e rotas/histórico do navegador.

## 2026-09-12 — ATH-004 concluída

- Agente: `gpt-5.6-luna`, esforço médio, com revisões de histórico, rota direta e IDs cruzados. Alterações locais prévias de Pastas, modal de criação e template foram preservadas.
- Fluxo: Pastas → grafo focado → detalhes → editor; criação abre editor. Back/Forward e troca de projeto sincronizam estado/URL, preservando rascunho quando a saída é recusada. Fechar editor evita entrada de histórico que o reabra.
- Onboarding prioriza projeto autorizado da URL sobre contexto salvo; rota inválida cai na seleção e limpa URL. Editor não abre uma US pertencente a outro projeto. Pastas exibem carregamento, erro e retry.
- Verificação: suíte completa `test`, `build`, `lint` e `git diff --check` passaram; testes novos de navegação e onboarding cobrem os casos dirigidos. Revisão visual em navegador real fica na ATH-012.
- Próximo passo: ATH-005, CRUD completo de pastas e realocação.

## 2026-09-12 — ATH-005 concluída

- Agente: `gpt-5.6-luna`, esforço médio. O coordenador pediu correção da dependência de ordem na suíte de integração e proteção contra criação concorrente de nomes equivalentes; ambas foram implementadas antes da aprovação.
- Backend: criação/edição normalizam nomes, rejeitam vazios, duplicados e uso indevido de `Sem pasta`; exclusão transacional realoca US ativas e canceladas de todos os projetos do workspace. Índice funcional `LOWER(name)` por workspace fecha a corrida de duplicidade por caixa.
- Frontend: edição de nome/descrição nas configurações, confirmação contextual de exclusão e atualização dos caches de pastas/US; testes cobrem sucesso e confirmação.
- Verificação independente do coordenador: 9/9 testes de integração passaram no PostgreSQL temporário `athena_test`, incluindo concorrência; `corepack pnpm test`, `build`, `lint` e `git diff --check` passaram. O banco da stack do usuário não foi acessado.
- Risco de implantação: a migration do índice exige que dados existentes não contenham duas pastas com mesmo nome diferindo apenas por caixa no mesmo workspace; verificar duplicatas antes do deploy em ambiente com dados.
- Próximo passo: ATH-006, concluir templates e critérios preservando os arquivos locais já existentes.

## 2026-09-12 — ATH-006 concluída

- Agente: `gpt-5.6-luna`, esforço médio. O coordenador identificou perda de `when/then` no modal ao aplicar template persistido e pediu correção; a criação passou a usar `templateId` e cópia canônica no backend. Trabalho local anterior no editor de templates foi preservado e ampliado.
- Editor de templates agora inclui critérios ordenados Dado/Quando/Então, dirty state, salvamento explícito, aviso de saída, erros e retry. Configurações apresentam carregamento/falha e permitem `VIEWER` visualizar sem editar.
- Backend distingue critérios omitidos (usar template) de lista vazia explícita; integração PostgreSQL prova cópia independente de documento/critérios após posterior edição do template. Modal conserva o template nativo client-side.
- Verificação independente: `corepack pnpm test`, `build`, `lint`, `git diff --check` passaram; as duas suítes PostgreSQL isoladas somaram 9/9 testes aprovados. Há teste de UI para o payload canônico do template persistido.
- Próximo passo: ATH-007, gerenciar relações na interface.

## 2026-09-12 — ATH-007 concluída

- Agente: `gpt-5.6-luna`, esforço médio, com duas revisões. O coordenador exigiu invalidação dos dois extremos, direção selecionável e proteção contra duplicata `RELATED_TO` inversa concorrente.
- Painel de US cria relações com tipo, alvo e direção explícitos; lista identifica origem → destino, permite remoção confirmada e atualiza relações/grafo. `VIEWER` consulta sem mutações; alvos são filtrados por projeto, status e autorrelação.
- Backend responde conflito estável para duplicata dirigida e usa índice único parcial/canônico PostgreSQL para impedir par simétrico `RELATED_TO` duplicado mesmo em corrida. Teste de integração concorrente confirma uma única relação persistida.
- Verificação independente: `corepack pnpm test`, `build`, `lint`, `git diff --check` e 10/10 testes nas suítes PostgreSQL isoladas passaram.
- Risco de implantação: migration do índice simétrico exige resolver previamente pares `RELATED_TO` duplicados em direções opostas, caso existam em banco com dados; verificar antes do deploy.
- Próximo passo: ATH-008, histórico e comparação de revisões.

## 2026-09-12 — ATH-008 concluída

- Agente: `gpt-5.6-luna`, esforço médio. O coordenador definiu que o snapshot histórico é o estado anterior à edição e exigiu que a revisão corrente seja apresentada sem criar um snapshot fictício.
- Backend agora grava somente campos editoriais no snapshot, expõe a revisão corrente derivada da US autorizada e compara tanto duas revisões históricas quanto histórico ↔ atual. O diff inclui título, documento, pasta, status e critérios adicionados/removidos.
- Frontend adiciona painel de Histórico, lista revisões/datas efetivamente disponíveis e permite comparação de duas revisões, inclusive com a atual. Nenhuma autoria inexistente é mostrada.
- Verificação independente: `corepack pnpm test`, `build`, `lint` e `git diff --check` passaram; 10/10 testes nas suítes PostgreSQL isoladas passaram, cobrindo atualização real e comparação com a revisão atual.
- Próximo passo: ATH-009, bloquear criação manual pública de referências e preparar o caminho interno de aprovação de IA.

## 2026-09-12 — ATH-009 concluída

- Agente: `gpt-5.6-luna`, esforço médio. A rota pública de criação de referências foi preservada somente como limite de compatibilidade e agora sempre responde `409 MANUAL_REFERENCE_CREATION_DISABLED`; a UI já não tinha formulário manual.
- Referências existentes permanecem legíveis e removíveis por `OWNER`/`EDITOR`. A preparação interna `approveReference` não é exposta no controller, exige membership de edição e valida tipo, nome e URL antes de persistir para a futura aprovação de IA.
- `REST_API.md`, `DOMAIN_MODEL.md` e `PRODUCT_DECISIONS.md` foram atualizados para o contrato efetivo.
- Verificação independente: `corepack pnpm test`, `build`, `lint`, `git diff --check` e 10/10 testes PostgreSQL isolados passaram; testes incluem bloqueio público, protocolos permitidos e URLs inseguras.
- Próximo passo: ATH-010, consolidar contratos compartilhados entre frontend e backend.

## 2026-09-12 — ATH-010 concluída

- Agente: `gpt-5.6-luna`, esforço médio. `@athena/shared` passou a declarar contratos estáveis de transporte para o domínio central: vocabulário, requisitos, critérios, versões/diff, grafo/relações, templates, comentários, notificações e envelope de erro.
- Frontend passou a consumir/reexportar os tipos literais compartilhados. O backend preserva DTOs locais decorados por Nest e tipos Prisma, evitando acoplamento de infraestrutura no pacote compartilhado; documentação registra a conversão entre payload `when/then` e resposta `whenText/thenText`.
- Verificação independente: teste de contratos do shared (3/3), `corepack pnpm test`, `build`, `lint` e `git diff --check` passaram; lockfile registra a dependência workspace.
- Limite deliberado: não há import runtime de `shared` no Nest, pois decorators e enums gerados requerem fronteira local; a paridade é mantida por literais e teste de contrato.
- Próximo passo: ATH-011, ampliar testes com PostgreSQL e E2E HTTP autenticado.
- ATH-011: adicionada `backend/api/test/api.e2e.spec.ts`, E2E HTTP opt-in com Nest real, cookies, autorização/isolamento, persistência, templates, pastas, versões, relações, referências, comentários/menções, recarga e arquivamento. Execução sem `TEST_DATABASE_URL` é ignorada; `tsc --noEmit` passou. O coordenador executou os 2 cenários contra `127.0.0.1:32768/athena_test` com sucesso; nenhum banco de usuário foi acessado. Comando e isolamento estão em [TESTING.md](TESTING.md).

## 2026-09-12 — ATH-011 concluída

- Agente: `gpt-5.6-luna`, esforço médio. Novo E2E HTTP opt-in instancia `AppModule` real, `ValidationPipe`, filtro de erro e sessão por cookies; não simula o serviço.
- Os 2 cenários percorrem cadastro/login implícito, workspace/projeto/pastas/template, cópia de critérios, RBAC e isolamento, salvamento/versões, relações, criação pública de referência bloqueada, comentário com menção/notificação, recarga HTTP e arquivamento.
- `docs/TESTING.md` documenta comando, proteção `athena_test*` e quality gates. O checklist ganhou evidência somente para o fluxo realmente executado, sem marcar os demais itens pendentes.
- Verificação independente: E2E HTTP 2/2 passou contra PostgreSQL temporário isolado; `corepack pnpm test`, `build`, `lint` e `git diff --check` passaram. A stack/volume `prototipos` não foi usado.
- Próximo passo: ATH-012, revisão visual, acessibilidade e preparação operacional.

## 2026-09-12 — ATH-012 parcialmente verificada

- Agente: `gpt-5.6-luna`, esforço médio. Configurações Compose padrão/dev/demo foram validadas sem mutação, scripts shell e schema Prisma foram checados, e o healthcheck da API passou a usar `/api/ready` para testar disponibilidade HTTP e PostgreSQL.
- O coordenador verificou somente leitura na stack existente: `/api/health` retornou `ok` e `/api/ready` retornou `ready`. Build, lint, testes e `git diff --check` passaram.
- Limite aberto: não havia navegador disponível, logo não existem screenshots/evidência válida para desktop, mobile, foco, teclado, contraste ou console. Subida limpa e backup/restore também ainda exigem ambiente controlado. ATH-012 permanece em andamento; não é aceita como revisão visual concluída.
- Próximo passo independente: ATH-013, modelar sugestões de IA enquanto aguardamos uma sessão com navegador para concluir ATH-012.

## 2026-09-12 — ATH-013 concluída

- Agente: `gpt-5.6-luna`, esforço médio. A migration aditiva cria `AiSuggestion` sem modificar nem migrar `ImpactAnalysis`/`ImpactItem`; as análises anteriores continuam preservadas.
- Sugestões de relação e referência têm estado, confiança, justificativa e erro. O serviço valida o JSON do provider, protocolos, alvo ativo do mesmo projeto e autorrelação antes de persistir; nenhuma escrita canônica ocorre nessa etapa.
- Contratos compartilhados e documentos de IA/domínio/REST foram alinhados. Testes unitários validam schema e isolamento; teste PostgreSQL confirma a migration e tabelas legadas.
- Verificação independente: migration aplicada somente no `athena_test`, testes unitários e de schema passaram, e `corepack pnpm test`, `lint`, `build` e `git diff --check` passaram. Três artefatos não versionados de `dist/ai` com proprietário incompatível foram removidos para permitir o build; nenhum arquivo-fonte ou dado foi apagado.
- Próximo passo: ATH-014, orquestrar execução assíncrona da análise.

## 2026-09-12 — ATH-014 concluída

- Agente: `gpt-5.6-luna`, esforço médio, revisado pelo coordenador. A primeira transição `DRAFT → ACTIVE` agenda análise após o commit; o salvamento editorial não espera Ollama e qualquer falha fica registrada como `FAILED` com erro legível.
- Backend: `AI_PROVIDER=disabled` é explícito; Ollama separa modelo de geração/embedding e possui timeout. Contexto leva somente dados editoriais da US e requisitos ativos do mesmo projeto, nunca variáveis de configuração. Retry exige `OWNER` ou `EDITOR`; consultas permanecem disponíveis ao membro leitor.
- Concorrência: análise é única por US, com migration que não elimina histórico e interrompe o deploy se houver duplicatas legadas. O worker tem deduplicação local e a persistência usa claim transacional `PENDING → COMPLETED`, para que apenas uma execução crie sugestões.
- Verificação independente: `corepack pnpm test` e `lint` passaram; após remover somente três artefatos gerados, não rastreados e sem permissão em `dist/ai`, `corepack pnpm build` e `git diff --check` passaram. Migration ATH-014 foi aplicada somente em `athena_test`; integrações de requisitos/sugestões e E2E HTTP passaram 11/11 com segredos JWT efêmeros. Ollama real não foi executado porque não havia instância disponível.
- Próximo passo: ATH-015, aprovar/descartar sugestões na API com decisão transacional.

## 2026-09-12 — ATH-015 concluída

- Agente: `gpt-5.6-luna`, esforço médio. A API expõe listagem por US para qualquer membro e comandos separados de aprovar/descartar; somente `OWNER` e `EDITOR` tomam decisões.
- Segurança e consistência: aprovação verifica membership no workspace dentro de transação serializável, revalida alvo ativo no mesmo projeto, protocolos de URL e duplicatas. Um item inválido permanece `PENDING` com erro recuperável; descarte não cria vínculo. Requisições concorrentes são serializadas/reexecutadas e criam no máximo uma relação.
- Verificação independente: unitários e integração PostgreSQL passaram (5/5), incluindo leitor sem poder de decisão e dupla aprovação concorrente. `git diff --check` passou. O banco usado foi somente `athena_test`.
- Próximo passo: ATH-016, apresentar sugestões e decisões na interface.

## 2026-09-12 — ATH-016 concluída

- Agente: `gpt-5.6-luna`, esforço médio. O painel de US passa a mostrar sugestões de IA com tipo, alvo/URL, confiança, justificativa, status e erro recuperável.
- UX e segurança: `VIEWER` apenas lê; `OWNER` e `EDITOR` recebem confirmação contextual para aprovar/descartar. Loading, estado vazio, erro e retry são explícitos. Após decisão, os caches de sugestões, US, referências, relações e grafo são invalidados.
- Verificação independente: frontend 38/38 testes passou, além de `tsc -b`, Vite build e `git diff --check`. A build emite apenas o aviso existente de chunk acima de 500 kB.
- Limite documentado: a lista de sugestões não inclui o estado global da `ImpactAnalysis`; erros individuais seguem visíveis, mas a distinção visual de análise global `FAILED` exige expansão futura do contrato.
- Próximo passo: ATH-017, base segura de integrações.

## 2026-09-12 — ATH-017 a ATH-019 concluídas; ATH-020 congelada

- ATH-017 entregou conexões por workspace, cifra AES-256-GCM e desativação segura; a chave base64 de 32 bytes é obrigatória e nunca deve ser registrada em logs ou commitada.
- ATH-018 entregou GitHub PAT mockável, paginação, erros externos e candidatos idempotentes. ATH-019 entregou OAuth Google com state hasheado/uso único, tokens cifrados e Drive/Docs mockáveis. Contas reais seguem pendentes de credenciais de teste.
- ATH-020 foi iniciada e interrompida por passagem de contexto: há migration e serviço parciais para fingerprint/revisões de candidatos, mas ainda faltam testes completos, UI, revisão de conflitos e auditoria de remoção. Não a tratar como concluída.
- Passagem detalhada, comandos seguros e pendências foram salvos em `RESET_HANDOFF.md`.

## 2026-09-12 — ATH-020 concluída

- Sincronização agora usa identidade externa, versão e fingerprint; reimportação idêntica é idempotente e uma mudança preserva revisão/diff do candidato. Fontes removidas permanecem auditáveis.
- Candidatos só se tornam US por aprovação explícita de `OWNER`/`EDITOR`; criação/atualização usa revisão otimista e mantém o candidato quando houver conflito. Rejeição e reprocessamento são suportados sem sobrescrever a US automaticamente.
- A interface do workspace lista candidatos, diferenças e ações conforme papel. `VIEWER` é somente leitura; estados de erro e cache após decisão são tratados.
- Verificação independente: migration já aplicada exclusivamente em `athena_test`; integração PostgreSQL 2/2 passou e o novo painel passou 3/3 testes de UI, além de typecheck/diff.
- Próximo passo: ATH-021, fechar quality gates e documentação operacional das integrações.

## 2026-09-12 — ATH-021 concluída

- Observabilidade segura registra somente eventos/metadados de conexão e sincronização; tokens, refresh tokens, segredos e conteúdo não aparecem em logs ou respostas.
- Os adaptadores passaram a distinguir corretamente rate limit (`429`) de permissão revogada (`403`) e cobrem autenticação/revogação, ausência de credencial, RBAC, isolamento e importação idempotente.
- `INTEGRATION_VALIDATION.md` documenta setup, quality gates, matriz de falhas, operação com contas descartáveis e o checklist de validação real.
- Verificação: 16 testes focados, 70 testes da API, lint, build, `git diff --check` e PostgreSQL isolado 2/2 passaram. Seis suítes PostgreSQL são opt-in quando `TEST_DATABASE_URL` não é fornecida. Validação real GitHub/Google permanece corretamente pendente de credenciais de teste.

## 2026-09-12 — ATH-012: auditoria parcial em navegador

- O navegador Chrome conectado permitiu revisar os estados vazios de Pastas, Mapa e Importações, o layout em 390px, navegação Tab básica e console. Foi detectado e corrigido overflow horizontal da navegação mobile; frontend 41/41 e typecheck passaram.
- A tarefa não está concluída: o workspace observado não tinha dados, logo editor/drawer/histórico/comentários/sugestões/candidatos e falhas não foram auditados. Boot limpo, backup/restore, foco completo e contraste ainda exigem ambiente controlado. Evidência e limites: `ATH-012_VISUAL_AUDIT.md`.

## 2026-09-12 — ATH-012: fluxos com dados reais revisados

- Após o usuário inserir duas US, uma relação, revisões e comentário no workspace conectado, a auditoria leu (sem criar, editar, fechar ou excluir dados) o mapa com relação, o editor TipTap, comparação Revisão 1 → Revisão 2 e o drawer de comentários em desktop e 390px.
- O layout permaneceu legível; o drawer de comentários não excedeu o viewport mobile. O console não mostrou erros. Os warnings repetidos de dupla inicialização de schemes pelo `linkifyjs` foram corrigidos nos dois editores; após reload, apenas as entradas históricas permaneceram no buffer.
- ATH-012 continua parcial: ações mutáveis e RBAC, sugestões/candidatos com dados, falha/retry, foco/contraste fim a fim e operação boot/backup-restore não foram executados. Relatório atualizado: `ATH-012_VISUAL_AUDIT.md`.

## 2026-09-12 — Continuação: IA, relações e Drive

- Relações: o drawer substitui a sequência de selects por compositor visual com US de origem, escolha de destino, inversão de direção, tipos em linguagem clara e prévia antes da ação. Os testes do drawer e candidatos passaram.
- IA: Ollama passou a receber contrato explícito e contexto separado; candidatos aprovados como novas US são ativados e enfileirados após o commit. Links continuam exigindo aprovação humana.
- Drive: há vínculo persistente de pasta Google, sincronização manual paginada, candidatos idempotentes e remoção limitada à própria pasta. A UI de Importações permite OWNER conectar OAuth, escolher pasta vinculada e sincronizar.
- Verificação deste passe: lint frontend/API e 8 testes de UI passaram; o adaptador Ollama e job passaram em teste focado. A prévia local abriu, porém sem sessão autenticada não permitiu captura do drawer real. A migration nova e testes PostgreSQL/Google reais continuam pendentes e não devem tocar a stack/volume do usuário.

# Plano de integrações do ATHENA: GitHub, GitLab, OpenProject, Jira e Slack

**Pesquisa e proposta — 27 de setembro de 2026.** Este texto reúne o estado do código do ATHENA nesta data, pesquisa nas documentações oficiais dos cinco serviços e decisões propostas para a implementação. Os fluxos descritos como **proposta ATHENA** ainda não existem no produto. Google Drive aparece porque já ocupa a aba Integrações e influencia a arquitetura, mas não é objeto de uma nova integração neste plano.

## 1. Tese do produto

O ATHENA organiza a definição e a revisão das User Stories (US). As demais ferramentas têm funções diferentes: GitHub e GitLab guardam código e acompanham a entrega; OpenProject e Jira distribuem trabalho e mostram seu andamento; Slack reúne a conversa da equipe. A integração deve ligar esses contextos por identificadores estáveis e links visíveis, sem criar cópias concorrentes e difíceis de reconciliar.

**Proposta ATHENA:** o documento e os critérios de aceite da US são a fonte editorial no ATHENA. Uma US pode se relacionar com vários arquivos, issues, pull requests, merge requests e work packages externos. Publicar uma versão em uma ferramenta de gestão exige uma ação explícita. O progresso externo volta como dado de acompanhamento, identificado pela ferramenta e horário da última leitura; ele não altera sozinho o documento, os critérios, a revisão ou o status interno da US. O fluxo atual de pasta Google Drive, que já espelha documentos em dois sentidos, permanece como exceção existente e precisa ser identificado dessa forma na interface.

Cada empresa e equipe conecta somente as ferramentas que já usa: pode começar com OpenProject, GitLab ou Jira, adicionar GitHub depois, usar mais de uma em conjunto ou não conectar Slack. Conectar uma ferramenta habilita seus recursos; não cria tarefas automaticamente. Ao encaminhar uma US, a pessoa escolhe um destino conectado. Não replicamos a mesma tarefa em todos os providers.

Exemplo de jornada configurável: produto escreve `US-42` no ATHENA → a equipe que planeja no OpenProject cria/vincula um work package; desenvolvimento pode associar uma issue do GitLab e um merge request; uma mudança relevante aparece na US; Slack só envia resumo se a equipe o tiver conectado e ativado. Outra equipe pode usar apenas GitHub Issues/Projects ou apenas Jira. A experiência parte da configuração e do uso de cada equipe.

## 2. Como equipes usam essas plataformas

| Serviço | Uso típico documentado pelo fornecedor | Papel proposto no ATHENA |
| --- | --- | --- |
| GitHub | Repositórios, issues e pull requests organizados em Projects, vistos como tabela, quadro ou roadmap. PRs podem ser ligados a issues. [GitHub Projects](https://docs.github.com/en/issues/planning-and-tracking-with-projects), [vínculo PR–issue](https://docs.github.com/en/get-started/writing-on-github/working-with-advanced-formatting/using-keywords-in-issues-and-pull-requests) | Importar arquivos selecionados, criar/vincular issues quando a equipe usa GitHub para planejar e associar PRs/commits como evidências. |
| GitLab | Issues para propostas, tarefas e bugs; boards para visualizar fluxo; merge requests e commits ligados às issues. [Issues](https://docs.gitlab.com/user/project/issues/), [boards](https://docs.gitlab.com/user/project/issue_board/), [crosslinks](https://docs.gitlab.com/user/project/issues/crosslinking_issues/) | Criar/vincular issues quando GitLab é o destino de execução, importar arquivos selecionados e associar MRs/commits, respeitando projetos, grupos e instâncias. |
| OpenProject | Work packages representam tarefas, features, bugs, riscos e US; boards, cronogramas e responsabilidades acompanham execução. [Work packages](https://www.openproject.org/docs/user-guide/work-packages/), [boards](https://www.openproject.org/docs/user-guide/agile-boards/) | Criar ou vincular work packages quando a equipe usa OpenProject e exibir tipo, responsável, datas e andamento na US. |
| Jira | Work items representam entregas, bugs e requisitos; Scrum e Kanban organizam o fluxo em boards e sprints. [Work items](https://www.atlassian.com/software/jira/guides/issues/overview), [boards](https://www.atlassian.com/software/jira/guides/boards/overview) | Criar ou vincular uma issue quando Jira é o destino escolhido e mostrar o andamento com seu status original. |
| Slack | Canais concentram pessoas, mensagens, arquivos e decisões por projeto ou tema; threads mantêm o contexto. [Canais](https://slack.com/help/articles/360017938993-What-is-a-channel), [colaboração](https://slack.com/help/articles/360058495654-Collaborate-effectively-in-channels) | Opcionalmente enviar eventos selecionados do ATHENA para canais; guardar o link da mensagem. Slack não é destino de criação de issue nesta proposta. |

Esses são padrões de uso descritos pelos próprios produtos, não uma afirmação de que toda equipe trabalha da mesma maneira. Conexões são opcionais e independentes; cada workspace pode conectar uma, várias ou nenhuma dessas ferramentas. Projeto mapeado, importação, publicação e notificações são escolhas separadas. Uma equipe pode conectar GitLab somente para MRs, Jira para tarefas e ignorar os demais providers.

## 3. O que já existe no repositório

O backend NestJS tem `IntegrationConnection`, `IntegrationSource`, `IntegrationCandidate` e revisões de candidatos no Prisma. Credenciais são cifradas com AES-256-GCM; o serviço permite listar metadados, conectar, desconectar e consultar credenciais internamente. A revisão de candidatos cria ou atualiza a US somente após aprovação. O contrato e a validação de provider aceitam hoje apenas `GITHUB` e `GOOGLE`: `backend/api/prisma/schema.prisma`, `backend/api/src/integrations/integrations.service.ts` e `backend/api/src/integrations/integration.adapter.ts`.

O GitHub já tem adaptador REST e rotas de conta, repositórios e importação de arquivos por PAT. O arquivo importado entra como candidato revisável. Ainda não há instalação de GitHub App, webhooks, vínculo de issue/PR com US, publicação de issue nem configuração visual do GitHub. Os testes existentes usam HTTP simulado; `docs/INTEGRATION_VALIDATION.md` ainda pede validação com uma conta externa de teste.

O Google tem OAuth, seleção/vínculo de pasta, leitura de Drive/Docs, sincronização periódica e outbox para escrita de volta. A tela atual `frontend/src/features/project/IntegrationCandidatesPanel.tsx` mostra o painel Google e as execuções de sincronização Google. Na navegação, a opção se chama **Importações**. Há endpoints de candidatos genéricos, mas a tela atual não é uma caixa universal de candidatos de todos os providers.

Limites que afetam o plano:

- `IntegrationKind` e `validateCredentials` só conhecem GitHub/Google. O índice `@@unique([workspaceId, kind])` permite uma única conexão de cada tipo por workspace; Jira pode ter vários sites e GitLab/OpenProject várias instâncias.
- `IntegrationSource` e `IntegrationCandidate` atendem bem importação de documentos, mas não representam por si só um vínculo durável de uma US a issue/PR/work package, nem preferências de notificação Slack.
- `Requirement` tem `status` interno (`DRAFT`, `ACTIVE`, `ARCHIVED`), documento TipTap, critérios e revisão. Não há prioridade, sprint ou responsável como campos próprios. Copiar o status de Jira/OpenProject para `Requirement.status` destruiria essa diferença de domínio.
- `Notification` atual cobre avisos internos de menção. A integração Slack exige uma fila de saída própria, com regras por canal e evento.
- A documentação `docs/ATHENA_SPEC.md` descreve uma intenção anterior de sincronização controlada, enquanto a pasta Google hoje já tem espelhamento automático. A nova interface deve dizer claramente qual comportamento está ativo em cada conexão.

## 4. Contrato funcional comum

### 4.1 Conexão, mapeamento, vínculo e execução são entidades diferentes

**Conexão** responde “qual conta, instalação, site ou instância autorizou o ATHENA?”. **Mapeamento** responde “qual projeto do ATHENA corresponde a qual recurso externo?”. **Vínculo** responde “qual objeto externo está ligado a esta US?”. **Execução** registra “o que foi lido, publicado ou falhou?”. Essa separação evita que uma conexão válida implique importação de todos os dados acessíveis.

Modelo proposto, sujeito à revisão na implementação:

| Entidade | Campos essenciais | Observação |
| --- | --- | --- |
| `IntegrationConnection` evoluída | `workspaceId`, `kind`, `externalTenantKey`, `instanceUrl?`, `accountLabel`, `authMethod`, credencial cifrada, escopos, saúde, datas | Migrar conexões GitHub/Google preservando IDs e vínculos. Substituir a unicidade por workspace/provider por workspace/provider/instância ou instalação; refatorar consultas atuais que usam `workspaceId_kind`. |
| `IntegrationProjectMapping` | `connectionId`, `projectId`, `externalProjectId`, nome, direção, opções | Um mapeamento explícito por projeto externo. Sem varredura de toda a organização. |
| `ExternalArtifactLink` | `requirementId`, `connectionId`, tipo (`ISSUE`, `PR`, `MR`, `WORK_PACKAGE`, `FILE`), ID externo, URL, título, metadados, última observação | Índice único por conexão/tipo/ID externo; a mesma US pode ter vários links. URL validada pelo host da conexão. |
| `IntegrationRun` / `IntegrationRunItem` | provider, motivo, início/fim, contagens, estado, código de erro seguro | Atividade comum; as tabelas Google existentes podem ser adaptadas ou lidas por uma camada unificada, sem descarte de histórico. |
| `IntegrationInboxEvent` e `IntegrationOutboxJob` | ID de entrega ou chave idempotente, escopo, estado, tentativas, próximo horário | Webhooks rápidos entram na inbox; publicação e avisos saem pela outbox. |
| `SlackNotificationRule` | conexão, projeto, canal, eventos, ativo, janela de silêncio? | Primeira versão pode omitir janela de silêncio e agrupar eventos repetidos. |

Manter `IntegrationCandidate` para conteúdo que pode virar uma US ou atualizar seu documento após revisão. Para issues e work packages que apenas acompanham execução, criar `ExternalArtifactLink` e um resumo de progresso; não criar candidato textual automaticamente a cada alteração de status.

### 4.2 Política de movimento de dados

| Fluxo | Padrão inicial | Ação do usuário |
| --- | --- | --- |
| Arquivo de requisitos GitHub/GitLab → ATHENA | Importação selecionada → candidato revisável | Selecionar arquivo, revisar diff e aprovar/rejeitar. |
| US ATHENA → GitHub/GitLab/Jira/OpenProject | Criação/vínculo de issue ou work package no destino selecionado | Escolher uma conexão, projeto e tipo; pré-visualizar; confirmar. Só criar em outro sistema numa ação separada e explícita. |
| GitHub/GitLab/Jira/OpenProject → ATHENA | Atualização de resumo de progresso do item vinculado | Acompanhar somente recursos que a equipe mapeou/vinculou; conteúdo editorial só entra mediante revisão explícita futura. |
| Issues/PRs/MRs GitHub/GitLab → ATHENA | Vínculos e eventos de entrega | Associar pelo seletor ou por referência estável; conferir sugestões antes de confirmar. |
| ATHENA → Slack | Avisos opt-in por evento e canal | Escolher canal, eventos e enviar uma mensagem de teste. |
| Slack → ATHENA | Sem ingestão geral na primeira versão | Ações interativas ou captura de mensagem só em fase posterior, com escopo e privacidade próprios. |

Cada registro importado preserva provider, instância/site, projeto, ID remoto, URL, versão ou `updatedAt`, horário da leitura e estado de permissão. Um “não encontrado” isolado não apaga vínculo ou US: pode significar revogação de acesso, remoção ou falha transitória. A remoção é marcada apenas após confirmação e fica auditável.

Para “colocar no quadro”, não presumir que a API recebe um `boardId`: em várias ferramentas, o quadro é uma consulta ou uma visão derivada de projeto, status, labels, sprint ou responsável. Na configuração do destino, oferecer os campos de roteamento que aquela equipe usa (por exemplo, projeto + label no GitLab, projeto + filtro de board no Jira, status/tipo no OpenProject). Antes de criar, mostrar o projeto e o critério que farão o item aparecer na fila/quadro. Deixar sem responsável ou aplicar responsável/grupo de triagem somente conforme uma regra escolhida pela equipe; não inventar atribuição.

### 4.3 Atualizações, conflitos e erros

Usar webhook assinado para reduzir latência quando o provider oferecer; executar reconciliação periódica porque eventos podem falhar, chegar fora de ordem ou ser duplicados. A inbox valida assinatura sobre o corpo bruto, registra ID da entrega, responde rápido e deixa o processamento para um job. O processador relê o objeto pela API antes de alterar o resumo local quando necessário. Mudanças locais publicadas levam uma chave de correlação para evitar eco.

Jobs precisam de idempotência por `connectionId + objeto + operação + versão`, paginação, limites de tamanho, tentativas finitas, respeito a `Retry-After`, e estado `aguardando autorização`, `sem permissão`, `limitado`, `falhou` ou `concluído`. Alterar documento TipTap/critério exige comparação de revisão e decisão humana. Em publicações externas, guardar a versão da US usada no snapshot e mostrar “há uma versão mais recente no ATHENA” em vez de sobrescrever silenciosamente o item remoto.

### 4.4 Contratos de API e mapeamento inicial

Os caminhos abaixo são **proposta de API ATHENA**, não rotas existentes. Preservar as rotas atuais de GitHub/Google e adicionar controladores próprios em um módulo `integrations/`, em vez de aumentar indefinidamente `requirements.controller.ts`:

| Ação | Rota proposta | Resposta/efeito |
| --- | --- | --- |
| Catálogo e estado | `GET /workspaces/:id/integrations/overview` | Providers, conexões, recursos mapeados, saúde e ações disponíveis para o papel do usuário. |
| Iniciar OAuth/instalação | `POST /workspaces/:id/integrations/:provider/authorization` | URL de autorização e `state` de uso único; callback próprio por provider. |
| Testar/consultar conexão | `GET /workspaces/:id/integration-connections/:connectionId` e `POST .../test` | Metadados e diagnóstico sem credenciais. |
| Mapear projeto/recurso | `POST /workspaces/:id/integration-connections/:connectionId/mappings` | Vínculo ATHENA ↔ projeto/repositório/canal externo, validado pelo provider. |
| Vincular artefato | `POST /requirements/:id/external-links` | Seleção explícita de issue, PR, MR ou work package existente. |
| Publicar US | `POST /requirements/:id/publish/:provider` | Prévia/validação primeiro; confirmação cria um job idempotente e retorna seu ID. |
| Atividade | `GET /workspaces/:id/integration-runs?provider=&status=&cursor=` | Execuções paginadas; detalhe contém códigos e IDs seguros. |
| Receber webhook | `POST /webhooks/:provider` | Verifica assinatura/corpo bruto, grava inbox e responde rápido. |

O backend pode expor um contrato interno `listResources`, `getArtifact`, `createArtifact?`, `normalizeEvent` e `healthCheck`, com capacidades declaradas por provider. Não forçar Slack a implementar `readSource`: ele publica mensagens. Não forçar Jira/OpenProject ao modelo de arquivo: eles publicam ou leem itens de trabalho. Adaptadores ficam separados dos serviços de autorização, persistência e fila.

| Campo ATHENA | GitHub/GitLab | Jira/OpenProject | Slack |
| --- | --- | --- | --- |
| `Requirement.id`/`code` | Chave de correlação em vínculo explícito; opcional no texto de issue/PR/MR | ID da US e link canônico em descrição de snapshot | Código e link no aviso |
| Título | Título de candidato quando se importa arquivo | Assunto/summary inicial, editável na prévia | Título curto na mensagem |
| Documento TipTap + critérios | Arquivo vira candidato; não preencher a US por webhook | Converter apenas campos escolhidos em snapshot; registrar revisão publicada | Não enviar por padrão |
| `Requirement.status` | Continua interno | Continua interno; mostrar status remoto em campo separado | Não altera status |
| `revision`/`updatedAt` | Comparar fingerprint do arquivo ou versão do objeto | Evitar sobrescrita; mostrar snapshot desatualizado | Usar chave idempotente para aviso |

## 5. Plano por plataforma

### 5.1 GitHub

**Uso e valor.** Equipes associam trabalho a repositórios, issues, PRs e Projects. Na US, o ATHENA pode mostrar documentos de especificação importados, issue de execução, PRs associados, estado de revisão/merge e links para abrir no GitHub. GitHub aceita ligação explícita de PR com issue por referência no texto; não devemos inferir que qualquer menção ao código `US-42` indica a mesma entrega. [GitHub Projects](https://docs.github.com/en/issues/planning-and-tracking-with-projects), [palavras de vínculo](https://docs.github.com/en/get-started/writing-on-github/working-with-advanced-formatting/using-keywords-in-issues-and-pull-requests)

**Autenticação recomendada.** Para o piloto com GitHub + OpenProject, reaproveitar a conexão PAT que já existe e pedir um token de teste com permissão de leitura do repositório e escrita de Issues; inclusão em GitHub Projects exige as permissões adicionais aplicáveis ao projeto. O código atual só lê arquivos, então esse aumento de permissão e o formulário da UI precisam ser tratados como capacidade nova e explicados antes de salvar. Antes de abrir amplamente o recurso, migrar para um **GitHub App**: instalação na conta/organização com repositórios selecionados, permissões mínimas de leitura para `metadata`, `contents`, `issues` e `pull_requests` apenas conforme recursos ativados. Tokens de instalação expiram e são gerados pelo backend; o usuário não cola PAT na tela. A instalação fornece eventos de webhook e permite seleção explícita de repositórios. Equipes que só importam arquivos não precisam habilitar escrita. [Permissões](https://docs.github.com/en/enterprise-cloud%40latest/apps/creating-github-apps/registering-a-github-app/choosing-permissions-for-a-github-app), [instalação](https://docs.github.com/en/enterprise-cloud%40latest/apps/using-github-apps/installing-a-github-app-from-a-third-party), [token de instalação](https://docs.github.com/en/rest/apps/apps)

**Como o usuário conecta:**

1. OWNER abre **Integrações → GitHub → Conectar** e vê recursos e permissões solicitadas.
2. É enviado ao GitHub, escolhe conta/organização e apenas os repositórios desejados; se a organização exigir aprovação, a tela fica `Aguardando administrador`.
3. Volta ao ATHENA; o backend confere instalação, conta e repositórios disponíveis. O OWNER escolhe um ou mais repositórios para cada projeto ATHENA.
4. Escolhe capacidades opcionais: **importar arquivos**, **acompanhar issues/PRs** e, se a equipe usa GitHub Issues para execução, **criar issues**. A instalação pode pedir nova autorização se a permissão de escrita for ativada depois.
5. Na US, EDITOR ou OWNER pode associar issue/PR existente ou criar issue no repositório escolhido. A prévia mostra título, conteúdo, labels/campos de roteamento e se o Project configurado deve incluir a issue. Em **Importações**, revisa arquivos candidatos. A conexão mostra última leitura e falhas.

**Implementação:** evoluir o adaptador atual para um modo `GITHUB_APP`, preservando o `GITHUB_PAT`. Persistir `installationId` e IDs de repositório, gerar token curto no servidor, listar recursos autorizados e receber eventos `installation`, `issues`, `pull_request` e, se necessário, `push`. Criar issue só quando usuário seleciona GitHub como destino naquela ação; se houver GitHub Project, adicioná-la quando o usuário habilitar a associação e a API permitir com permissões autorizadas, senão instruir a regra auto-add do Project. Validar `X-Hub-Signature-256` antes de enfileirar. Primeira entrega de acompanhamento pode usar sincronização manual/periódica; webhook entra depois que inbox e idempotência estiverem prontas. [Validação de webhooks](https://docs.github.com/en/webhooks/using-webhooks/validating-webhook-deliveries)

### 5.2 GitLab

**Uso e valor.** Equipes planejam com issues e boards, implementam por merge requests e consultam pipelines. Na US, mostrar issue/MR vinculados e estado de merge ou pipeline como evidência de entrega, mantendo o histórico no GitLab. Repositórios podem conter Markdown de requisitos para importação revisável. [Issues](https://docs.gitlab.com/user/project/issues/), [boards](https://docs.gitlab.com/user/project/issue_board/), [eventos](https://docs.gitlab.com/user/project/integrations/webhook_events/)

**Autenticação recomendada.** Para GitLab.com, usar OAuth 2.0 com escopos de leitura quando a equipe quer importar arquivos ou acompanhar issues/MRs. Para GitLab Self-Managed, a instância pode exigir que um administrador registre uma aplicação OAuth; oferecer token de projeto/grupo ou PAT com escopo mínimo como alternativa para instalações que não permitem OAuth do ATHENA. Criar issue via API pode exigir `api`, que dá leitura e escrita amplas dentro do alcance do token; pedir essa capacidade somente quando a equipe habilitar criação de issues, explicar a permissão e oferecer uma integração de leitura sem ela. O alcance de tokens de projeto/grupo varia e algumas opções dependem da edição do GitLab. [OAuth e escopos](https://docs.gitlab.com/integration/oauth_provider/), [escopos de tokens](https://docs.gitlab.com/security/tokens/access_token_scopes/), [token de projeto](https://docs.gitlab.com/user/project/settings/project_access_tokens/)

**Como o usuário conecta:**

1. OWNER abre **GitLab → Conectar**, escolhe `gitlab.com` ou informa a URL da instância da organização.
2. Para OAuth, é redirecionado à instância e autoriza; para token, segue instruções de escopo mínimo e cola o segredo uma única vez em formulário protegido. O ATHENA mostra qual método foi usado sem mostrar o segredo.
3. Escolhe grupos/projetos autorizados e mapeia cada um a um projeto ATHENA; pode selecionar ramos e caminhos de documentos.
4. Seleciona capacidades opcionais: importar arquivos, acompanhar issues/MRs/pipelines e, se GitLab for usado para execução, criar issues. Se permitir escrita exigir escopo mais amplo, mostrar isso e pedir consentimento separado.
5. Mapeia labels/colunas do board e regra de responsável/triagem se necessário. Um Maintainer/Owner pode configurar o webhook; sem essa permissão, o ATHENA usa sincronização periódica.

**Implementação:** cliente `/api/v4` próprio, com paginação e IDs numéricos de projetos; leitura de arquivos pela Repository Files API (`ref`, caminho codificado, conteúdo Base64, hash). Não reutilizar URLs/DTOs do GitHub porque as APIs e o modelo de autenticação diferem. Para instâncias próprias, validar HTTPS, host, DNS, redirecionamentos e política de acesso a rede interna antes de requisitar a URL fornecida. Se GitLab for o destino de execução, criar issue após confirmação e preencher labels que o board usa; verificar associação/visibilidade quando possível. Webhooks de projeto incluem eventos de issue, MR e pipeline. Em versões recentes, GitLab recomenda token de assinatura HMAC; versões antigas podem oferecer apenas `X-Gitlab-Token`, então a capacidade precisa ser detectada por instância. [Arquivos](https://docs.gitlab.com/api/repository_files/), [webhooks e assinatura](https://docs.gitlab.com/user/project/integrations/webhooks/)

### 5.3 OpenProject

**Uso e valor.** O work package pode representar US, tarefa, bug ou feature, com responsável, status, prioridade e datas. O ATHENA deve ajudar a publicar o trabalho executável a partir de uma US e trazer o progresso, mantendo o documento de requisitos em sua própria revisão. Os status e tipos de OpenProject são configuráveis por instância/projeto; a UI deve mostrar o nome original, não fingir que todos seguem o mesmo quadro. [Work packages](https://www.openproject.org/docs/user-guide/work-packages/), [boards](https://www.openproject.org/docs/user-guide/agile-boards/)

**Autenticação recomendada.** OpenProject oferece API v3, OAuth 2.0 e token de API. Para produto multiempresa, preferir OAuth por instância com aplicativo registrado pelo administrador do OpenProject e autorização do usuário; token pessoal pode servir para piloto controlado. A API v3 usa HAL+JSON e expõe ações conforme as permissões efetivas do usuário. Webhooks exigem configuração administrativa, segredo de assinatura, eventos e projetos. [API v3](https://www.openproject.org/docs/api/introduction/), [OAuth](https://www.openproject.org/docs/system-admin-guide/authentication/oauth-applications/), [webhooks](https://www.openproject.org/docs/system-admin-guide/api-and-webhooks/)

**Como o usuário conecta:**

1. OWNER informa a URL da instância em **OpenProject → Conectar**. O ATHENA verifica o host e explica que um administrador pode ter de registrar o aplicativo com a URL de retorno exibida.
2. O administrador do OpenProject cria o aplicativo OAuth com escopo `api_v3`; o OWNER informa o client ID e autoriza na instância. Para piloto por token, cola o token pessoal se a política da instalação permitir.
3. ATHENA lista projetos visíveis, e o OWNER mapeia um projeto externo a um projeto ATHENA. Escolhe tipos de work package. Se o quadro for por status/versão/responsável, configura o valor que fará o item entrar na coluna apropriada.
4. Enquanto edita uma US, EDITOR ou OWNER abre **Tarefas**, seleciona OpenProject e então escolhe a instância/projeto e o destino disponível (por exemplo, tipo e status que determinam a coluna). Confere e edita assunto, descrição, responsável/grupo de triagem opcional e link de volta ao ATHENA antes de **Criar tarefa**; ou escolhe **Vincular existente**. O modal não pressupõe que toda instância tenha um quadro selecionável pela API.
5. O cartão da US exibe ID, tipo, status, responsável, datas e última atualização. O OWNER pode habilitar webhook no OpenProject; sem ele, usa atualização periódica/manual.

**Implementação:** adaptador HAL+JSON para projetos e work packages; descobrir `_links` e formulários de criação/edição em vez de presumir campos graváveis. Guardar ID remoto e `lockVersion` para evitar sobrescritas em futuras edições. A primeira entrega cria o snapshot explícito com URL canônica da US, mapeia tipo/status para o board da equipe e lê progresso; não espelha comentários ou altera automaticamente status da US. Em boards básicos, a adição à lista pode exigir ação/configuração separada; em action boards, o item aparece conforme o atributo selecionado. Para escrita posterior, fazer validação do formulário e conflito por versão. [Exemplo oficial da API](https://www.openproject.org/docs/api/example/), [API e webhooks](https://www.openproject.org/docs/system-admin-guide/api-and-webhooks/), [boards](https://www.openproject.org/docs/user-guide/agile-boards/)

### 5.4 Jira

**Uso e valor.** Equipes usam projetos/sites, tipos de issue, fluxos, sprints e boards para organizar execução. O ATHENA pode criar ou vincular uma issue a uma US e exibir tipo, chave, status, responsável e sprint quando disponíveis. O conteúdo editorial completo não precisa ser continuamente copiado para o Jira; a publicação inicial deve ter um resumo útil e um link para a versão da US. [Work items](https://www.atlassian.com/software/jira/guides/issues/overview), [boards](https://www.atlassian.com/software/jira/guides/boards/overview)

**Autenticação recomendada.** Para Jira Cloud, usar uma única aplicação OAuth 2.0 (3LO) distribuível do ATHENA, com `read:jira-work` e `offline_access` no primeiro fluxo; solicitar `write:jira-work` somente quando o usuário ativar **Criar issue**, e `manage:jira-webhook` se registrar webhooks dinâmicos. Após OAuth, consultar `accessible-resources`, apresentar os sites e guardar o `cloudId` do escolhido. A Atlassian recomenda OAuth 3LO para integrações externas e restringe o uso de tokens pessoais em apps distribuídos; por isso, não planejar “cole seu API token” como fluxo principal. Refresh tokens giram e devem ser substituídos de forma atômica. [Segurança](https://developer.atlassian.com/cloud/jira/platform/security-for-other-integrations/), [OAuth 3LO](https://developer.atlassian.com/cloud/jira/service-desk/oauth-2-authorization-code-grants-3lo-for-apps/), [escopos](https://developer.atlassian.com/cloud/jira/platform/scopes-for-oauth-2-3LO-and-forge-apps/)

**Como o usuário conecta:**

1. OWNER abre **Jira → Conectar**, vê os escopos e segue para a autorização Atlassian.
2. Depois do retorno, escolhe o site acessível e o projeto Jira; se não tiver `Browse projects`, o ATHENA explica a permissão que falta.
3. Configura tipo de issue, campos obrigatórios e os valores que fazem a issue aparecer no quadro (por exemplo, label, sprint ou filtro de projeto) descobertos para aquele projeto/tipo. A tela mostra uma prévia da descrição e do destino da issue.
4. Em uma US, EDITOR ou OWNER escolhe **Criar issue** ou **Vincular issue existente**; confirma a criação para evitar duplicatas. O ATHENA mostra a chave retornada e link para abrir no Jira.
5. A atividade acompanha status e atualizações. Em fase posterior, OWNER pode ativar webhooks e alertas específicos.

**Implementação:** usar REST v3 por `https://api.atlassian.com/ex/jira/{cloudId}/...`. A descrição e comentários da v3 usam Atlassian Document Format (ADF), exigindo um conversor TipTap → ADF limitado e validado; na primeira versão, pode-se gerar uma descrição simples bem estruturada e preservar o link para o documento completo. Descobrir projetos, tipos e campos obrigatórios antes de criar issue. O usuário escolhe ou configura um filtro/label/sprint compatível com o board; não presumir que a API adiciona ao board por um `boardId`. Não embutir um workflow fixo: transições dependem da configuração do projeto. Para busca e reconciliação, usar a API atual de JQL paginada. Se houver webhooks dinâmicos, controlar renovação e limites por app/usuário; usar polling como contingência. Respeitar `429` e `Retry-After`. [REST v3/ADF](https://developer.atlassian.com/cloud/jira/platform/rest/v3/intro), [busca JQL](https://developer.atlassian.com/cloud/jira/platform/rest/v3/api-group-issue-search/), [webhooks](https://developer.atlassian.com/cloud/jira/software/webhooks/), [limites](https://developer.atlassian.com/cloud/jira/platform/rate-limiting/)

Jira Data Center tem endpoints e autenticação diferentes. Tratar seu suporte como adaptador e decisão de produto separados, após a versão Cloud; a primeira tela deve dizer “Jira Cloud”.

### 5.5 Slack

**Uso e valor.** Canais de produto e projeto são bons destinos para avisos de US aprovada, alteração de requisito, comentário que pede atenção, publicação de work package ou falha persistente de integração. Mensagens devem carregar código, título, tipo de evento e link; jamais copiar automaticamente todo o documento ou comentários privados. Threads podem agrupar atualizações da mesma US. [Canais](https://slack.com/help/articles/360017938993-What-is-a-channel), [colaboração](https://slack.com/help/articles/360058495654-Collaborate-effectively-in-channels)

**Autenticação recomendada.** App Slack instalado por OAuth v2 no workspace Slack, com bot token e escopos mínimos `chat:write` e `channels:read` para canais públicos selecionáveis. `groups:read` só quando o produto oferecer canais privados e a instalação permitir; o bot ainda precisa ter acesso ao canal de destino. `users:read.email` não é necessário para avisos por canal e deve ficar fora do MVP. Se a rotação de token estiver habilitada no app, guardar e renovar os refresh tokens conforme o fluxo Slack. [OAuth v2](https://docs.slack.dev/authentication/installing-with-oauth/), [listar canais](https://docs.slack.dev/reference/methods/conversations.list/), [postar mensagem](https://docs.slack.dev/reference/methods/chat.postMessage/), [rotação](https://docs.slack.dev/authentication/using-token-rotation/)

**Como o usuário conecta:**

1. OWNER abre **Slack → Conectar** e vê que o ATHENA enviará somente os eventos escolhidos aos canais escolhidos.
2. Instala e autoriza o app no workspace Slack; volta ao ATHENA com o nome do workspace confirmado.
3. Escolhe um canal por projeto ATHENA e marca eventos específicos. Se o canal não aparecer, a interface informa que pode faltar permissão ou convite do bot.
4. Usa **Enviar mensagem de teste**; o ATHENA mostra sucesso com link da mensagem ou um erro recuperável.
5. Ativa a regra. O cartão da conexão mostra canal, eventos, últimas entregas, pausas e opção de desativar sem desconectar o app.

**Implementação:** `SlackNotificationRule` + outbox transacional ligada a eventos de domínio do ATHENA. Criar templates curtos, envio por `chat.postMessage`, deduplicação, agrupamento por US e armazenamento de `channel`/`ts` para link ou atualização futura. Respeitar o limite de postagem por canal e `Retry-After`. Entrada de Events API, comandos ou botões interativos fica para uma segunda etapa; se criada, validar a assinatura `X-Slack-Signature` e timestamp antes de processar. [Postagem](https://docs.slack.dev/reference/methods/chat.postMessage/), [rate limits](https://docs.slack.dev/apis/web-api/rate-limits/), [assinatura](https://docs.slack.dev/authentication/verifying-requests-from-slack/)

## 6. Redesenho da aba Integrações

A aba atual é uma utilidade com uma região central de trabalho: conectar ferramentas e entender **o que flui entre elas**. A ideia de tela é mostrar primeiro conexões e saúde, depois mapeamentos e atividade; cada card deve explicar o comportamento ativo em linguagem comum. Manter a identidade visual existente do ATHENA, seus componentes de diálogo, espaçamento e estados, sem criar uma estética paralela.

**Navegação proposta:** renomear **Importações** para **Integrações** e preservar/redirecionar a URL antiga `imports`. Dentro da página:

1. **Visão geral:** cinco cards (GitHub, GitLab, OpenProject, Jira Cloud, Slack) mais Google Drive existente. Cada card mostra `Não conectado`, `Aguardando aprovação`, `Conectado`, `Precisa reconectar`, `Sincronização pausada` ou `Erro`, conta/site, projetos/canais associados e última atividade. Nenhum card é obrigatório; conecta-se só o que a equipe usa. “Conectar” habilita aquele provider sem disparar importação ou criar itens.
2. **Configuração da conexão:** drawer/página por provider com conta/instância, permissões concedidas, projetos mapeados, dados lidos, dados publicados, frequência, eventos e ações `Testar conexão`, `Reconectar`, `Pausar`, `Desconectar`. Segredos não são exibidos.
3. **Importações:** fila de candidatos de GitHub/GitLab/Google com filtro por provider/projeto/estado e diff antes de aprovar. Para o espelhamento Google, mostrar sua atividade própria como “sincronização automática”, sem apresentar registros aceitos automaticamente como candidatos pendentes.
4. **Atividade:** execuções de leitura, publicações, avisos Slack e erros, com filtros e detalhes seguros. O usuário consegue localizar um erro e repetir uma operação idempotente quando aplicável.
5. **Dentro da US:** seção “Ferramentas vinculadas” com IDs, links, status externo, último sync e ações `Vincular existente`, `Criar item`, `Abrir`. Em `Criar item`, o usuário escolhe uma das conexões habilitadas para aquele projeto e confirma a prévia. Cada ação cria no máximo um item no destino escolhido; outros vínculos podem ser adicionados depois, quando fizerem parte do fluxo real. Essa seção evita que a aba Integrações vire o único lugar onde o usuário vê o resultado.

### Ação contextual no editor: Tarefas

A ideia é iniciar o encaminhamento a partir da própria US, enquanto a pessoa de requisitos está trabalhando no TipTap. Um botão **Tarefas** na barra de ações da US abre um modal; conectar provedores continua sendo uma configuração separada na aba **Integrações**. A empresa conecta só os destinos que usa, e cada tarefa vai para um destino escolhido explicitamente. Não há publicação automática para todos os serviços conectados.

**Fluxo proposto no modal:**

1. **Escolher destino:** mostrar as conexões disponíveis para o projeto ATHENA, com nome da instância/organização e estado. Se nenhuma integração de execução estiver conectada, explicar que ela deve ser configurada em Integrações.
2. **Escolher local de trabalho:** carregar projetos e, onde a API oferecer isso, quadro/lista/coluna. Para os outros providers, mostrar os campos que controlam onde o item aparece: por exemplo, label/lista no GitLab, projeto e critério do board no Jira, projeto/tipo/status no OpenProject, ou projeto/estado no GitHub Projects. Usar nomes reais da instância.
3. **Escrever a tarefa:** sugerir título a partir do título da US e descrição com o contexto útil (resumo, critérios de aceite e link permanente da US). A pessoa edita o conteúdo antes de publicar. Responsável fica opcional; oferecer triagem sem atribuição automática.
4. **Revisar e criar:** mostrar uma prévia, o destino e como o item será colocado no quadro/fila. O botão final pode salvar a versão corrente da US e criar a tarefa a partir dela, para que o vínculo aponte ao conteúdo que a pessoa acabou de revisar. A operação externa deve ser idempotente e seu resultado aparecer na própria US; erro de criação permite tentar novamente sem duplicar.
5. **Acompanhar:** depois de criar, o modal lista as tarefas já vinculadas, seu estado original e `Abrir no [provider]`; permite criar outro item quando houver uma etapa real para outra equipe/ferramenta ou vincular um existente. O status externo aparece separado do estado editorial da US.

Esse desenho mantém o foco no fluxo da equipe: a pessoa que revisa requisitos descreve o trabalho uma vez no contexto da US e escolhe onde a equipe executa. O detalhe de roteamento varia por integração; por isso a UI pode apresentar o conceito comum de **Destino** e adaptar os campos por provider. No OpenProject, boards de ação usam atributos como status para preencher colunas; boards básicos podem não expor uma operação de “adicionar ao quadro” pela API. Nesses casos, pedir projeto + tipo/status ou explicar a etapa externa necessária, sem prometer uma seleção de quadro que a integração não consegue cumprir. [OpenProject API v3](https://www.openproject.org/docs/api/introduction/), [boards OpenProject](https://www.openproject.org/docs/user-guide/agile-boards/), [listas de board GitLab](https://docs.gitlab.com/api/boards/), [boards Jira](https://developer.atlassian.com/cloud/jira/software/rest/intro/)

### Contrato de campos e posicionamento por integração

O modal tem um núcleo comum e campos de destino descobertos na conexão. **Obrigatórios em todas as criações:** destino, título, descrição e confirmação. Descrição sugerida: resumo da US, critérios de aceite em texto legível e URL da US; a pessoa pode editar antes de enviar. **Opcionais comuns:** responsável, prioridade, data limite e rótulos/categorias, somente quando o provider disponibilizar esses campos ao usuário. Não mostrar sprint, custom fields ou status como se fossem universais.

| Integração | Primeiro seletor | Como o item entra no quadro | Campos do modal após escolher destino |
| --- | --- | --- | --- |
| **GitHub** | Repositório; opcionalmente GitHub Project | Criar uma Issue no repositório. Se foi escolhido Project, adicionar a Issue ao projeto e preencher o campo de coluna/grupo configurado (normalmente `Status`). Uma Issue sem Project continua válida e fica no repositório. | Título, corpo, labels, assignees e milestone, condicionados à permissão do token; Project e valor de campo simples configurado. Não oferecer mudar assignee/labels pelo Project API: pertencem à Issue. |
| **GitLab** | Projeto; board do projeto se existir | Criar uma Issue. Uma lista de board normalmente é um filtro por label, responsável, milestone ou iteration; ao escolher a lista, aplicar o valor que faz a issue aparecer nela. Sem board selecionado, a issue continua no projeto. Não criar boards ou listas automaticamente. | Título, descrição, labels, assignee, milestone e due date se suportados; iteration e weight conforme versão/plano. Para uma lista, mostrar o critério e aplicar label/assignee/milestone/iteration correspondente. Labels da lista e labels adicionais precisam ser combinadas sem perder nenhuma. |
| **OpenProject** | Instância e projeto; em seguida tipo de work package | Criar work package no projeto. `Status` coloca o item na coluna quando o board de ação é organizado por status; type/custom field pode definir a coluna em outros boards. A API v3 não garante que todos os boards/listas sejam recursos endereçáveis. | Assunto, descrição, type e status; prioridade, assignee/accountable, datas e custom fields conforme formulário efetivo para aquele projeto + tipo. Buscar o formulário/schema de criação em runtime; custom fields e valores não são fixos entre instalações. Mostrar o nome do board/coluna apenas quando puder ser verificado. |
| **Jira** | Site, projeto e issue type; board opcional daquele projeto/filtro | Criar Issue com campos de criação aceitos pelo projeto e tipo. Em Kanban, a coluna decorre do status mapeado no board; só prometer coluna quando houver uma transição válida. Em Scrum, escolher sprint aberta/futura separadamente; após criar, incluir no sprint. Board/filter precisa incluir a issue para que ela apareça. | Summary, description em Atlassian Document Format, issue type e campos requeridos retornados pela metadata; labels, assignee, priority, components e datas quando habilitados. Board opcional, coluna/status somente se for alcançável no workflow, sprint quando o board for Scrum e a pessoa tiver permissão. Campos Jira personalizados vêm da metadata do projeto/tipo. |

**Regras de descoberta e apresentação:**

1. Ao abrir o modal, buscar projetos e destinos paginados a partir das permissões da conexão; não pré-carregar todos os campos de todas as instâncias. Cada troca de site/projeto/tipo atualiza as opções dependentes e limpa valores que ficaram inválidos.
2. Identificar campos obrigatórios e valores permitidos pela API/formulário remoto. Se algum campo obrigatório não puder ser representado ou preenchido, bloquear criação com explicação e link para abrir o formulário externo; não enviar um payload parcial que falha sem contexto.
3. Marcar campos ausentes como “Não disponível nesta conexão” quando a permissão ou plano ocultar a capacidade; não sugerir que o item será assignee, milestone, sprint ou coluna se a API ignorar silenciosamente esse dado.
4. Antes de confirmar, apresentar frase derivada das regras reais, por exemplo: “Criar Issue no `grupo/projeto`, com label `Ready`, que aparece na lista `Ready` do board `Time A`”; “Criar work package no projeto `X` com status `Novo`”; ou “Criar `TASK` no projeto `X`, incluí-la no sprint `Y`; a coluna inicial depende do workflow”.
5. Depois de criar, reler o item remoto e gravar ID, URL, tipo e os dados efetivamente aceitos. Confirmar posicionamento após leitura quando possível; se o board/filter não incluir o item, mostrar a Issue criada e explicar que a regra externa do quadro não a inclui.

**Decisão para a primeira entrega:** começar com criação de Issue/work package e posicionamento determinístico em **um destino de execução escolhido**. Suportar apenas campos comuns e exigidos no destino + roteamento para board quando a integração comprovar como fazê-lo. Seletores avançados de campos customizados, mapeamentos reutilizáveis por equipe e múltiplos boards para uma única tarefa ficam como expansão posterior. Slack não é destino de tarefa: poderá enviar um aviso opcional depois que uma tarefa tiver sido criada, sem mudar o destino escolhido.

As APIs oficiais confirmam as diferenças: GitHub separa criação de Issue e inclusão/atualização em Projects; GitLab cria a issue e usa valores de lista de board como filtros; OpenProject fornece formulário dinâmico por projeto e tipo; Jira expõe metadata de criação por projeto/tipo, colunas por status e API separada para incluir issues em sprint. [GitHub Issues API](https://docs.github.com/en/rest/issues/issues), [GitHub Projects API](https://docs.github.com/en/issues/planning-and-tracking-with-projects/automating-your-project/using-the-api-to-manage-projects), [GitLab Issues API](https://docs.gitlab.com/api/issues/), [GitLab Boards API](https://docs.gitlab.com/api/boards/), [OpenProject formulário/API](https://www.openproject.org/docs/api/example/), [Jira Issue API](https://developer.atlassian.com/cloud/jira/platform/rest/v3/api-group-issues/), [Jira Board API](https://developer.atlassian.com/cloud/jira/software/rest/api-group-board/), [Jira Sprint API](https://developer.atlassian.com/cloud/jira/software/rest/api-group-sprint/)

O wizard de conexão segue passos consistentes: **Permissões → Autorizar → Escolher recursos → Confirmar comportamento**, mas pode ser interrompido após conectar. Mapeamento, importação, criação de tarefa e notificação são configurações/ações independentes, não parte obrigatória da autorização. O passo de autorização muda por provider; os demais seguem o mesmo contrato. Mostrar exemplos concretos de “o ATHENA lerá…” e “o ATHENA publicará…”; a confirmação inclui contagem prévia de objetos quando houver importação. Em mobile, cards em uma coluna e seções empilhadas; tabelas de atividade viram listas com ação e estado preservados. Teclado, foco de diálogo, mensagens de erro próximas à ação e estados anunciados por leitor de tela fazem parte do contrato.

**Permissões propostas no ATHENA:** OWNER gerencia conexões, escopos, mapeamentos, webhooks e regras Slack; EDITOR pode revisar candidatos e criar/vincular itens de execução nos projetos autorizados, com confirmação; VIEWER lê conexões e vínculos sem ver credenciais nem ações de escrita. Uma conexão externa nunca amplia permissões internas do ATHENA.

## 7. Segurança, operação e privacidade

- Credenciais, client secrets, tokens de webhook e refresh tokens ficam cifrados, nunca em resposta, URL de retorno, log ou snapshot. Reaproveitar `IntegrationCrypto`, mas planejar `keyVersion` e procedimento real de rotação; o código atual usa uma chave única sem rotação automática.
- OAuth usa `state` aleatório de uso único, associado ao usuário/workspace/provider, expiração curta e redirect URI exata. Reaproveitar o padrão do Google; tratar GitHub App installation callback e Slack/Jira/GitLab/OpenProject conforme suas diferenças.
- Conexão por usuário exige tratamento quando o usuário sai do workspace ou perde acesso externo. A UI mostra `Precisa reconectar` e não mantém jobs tentando indefinidamente.
- Sites self-hosted fornecidos por usuários exigem política de egress e proteção contra SSRF: HTTPS, host validado, resolução DNS e redirects revalidados, bloqueio de endereços sensíveis salvo configuração explícita de instalação administrada. Não aceitar URL arbitrária vinda do webhook como destino de fetch.
- Webhooks validam assinatura/timestamp quando o provider oferecer. Limitar tamanho do corpo, registrar ID da entrega e rejeitar duplicatas. Responder rápido e processar assíncrono. GitLab antigo pode exigir tratamento do token legado; a versão da instância define a capacidade.
- Reconciliar por projeto e janela incremental, com paginação e checkpoint. Usar chamadas completas quando a API não oferecer cursor ou quando houver suspeita de evento perdido. Erros de rate limit pausam a conexão pelo período indicado.
- Na desconexão, parar jobs e apagar credenciais; preservar vínculos/histórico com status `desconectado`. Se o provider permitir, revogar instalação/token ou orientar o usuário na tela sobre a revogação externa. Não apagar US nem mensagens já publicadas.
- Dados em Slack podem ficar visíveis a mais pessoas do que no ATHENA. Mostrar uma prévia, exigir seleção explícita de canal e não enviar corpo da US, critérios, comentários ou anexos por padrão.
- Métricas úteis: conexões saudáveis, jobs por estado, latência do último sync, webhooks rejeitados, taxa de 401/403/429, fila de avisos e itens com conflito. Logs usam IDs e códigos; não incluem payloads externos.

## 8. Ordem de implementação e critérios de conclusão

| Etapa | Entrega concreta | Critério de conclusão |
| --- | --- | --- |
| Etapa | Entrega concreta | Critério de conclusão |
| --- | --- | --- |
| 0. Base do piloto | Ação **Tarefas** na US, modal provider-aware, vínculo externo durável, estado de publicação/idempotência e adaptação mínima da aba Integrações; preservar os fluxos Google e importação GitHub atuais. Manter uma conexão GitHub e uma OpenProject por workspace no piloto. | Os fluxos atuais continuam funcionando; OWNER conecta cada ferramenta; editor vê apenas destinos conectados e permitidos. Nenhum serviço é obrigatório. |
| 1. Piloto GitHub + OpenProject | GitHub: reaproveitar PAT para listar repositórios e criar Issue; opcionalmente adicionar a um Project e valor de campo quando as permissões estiverem disponíveis. OpenProject: token de API piloto, descoberta de projeto/formulário e criação de work package. Ambos criam a partir do mesmo modal com prévia e link para a US. | Em workspace de teste, selecionar GitHub ou OpenProject, escolher destino, editar título/descrição e campos válidos, confirmar, ver ID/link na US e abrir no destino. Falha/retry não duplica; permissão insuficiente explica como corrigir. |
| 2. Endurecimento dos dois providers | Revisão de escopos e permissões; GitHub App para instalação seletiva; OAuth OpenProject quando o cadastro por instância estiver pronto; leitura de progresso e sincronização manual/periódica. | Reautorização, revogação, rate limit, erro remoto e perda de acesso ficam visíveis e recuperáveis sem expor credenciais nem alterar o texto da US. |
| 3. GitLab | GitLab.com e self-hosted, seleção de projeto/board/lista, criação de issue e posicionamento por atributo; importação revisável; webhooks quando suportados. | Integração opcional e isolada; issue aparece na lista esperada ou interface informa claramente a regra que não a incluiu. |
| 4. Jira Cloud | OAuth 3LO, site/projeto, tipo e campos dinâmicos, criação e vínculo de issue, board/status/sprint quando permitidos. | Campos vêm de metadata; status interno da US permanece independente; problemas de permissão e reconexão são recuperáveis. |
| 5. Slack | Instalação OAuth opcional, canal por projeto, eventos opt-in, teste e fila de envio. | Só uma regra ativada gera aviso; 429 adia; desconectar interrompe envios. |
| 6. Consolidação | Múltiplas conexões da mesma ferramenta, mapeamentos reutilizáveis, reconciliação/webhooks unificados, atividade e operação. | Evento perdido é corrigido pela reconciliação; falhas são visíveis, reproduzíveis e recuperáveis sem duplicação. |

**Escopo do teste inicial:** validar o fluxo contextual de encaminhar uma US em dois destinos alternativos, GitHub Issues e OpenProject work packages. A mesma equipe pode conectar ambos e escolher um por ação; o sistema não publica uma tarefa em ambos automaticamente. O piloto comprova o modal e o vínculo persistente antes de expandir para GitLab/Jira/Slack. GitHub usa o PAT já compatível com o código para encurtar o piloto; OpenProject aceita token de API piloto. GitHub App e OAuth OpenProject ficam para a etapa de endurecimento. Tokens são cadastrados dentro da tela segura do ATHENA e usados em um repositório/projeto de teste; não devem ser enviados em conversa ou usados para criar itens reais durante a validação inicial.

Essa ordem é uma **recomendação de desenvolvimento do ATHENA**, não uma sequência que clientes precisam cumprir. Depois do piloto, cada workspace continua livre para conectar apenas as ferramentas que usa. Uma empresa pode usar só OpenProject; outra, só GitHub Issues; outra, Jira + GitLab + Slack. Nenhuma precisa habilitar todos os providers.

Para cada provider, a entrega exige também: documentação de configuração no ambiente, matriz de escopos, simulação de 401/403/429 e revogação, isolamento entre workspaces, testes de idempotência, e validação controlada com conta/instância de teste. Não usar contas de produção na primeira validação externa.

## 9. Decisões para fechar antes de codar cada etapa

1. **Capacidades do piloto GitHub + OpenProject:** criar Issue/work package a partir da US; preservar importação GitHub já existente; adiar PR/MR, webhooks, notificações Slack e sincronização de conteúdo. A conexão em si não ativa publicação nem importação.
2. **Publicação de US:** publicar apenas resumo e link ou também uma cópia dos critérios? Recomendo resumo, código, objetivo e critérios em snapshot após prévia, com link permanente para a revisão no ATHENA, no item escolhido pelo usuário.
3. **Multiplicidade:** o piloto mantém uma conexão de GitHub e uma instância de OpenProject por workspace, compatível com o índice atual. Se surgir necessidade de vários sites ou instâncias do mesmo provider no mesmo workspace, ampliar a chave única antes de lançar esse caso a clientes.
4. **Self-hosted:** quais redes/hosts poderão ser alcançados pelo backend implantado? Essa decisão operacional determina a experiência de GitLab e OpenProject locais.
5. **Webhooks públicos:** a implantação terá URL HTTPS pública estável? Sem isso, lançar primeiro sincronização manual/periódica e adicionar eventos após a infraestrutura estar pronta.
6. **Canonicidade e atualização remota:** confirmar que o documento da US não será atualizado automaticamente por Jira/OpenProject/GitHub/GitLab. A proposta mantém mudanças externas como progresso ou candidato revisável.
7. **Google Drive existente:** confirmar como apresentar sua sincronização bidirecional automática ao lado de providers com publicação manual, com linguagem e alertas distintos.

## 10. Fontes e critério de pesquisa

Pesquisa realizada em 27/09/2026. Foram usadas documentações dos próprios fornecedores para uso do produto, APIs, OAuth, webhooks e limites; decisões de interface, domínio e ordem de entrega são propostas para o ATHENA. As páginas oficiais que mais influenciam a implementação estão ligadas junto às afirmações nas seções anteriores. Antes de escrever cada adaptador, conferir novamente a versão da API e a edição/plano da instância, sobretudo para GitLab Self-Managed, OpenProject e Jira Cloud, cujos recursos e regras variam.

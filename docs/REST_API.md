# REST API

Base: `/api`. Erros seguem `{ "error": { "code", "message", "details?" } }`. Rotas autenticadas usam cookie HttpOnly; autorização é verificada no backend pelo acesso efetivo ao projeto: membership do workspace prevalece, caso contrário é exigida membership daquele projeto.

Os tipos de transporte estáveis (papéis, status, relações, referências, critérios, versões, comentários, notificações e o envelope de erro) são publicados em `@athena/shared`. O backend mantém DTOs decorados pelo Nest e converte seus campos (`when`/`then`) para o shape de resposta (`whenText`/`thenText`); o frontend consome os aliases compartilhados. `anchor` é opcional na criação de comentário, mas quando presente contém `from`, `to` e `quote`.

## Autenticação e navegação

- `POST /auth/register`, `POST /auth/login`, `POST /auth/refresh`, `POST /auth/logout` e `GET /auth/me`.
- `GET /workspaces` lista workspaces em que a pessoa participa e projetos acessíveis. Membership do workspace retorna todos os projetos e `role` de workspace; membership somente de projeto retorna apenas os projetos concedidos, com papel no item do projeto e `role: null`.
- `POST /workspaces` cria workspace e atribui `OWNER` ao criador.
- `POST /workspaces/:workspaceId/projects` cria projeto; somente `OWNER`.
- `GET /projects/:projectId/graph` entrega nós e relações do projeto para o grafo.
- `GET /app-config` retorna `{ publicAppOrigin }` a partir de `APP_ORIGIN` (ou `WEB_ORIGIN`). Em produção a API recusa origem localhost.

## Integrações

- `GET /workspaces/:workspaceId/integrations` exige membership e retorna somente metadados seguros (`id`, `kind`, `status`, `accountLabel` e timestamps); nunca retorna credenciais.
- `POST /workspaces/:workspaceId/integrations` exige `OWNER` e recebe `{ kind: "GITHUB" | "GOOGLE", credentials: { ... }, accountLabel? }`. O segredo é validado, cifrado com AES-256-GCM e não aparece na resposta nem em logs.
- `DELETE /workspaces/:workspaceId/integrations/:kind` exige `OWNER`, marca a conexão como `DISCONNECTED` e torna a credencial inacessível. Fontes e candidatos históricos continuam preservados para importações futuras.
- `GET /workspaces/:workspaceId/integrations/github/account`, `GET /workspaces/:workspaceId/integrations/github/repositories?page=1` e `POST /workspaces/:workspaceId/integrations/github/import` exigem `OWNER`. O primeiro valida a conta sem expor o PAT; o segundo lista repositórios autorizados com paginação; o terceiro recebe uma lista explícita de `{ owner, repository, path }`, grava fontes/candidatos `PENDING` por identidade externa e nunca cria uma US canônica. Reimportação é idempotente; arquivo removido aparece em `failed` e 401/429 representam token revogado/rate limit.
- Google: `GET /workspaces/:workspaceId/integrations/google/oauth/start` e `GET /integrations/google/oauth/callback` usam state anti-CSRF vinculado ao workspace, TTL de 10 minutos e uso único. `GET /workspaces/:workspaceId/integrations/google/files?pageToken=...` lista arquivos autorizados; `POST /workspaces/:workspaceId/integrations/google/import` recebe IDs selecionados, lê Docs/texto suportado e cria somente candidatos `PENDING` por `google:drive:<fileId>`. Tokens são sempre cifrados e nunca retornados; erros de arquivo, permissão revogada e refresh expirado são legíveis.

- `POST /workspaces/:workspaceId/integrations/google/folder-links` recebe `{ externalId, name, projectId }`; somente OWNER vincula uma pasta a um projeto. O primeiro vínculo do projeto vira raiz de exportação; outros vínculos servem para importação. `POST /workspaces/:workspaceId/integrations/google/folder-links/:linkId/export-root` troca a raiz, somente para OWNER. `POST /workspaces/:workspaceId/integrations/google/folder-links/:linkId/sync` dispara a sincronização manual. A listagem informa `isExportRoot`, projeto, estado e erro seguro.
- `GET /projects/:projectId/integrations/google/export-preview` mostra a raiz e a contagem de US ativas sem vínculo e sem exportação já em andamento. `POST /projects/:projectId/integrations/google/export` exige OWNER e adiciona os itens elegíveis à outbox persistente. `GET /projects/:projectId/integrations/google/export-status` retorna raiz e operações pendentes/com falha, com tentativas e erro.

O módulo exige `INTEGRATION_ENCRYPTION_KEY` em base64 com exatamente 32 bytes na inicialização. Ausência, formato inválido ou chave de tamanho incorreto impedem o boot; consulte [INTEGRATIONS.md](INTEGRATIONS.md) para rotação segura.

## Requisitos

- `GET /projects/:projectId/requirements` e `POST /projects/:projectId/requirements`; criação exige `OWNER` ou `EDITOR`. A listagem aceita `status=active` (padrão) ou `status=archived`; qualquer outro valor retorna `400`. As listas são disjuntas.
- `GET /requirements/:id` entrega requisito, critérios e referências visíveis ao membro.
- `PATCH /requirements/:id` exige `revision` e exige `OWNER` ou `EDITOR`. Uma alteração editorial cria snapshot e ActivityLog. Em revisão vencida devolve HTTP 409 com `REQUIREMENT_REVISION_CONFLICT` e `details.currentRevision`.
- `DELETE /requirements/:id` arquiva, sem hard delete, remove relações e registra `REQUIREMENT_ARCHIVED` atomicamente; uma repetição é idempotente e não duplica ActivityLog. Exige `OWNER` ou `EDITOR`.
- `GET /requirements/:id/versions`, `GET /requirements/:id/diff?from&to` e `GET /requirements/:id/relations` são leitura para qualquer membro.
- `POST /requirements/:id/relations` e `DELETE /requirements/:id/relations/:relationId` exigem `OWNER` ou `EDITOR`.

O corpo editorial tem a forma abaixo. `content` é JSON TipTap; não aceite HTML bruto. Todos os requisitos são `USER_STORY`; `code`, `type` e `source` não são mutáveis depois da criação.

```json
{
  "title": "Página da equipe",
  "content": { "type": "doc", "content": [] },
  "folderId": "uuid-da-pasta",
  "acceptanceCriteria": [
    { "title": "Exibir equipe", "given": "que acesse a página", "when": "a tela carregar", "then": "vejo os membros", "text": "contexto opcional" }
  ],
  "revision": 3
}
```

Na criação, `status` inicia como `DRAFT`; o primeiro `PATCH` editorial promove a US para `ACTIVE`. Para criar a partir de um template, inclua `templateId` e `folderId`.

## Pastas

- `GET /projects/:projectId/folders` lista a árvore do projeto com contagem de US não arquivadas.
- `POST /projects/:projectId/folders` cria `{ name, description?, parentId? }`; exige `OWNER` ou `EDITOR`. Nomes são únicos por projeto e nível da árvore.
- `PATCH /projects/:projectId/folders/:id` atualiza nome, descrição ou `parentId`; valida ciclos e mantém `Sem pasta` na raiz.
- `DELETE /projects/:projectId/folders/:id` move atomicamente as US da pasta para `Sem pasta`, espera as realocações remotas antes de enviar a pasta à Lixeira e preserva a proteção contra exclusão com subpastas.
- A árvore atual do workspace é copiada para cada projeto na migração; workspaces sem projetos preservam a árvore antiga até o primeiro projeto.

## Exportação do Google Drive

- `POST /workspaces/:workspaceId/integrations/google/folder-links/:linkId/export-root` define o vínculo como raiz padrão do projeto; exige `OWNER`.
- `GET /projects/:projectId/integrations/google/export-preview` retorna raiz e quantidade de US ativas sem vínculo.
- `POST /projects/:projectId/integrations/google/export` inicia a exportação em lote dessa prévia; exige `OWNER`.
- `GET /projects/:projectId/integrations/google/export-status` retorna raiz e operações pendentes ou com falha, com tentativas e erros.

## Membros, papéis e pedidos de acesso

Papéis existentes no workspace são mantidos como memberships globais pela migração. Somente Owner do workspace administra membros, convites e pedidos.

- `GET /workspaces/:workspaceId/members` lista `{ role, user: { id, email, name } }`.
- `PATCH /workspaces/:workspaceId/members/:userId` recebe `{ role }`.
- `DELETE /workspaces/:workspaceId/members/:userId` remove o acesso e os vínculos de projeto remanescentes. O servidor não permite remover ou rebaixar o último Owner.
- `GET /projects/:projectId/members` lista memberships do workspace e do projeto; `PATCH /projects/:projectId/members/:userId` recebe papel `EDITOR`/`VIEWER`; `DELETE` remove somente o vínculo daquele projeto.
- `GET /workspaces/:workspaceId/participants` lista pessoas do workspace; `GET /projects/:projectId/participants` lista pessoas visíveis no projeto e é usado para menções.
- `POST /projects/:projectId/access-requests` cria ou reutiliza o único pedido pendente da pessoa/projeto. Abrir link sem permissão cria esse pedido depois do login e não retorna conteúdo da US.
- `GET /access-requests/mine` lista solicitações da pessoa; `GET /workspaces/:workspaceId/access-requests` e `GET /projects/:projectId/access-requests` listam pedidos para Owners.
- `POST /access-requests/:id/approve` recebe `{ scope: "PROJECT" | "WORKSPACE", role: "EDITOR" | "VIEWER" }`; `POST /access-requests/:id/deny` recusa. A decisão atualiza o estado atomicamente; somente a primeira prevalece. Recusas deixam a pessoa solicitar novamente.

Workspace permite `OWNER`, `EDITOR`, `VIEWER`; projeto permite `EDITOR`, `VIEWER`. Integrações, templates, checklist e importações globais permanecem no escopo do workspace.

## Identidade, sessões e convites

`POST /auth/register` recebe `name`, `email`, `password`, `passwordConfirmation`, `termsAccepted` e `returnTo?`; responde `202` e nunca abre sessão. A senha deve ter ao menos 8 caracteres, incluindo letra, número e caractere especial. A mesma política vale para redefinição. `POST /auth/verify-email` confirma o token de uso único (24 h). `POST /auth/resend-verification` e `POST /auth/forgot-password` sempre respondem `202` sem enumerar contas. Reset (`POST /auth/reset-password`, token de 1 h) invalida todas as sessões.

`POST /auth/login` cria cookies HttpOnly `athena_access` (15 min) e `athena_refresh`; o segundo é rotativo e vira cookie de sessão quando `remember=false`, ou dura 30 dias quando marcado. `POST /auth/refresh`, `POST /auth/logout`, `GET /auth/me`, `GET /auth/sessions` e `DELETE /auth/sessions/:id` completam a gestão de dispositivos. Cada access token inclui um `sid`; o guard exige sessão persistida, não revogada, não expirada e usuário confirmado.

Somente Owner cria convites: `POST /workspaces/:workspaceId/invites` e `POST /projects/:projectId/invites` recebem `email` e `role` (`EDITOR`/`VIEWER`). Seus `GET` listam convites sem tokens; `POST /:id/resend` substitui o token e `DELETE /:id` revoga. `GET /invites/resolve?token=` identifica o escopo do convite. `POST /invites/accept` exige sessão confirmada no mesmo e-mail e cria a membership em transação. Link direto para projeto é preservado durante cadastro, confirmação e login.

Em produção, configure um domínio remetente verificado no Resend e informe `RESEND_FROM` no formato `ATHENA <acesso@dominio-verificado>`, além de `RESEND_API_KEY`, `APP_ORIGIN`, URLs e versões de Termos/Privacidade. A API falha no boot se qualquer uma dessas variáveis estiver ausente. Em desenvolvimento, sem chave Resend, o envio é capturado explicitamente no log sem registrar token ou senha.

## Templates

- `GET /workspaces/:workspaceId/templates` é leitura para qualquer membro.
- `POST /workspaces/:workspaceId/templates` cria template; `OWNER` ou `EDITOR`.
- `GET /templates/:id` lê template mediante membership no workspace de origem.
- `PATCH /templates/:id` e `DELETE /templates/:id` exigem `OWNER` ou `EDITOR`.

Um template recebe `name`, `description?`, `content` e `acceptanceCriteria?`. Aplicá-lo no cliente apenas pré-preenche a criação de requisito; a API não cria vínculo vivo entre requisito e template.

## Checklist de revisão do workspace

- `GET /workspaces/:workspaceId/review-checklist` retorna `{ items: string[] }` para membros do workspace.
- `PUT /workspaces/:workspaceId/review-checklist` substitui e reordena a lista inteira; exige `OWNER` ou `EDITOR`. O corpo é `{ items: string[] }`, com até 100 itens não vazios de no máximo 1000 caracteres.
- Workspaces novos e existentes iniciam com os itens de revisão padrão. A API armazena a configuração; executar revisões ou registrar conclusão por história não faz parte deste recurso.

## Referências, comentários e notificações

- `GET /requirements/:id/references` é leitura para membros; `DELETE /requirements/:id/references/:referenceId` exige `OWNER` ou `EDITOR`. Referências manuais já existentes são preservadas e removíveis; nenhuma UI oferece criação manual. O `POST /requirements/:id/references` permanece apenas como limite de compatibilidade e sempre responde HTTP 409 com `MANUAL_REFERENCE_CREATION_DISABLED`.
- Referência recebe `{ type: "PROTOTYPE" | "ATTACHMENT", name, url, position? }`; URL usa `http`, `https` ou `mailto`.
- `GET /requirements/:id/comments` lista threads e mensagens para membros.
- `GET /workspaces/:workspaceId/participants` e `GET /projects/:projectId/participants` retornam somente `{ id, name }` para menções.
- `POST /requirements/:id/comments` cria thread em US ativas; qualquer papel autorizado no escopo do projeto. Em US arquivada, comentários, respostas, resolução e reabertura são rejeitados: o histórico é somente leitura. Corpo: `{ body, anchor, mentionedUserIds? }`, onde `anchor` contém `from`, `to` e `quote`. Menções só aceitam pessoas visíveis no mesmo projeto/workspace e geram notificação interna.
- `POST /comments/:threadId/replies` responde thread com `{ body, mentionedUserIds? }`; mesmos papéis que comentam.
- `PATCH /comments/:threadId/resolve` e `PATCH /comments/:threadId/reopen`: autor da thread, `EDITOR` ou `OWNER`.
- `GET /notifications` lista menções e eventos de acesso visíveis à pessoa; `PATCH /notifications/:id/read` marca uma notificação própria como lida. Todos os Owners recebem evento e e-mail para pedido novo; a pessoa solicitante recebe evento e e-mail após a decisão.

Comentários, respostas, resolução, reabertura e leitura de notificação não alteram `Requirement.revision`.

## Compatibilidade do documento TipTap

O backend valida limite de 256 KB e rejeita atributos desconhecidos. Além dos blocos básicos, o editor colaborativo usa tabelas com cabeçalhos, células, linhas/colunas e metadados controlados de linha de seção. Comentários ficam em entidades próprias, ancoradas por posições e citação do documento, em vez de HTML ou marcas livres no conteúdo. Links aceitos são `http`, `https` e `mailto`.
## Candidatos de integração

`GET /workspaces/:workspaceId/integration-candidates?status=PENDING` lista somente candidatos do workspace e `GET /integration-candidates/:id` retorna seu histórico de revisões. Para vínculos automáticos do Google, esses registros são uma trilha auditável `ACCEPTED`, não uma etapa de aprovação. `POST /integration-candidates/:id/approve` exige `OWNER`/`EDITOR`, recebe `projectId`, `folderId?`, `requirementId?`, `expectedUpdatedAt` e `expectedRevision?`; `POST /integration-candidates/:id/reject` usa o mesmo controle otimista. `VIEWER` pode consultar, mas não aprovar ou rejeitar.

A aprovação converte o texto externo em documento TipTap válido (`doc > paragraph > text`) e grava `source=INTEGRATION:GITHUB|GOOGLE` sem expor segredos. Conflitos preservam candidato e requisito canônico. A varredura interna `markSourcesMissing` marca fontes ausentes com `removedAt` e candidatos pendentes com `changeType=REMOVED`, mantendo a trilha; uma fonte reaparecida é reativada sem duplicar seu snapshot externo.

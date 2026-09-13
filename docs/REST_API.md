# REST API

Base: `/api`. Erros seguem `{ "error": { "code", "message", "details?" } }`. Rotas autenticadas usam cookie HttpOnly; autorização é sempre verificada no backend pela cadeia `Project → Workspace → WorkspaceMember`.

Os tipos de transporte estáveis (papéis, status, relações, referências, critérios, versões, comentários, notificações e o envelope de erro) são publicados em `@athena/shared`. O backend mantém DTOs decorados pelo Nest e converte seus campos (`when`/`then`) para o shape de resposta (`whenText`/`thenText`); o frontend consome os aliases compartilhados. `anchor` é opcional na criação de comentário, mas quando presente contém `from`, `to` e `quote`.

## Autenticação e navegação

- `POST /auth/register`, `POST /auth/login`, `POST /auth/refresh`, `POST /auth/logout` e `GET /auth/me`.
- `GET /workspaces` lista somente workspaces do usuário: `[{ id, name, role, projects: [{ id, name, key }] }]`.
- `POST /workspaces` cria workspace e atribui `OWNER` ao criador.
- `POST /workspaces/:workspaceId/projects` cria projeto; somente `OWNER`.
- `GET /projects/:projectId/graph` entrega nós e relações do projeto para o grafo.

## Integrações

- `GET /workspaces/:workspaceId/integrations` exige membership e retorna somente metadados seguros (`id`, `kind`, `status`, `accountLabel` e timestamps); nunca retorna credenciais.
- `POST /workspaces/:workspaceId/integrations` exige `OWNER` e recebe `{ kind: "GITHUB" | "GOOGLE", credentials: { ... }, accountLabel? }`. O segredo é validado, cifrado com AES-256-GCM e não aparece na resposta nem em logs.
- `DELETE /workspaces/:workspaceId/integrations/:kind` exige `OWNER`, marca a conexão como `DISCONNECTED` e torna a credencial inacessível. Fontes e candidatos históricos continuam preservados para importações futuras.
- `GET /workspaces/:workspaceId/integrations/github/account`, `GET /workspaces/:workspaceId/integrations/github/repositories?page=1` e `POST /workspaces/:workspaceId/integrations/github/import` exigem `OWNER`. O primeiro valida a conta sem expor o PAT; o segundo lista repositórios autorizados com paginação; o terceiro recebe uma lista explícita de `{ owner, repository, path }`, grava fontes/candidatos `PENDING` por identidade externa e nunca cria uma US canônica. Reimportação é idempotente; arquivo removido aparece em `failed` e 401/429 representam token revogado/rate limit.
- Google: `GET /workspaces/:workspaceId/integrations/google/oauth/start` e `GET /integrations/google/oauth/callback` usam state anti-CSRF vinculado ao workspace, TTL de 10 minutos e uso único. `GET /workspaces/:workspaceId/integrations/google/files?pageToken=...` lista arquivos autorizados; `POST /workspaces/:workspaceId/integrations/google/import` recebe IDs selecionados, lê Docs/texto suportado e cria somente candidatos `PENDING` por `google:drive:<fileId>`. Tokens são sempre cifrados e nunca retornados; erros de arquivo, permissão revogada e refresh expirado são legíveis.

- `POST /workspaces/:workspaceId/integrations/google/folder-links` recebe `{ externalId, name, projectId }`; somente OWNER vincula uma raiz a um projeto. `POST /workspaces/:workspaceId/integrations/google/folder-links/:linkId/sync` dispara a mesma sincronização usada pelo job periódico e retorna o estado/quantidade alterada. A listagem de vínculos inclui `projectId`, `syncStatus`, `lastSyncedAt` e erro seguro quando houver.

O módulo exige `INTEGRATION_ENCRYPTION_KEY` em base64 com exatamente 32 bytes na inicialização. Ausência, formato inválido ou chave de tamanho incorreto impedem o boot; consulte [INTEGRATIONS.md](INTEGRATIONS.md) para rotação segura.

## Requisitos

- `GET /projects/:projectId/requirements` e `POST /projects/:projectId/requirements`; criação exige `OWNER` ou `EDITOR`. A listagem aceita `status=active` (padrão) ou `status=archived`; qualquer outro valor retorna `400`. As listas são disjuntas.
- `GET /requirements/:id` entrega requisito, critérios e referências visíveis ao membro.
- `PATCH /requirements/:id` exige `revision` e exige `OWNER` ou `EDITOR`. Uma alteração editorial cria snapshot e ActivityLog. Em revisão vencida devolve HTTP 409 com `REQUIREMENT_REVISION_CONFLICT` e `details.currentRevision`.
- `DELETE /requirements/:id` arquiva, sem hard delete, remove relações e registra `REQUIREMENT_ARCHIVED` atomicamente; uma repetição é idempotente e não duplica ActivityLog. Exige `OWNER` ou `EDITOR`.
- `GET /requirements/:id/versions`, `GET /requirements/:id/diff?from&to` e `GET /requirements/:id/relations` são leitura para qualquer membro.
- `POST /requirements/:id/relations` e `DELETE /requirements/:id/relations/:relationId` exigem `OWNER` ou `EDITOR`.

Análises de IA persistem sugestões internas com `type` (`RELATION` ou `REFERENCE`), `targetRequirementId` ou `url`, `confidence`, `justification`, `status` (`PENDING`, `CONFIRMED`, `DISMISSED`) e `error` opcional. O alvo de relação é validado no mesmo projeto e URLs aceitam apenas `http`, `https` e `mailto`. A sugestão não altera a US nem cria relação/referência até uma confirmação humana.

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

Após a primeira ativação, `GET /requirements/:id/ai-analysis` consulta a análise assíncrona (`PENDING`, `COMPLETED` ou `FAILED`) e suas sugestões. `POST /requirements/:id/ai-analysis/retry` agenda novamente uma análise falha e responde sem esperar o provider; a mesma análise é reutilizada.

- `GET /requirements/:id/ai-suggestions` lista as sugestões da US para qualquer membro do workspace (`VIEWER` incluído).
- `POST /ai-suggestions/:id/approve` e `POST /ai-suggestions/:id/dismiss` exigem `OWNER` ou `EDITOR`. A decisão é transacional e idempotente: aprovação valida o alvo ativo no mesmo projeto ou a URL permitida e só então cria a relação/referência; uma duplicata não cria outro vínculo. Alvos inválidos deixam a sugestão `PENDING` com `error` para correção/reprocessamento. Descartar nunca grava vínculo.

## Pastas

- `GET /workspaces/:workspaceId/folders` lista pastas com a contagem de US não arquivadas.
- `POST /workspaces/:workspaceId/folders` cria `{ name, description? }`; exige `OWNER` ou `EDITOR`. O nome é normalizado, não pode ser vazio, reservado (`Sem pasta`) ou duplicado no workspace.
- `PATCH /folders/:id` atualiza nome/descrição; exige `OWNER` ou `EDITOR`. `Sem pasta` não pode ser renomeada; nomes vazios ou duplicados retornam `400/409` com mensagem explicativa.
- `DELETE /folders/:id` move atomicamente todas as US da pasta para `Sem pasta` — inclusive arquivadas e requisitos de outros projetos do workspace — antes de excluí-la; a pasta padrão não pode ser excluída.

## Membros e papéis

Todos os endpoints abaixo exigem `OWNER` no workspace.

- `GET /workspaces/:workspaceId/members` lista `{ role, user: { id, email, name } }`.
- `POST /workspaces/:workspaceId/members` recebe `{ email, role }`. O e-mail deve corresponder a uma conta já cadastrada; não envia convite.
- `PATCH /workspaces/:workspaceId/members/:userId` recebe `{ role }`.
- `DELETE /workspaces/:workspaceId/members/:userId` remove o acesso. O servidor não permite remover ou rebaixar o último Owner.

Papéis válidos: `OWNER`, `EDITOR`, `VIEWER`. Consulte a matriz em `DOMAIN_MODEL.md`.

## Templates

- `GET /workspaces/:workspaceId/templates` é leitura para qualquer membro.
- `POST /workspaces/:workspaceId/templates` cria template; `OWNER` ou `EDITOR`.
- `GET /templates/:id` lê template mediante membership no workspace de origem.
- `PATCH /templates/:id` e `DELETE /templates/:id` exigem `OWNER` ou `EDITOR`.

Um template recebe `name`, `description?`, `content` e `acceptanceCriteria?`. Aplicá-lo no cliente apenas pré-preenche a criação de requisito; a API não cria vínculo vivo entre requisito e template.

## Referências, comentários e notificações

- `GET /requirements/:id/references` é leitura para membros; `DELETE /requirements/:id/references/:referenceId` exige `OWNER` ou `EDITOR`. Referências manuais já existentes são preservadas e removíveis; nenhuma UI oferece criação manual. O `POST /requirements/:id/references` permanece apenas como limite de compatibilidade e sempre responde HTTP 409 com `MANUAL_REFERENCE_CREATION_DISABLED`; novas referências só podem ser persistidas pelo fluxo interno de aprovação de sugestão de IA, que valida membership no workspace e URL.
- Referência recebe `{ type: "PROTOTYPE" | "ATTACHMENT", name, url, position? }`; URL usa `http`, `https` ou `mailto`.
- `GET /requirements/:id/comments` lista threads e mensagens para membros.
- `GET /workspaces/:workspaceId/participants` está disponível a qualquer membro e retorna somente `{ id, name }` para menções.
- `POST /requirements/:id/comments` cria thread em US ativas; `OWNER`, `EDITOR` ou `VIEWER`. Em US arquivada, comentários, respostas, resolução e reabertura são rejeitados: o histórico é somente leitura. Corpo: `{ body, anchor, mentionedUserIds? }`, onde `anchor` contém `from`, `to` e `quote`. Menções são IDs explícitos de membros do mesmo workspace e geram notificações internas.
- `POST /comments/:threadId/replies` responde thread com `{ body, mentionedUserIds? }`; mesmos papéis que comentam.
- `PATCH /comments/:threadId/resolve` e `PATCH /comments/:threadId/reopen`: autor da thread, `EDITOR` ou `OWNER`.
- `GET /notifications` lista notificações do usuário autenticado; `PATCH /notifications/:id/read` marca uma notificação própria como lida.

Comentários, respostas, resolução, reabertura e leitura de notificação não alteram `Requirement.revision`.

## Compatibilidade do documento TipTap

O backend valida limite de 256 KB e rejeita atributos desconhecidos. Além dos blocos básicos, o editor colaborativo usa tabelas com cabeçalhos, células, linhas/colunas e metadados controlados de linha de seção. Comentários ficam em entidades próprias, ancoradas por posições e citação do documento, em vez de HTML ou marcas livres no conteúdo. Links aceitos são `http`, `https` e `mailto`.
## Candidatos de integração

`GET /workspaces/:workspaceId/integration-candidates?status=PENDING` lista somente candidatos do workspace e `GET /integration-candidates/:id` retorna seu histórico de revisões. Para vínculos automáticos do Google, esses registros são uma trilha auditável `ACCEPTED`, não uma etapa de aprovação. `POST /integration-candidates/:id/approve` exige `OWNER`/`EDITOR`, recebe `projectId`, `folderId?`, `requirementId?`, `expectedUpdatedAt` e `expectedRevision?`; `POST /integration-candidates/:id/reject` usa o mesmo controle otimista. `VIEWER` pode consultar, mas não aprovar ou rejeitar.

A aprovação converte o texto externo em documento TipTap válido (`doc > paragraph > text`) e grava `source=INTEGRATION:GITHUB|GOOGLE` sem expor segredos. Conflitos preservam candidato e requisito canônico. A varredura interna `markSourcesMissing` marca fontes ausentes com `removedAt` e candidatos pendentes com `changeType=REMOVED`, mantendo a trilha; uma fonte reaparecida é reativada sem duplicar seu snapshot externo.

# REST API

Base: `/api`. Erros seguem `{ "error": { "code", "message", "details?" } }`. Rotas autenticadas usam cookie HttpOnly; autorização é sempre verificada no backend pela cadeia `Project → Workspace → WorkspaceMember`.

## Autenticação e navegação

- `POST /auth/register`, `POST /auth/login`, `POST /auth/refresh`, `POST /auth/logout` e `GET /auth/me`.
- `GET /workspaces` lista somente workspaces do usuário: `[{ id, name, role, projects: [{ id, name, key }] }]`.
- `POST /workspaces` cria workspace e atribui `OWNER` ao criador.
- `POST /workspaces/:workspaceId/projects` cria projeto; somente `OWNER`.
- `GET /projects/:projectId/graph` entrega nós e relações do projeto para o grafo.

## Requisitos

- `GET /projects/:projectId/requirements` e `POST /projects/:projectId/requirements`; criação exige `OWNER` ou `EDITOR`.
- `GET /requirements/:id` entrega requisito, critérios e referências visíveis ao membro.
- `PATCH /requirements/:id` exige `revision` e exige `OWNER` ou `EDITOR`. Uma alteração editorial cria snapshot e ActivityLog. Em revisão vencida devolve HTTP 409 com `REQUIREMENT_REVISION_CONFLICT` e `details.currentRevision`.
- `DELETE /requirements/:id` arquiva, sem hard delete, remove relações e exige `OWNER` ou `EDITOR`.
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

- `GET /workspaces/:workspaceId/folders` lista pastas com a contagem de US não arquivadas.
- `POST /workspaces/:workspaceId/folders` cria `{ name, description? }`; exige `OWNER` ou `EDITOR`.
- `PATCH /folders/:id` atualiza nome/descrição; exige `OWNER` ou `EDITOR`.
- `DELETE /folders/:id` move os requisitos para `Sem pasta`; a pasta padrão não pode ser excluída.

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

- `GET /requirements/:id/references` é leitura para membros; `POST /requirements/:id/references` e `DELETE /requirements/:id/references/:referenceId` exigem `OWNER` ou `EDITOR`.
- Referência recebe `{ type: "PROTOTYPE" | "ATTACHMENT", name, url, position? }`; URL usa `http`, `https` ou `mailto`.
- `GET /requirements/:id/comments` lista threads e mensagens para membros.
- `GET /workspaces/:workspaceId/participants` está disponível a qualquer membro e retorna somente `{ id, name }` para menções.
- `POST /requirements/:id/comments` cria thread; `OWNER`, `EDITOR` ou `VIEWER`. Corpo: `{ body, anchor, mentionedUserIds? }`, onde `anchor` contém `from`, `to` e `quote`. Menções são IDs explícitos de membros do mesmo workspace e geram notificações internas.
- `POST /comments/:threadId/replies` responde thread com `{ body, mentionedUserIds? }`; mesmos papéis que comentam.
- `PATCH /comments/:threadId/resolve` e `PATCH /comments/:threadId/reopen`: autor da thread, `EDITOR` ou `OWNER`.
- `GET /notifications` lista notificações do usuário autenticado; `PATCH /notifications/:id/read` marca uma notificação própria como lida.

Comentários, respostas, resolução, reabertura e leitura de notificação não alteram `Requirement.revision`.

## Compatibilidade do documento TipTap

O backend valida limite de 256 KB e rejeita atributos desconhecidos. Além dos blocos básicos, o editor colaborativo usa tabelas com cabeçalhos, células, linhas/colunas e metadados controlados de linha de seção. Comentários ficam em entidades próprias, ancoradas por posições e citação do documento, em vez de HTML ou marcas livres no conteúdo. Links aceitos são `http`, `https` e `mailto`.

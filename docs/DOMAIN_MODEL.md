# Modelo de domínio

`User` pertence a um `Workspace` por `WorkspaceMember`. A membership contém um papel (`OWNER`, `EDITOR` ou `VIEWER`) e é a fronteira de autorização: um `Project` pertence ao workspace e um `Requirement` pertence ao projeto.

## Requisitos e rastreabilidade

- `Requirement` guarda código `US-*`, título, documento TipTap JSON, pasta, status e `revision`. Todos os requisitos têm tipo `USER_STORY`; prioridade, tags livres e User Story separada não existem mais.
- `RequirementFolder` pertence ao workspace e organiza cada requisito por uma única pasta. `Sem pasta` é obrigatória. A baseline parte de banco PostgreSQL novo; migração automática de tags ou de dados do RequisitoGraph não faz parte deste modelo.
- `AcceptanceCriterion` é filho ordenado do requisito. Além do texto legado, o formato colaborativo representa título e cenário `given`, `when`, `then`, com conteúdo complementar opcional quando aplicável.
- `RequirementVersion` armazena o snapshot anterior. Toda alteração editorial relevante cria versão, incrementa `revision` e registra `ActivityLog` na mesma transação.
- `RequirementRelation` liga requisitos no mesmo projeto; `RequirementReference` registra links externos de `PROTOTYPE` ou `ATTACHMENT`. Referência é metadado/link, não upload de arquivo.
- `AiSuggestion` pertence a uma `ImpactAnalysis` e à US de origem. Pode propor uma `RELATION` para outra US ativa do mesmo projeto ou uma `REFERENCE` com URL `http`, `https` ou `mailto`; sua decisão (`PENDING`/`CONFIRMED`/`DISMISSED`) não altera a US canônica sem aprovação explícita.

## Colaboração

- `DocumentTemplate` pertence a um workspace e guarda a estrutura reutilizável do documento e critérios. Ao aplicar um template, seu conteúdo é copiado para o requisito novo.
- `CommentThread` pertence a um requisito, tem autor, estado `OPEN`/`RESOLVED` e âncora de seleção. A âncora preserva o identificador do trecho no documento e uma prévia textual para recuperação visual se o trecho for removido.
- `CommentMessage` pertence a uma thread; respostas e menções são mensagens, não revisão do requisito.
- `Notification` pertence ao usuário mencionado e aponta para a thread/mensagem que motivou a notificação. Inicialmente é apenas interna ao ATHENA.

## Papéis

| Papel | Leitura | Comentários | Editar requisitos/templates | Membros e projetos |
| --- | --- | --- | --- | --- |
| `OWNER` | Sim | Sim | Sim | Sim |
| `EDITOR` | Sim | Sim | Sim | Não |
| `VIEWER` | Sim | Sim | Não | Não |

Owners também podem resolver/reabrir threads; Editors podem resolver/reabrir qualquer thread do workspace. Viewers podem comentar, responder e resolver/reabrir apenas as threads que criaram, conforme as regras de autorização da API.

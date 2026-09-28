# Modelo de domínio

`User` pode pertencer a um `Workspace` por `WorkspaceMember` ou somente a um `Project` por `ProjectMember`. O acesso efetivo ao projeto é calculado centralmente: membership do workspace prevalece e cobre todos os projetos; sem ela, vale somente o papel de projeto.

## Identidade e acesso

Uma conta tem e-mail normalizado, hash Argon2id, confirmação de e-mail e registros de aceite legal versionados. `AuthSession` mantém somente o hash do segredo de refresh, expiração, persistência e revogação; o JWT de acesso referencia a sessão por `sid`. Tokens de confirmação e reset persistem somente SHA-256 e são de uso único. `WorkspaceInvite` e `ProjectInvite` mantêm destinatário, papel, emissor, hash de token, expiração, estado de entrega/revogação/aceite e usuário que aceitou; nenhum deles cria membership antes do aceite verificado.
- `ProjectMember` concede somente `EDITOR` ou `VIEWER` em um projeto. Ao adicionar ou promover a pessoa ao workspace, os vínculos de projeto redundantes são apagados; remover a membership do workspace também limpa vínculos de projeto daquele workspace.
- `AccessRequest` associa solicitante, projeto e workspace. `activeKey` permite no máximo um pedido pendente por pessoa/projeto e é limpo ao decidir, para permitir uma nova solicitação após recusa. A decisão registra Owner, data, escopo (`PROJECT`/`WORKSPACE`) e papel.

## Requisitos e rastreabilidade

- `Requirement` guarda código `US-*`, título, documento TipTap JSON, pasta, status e `revision`. Todos os requisitos têm tipo `USER_STORY`; prioridade, tags livres e User Story separada não existem mais.
- `RequirementFolder` pertence a um projeto e organiza os requisitos desse projeto por uma única pasta. `Sem pasta` é obrigatória. Uma pasta de workspace legado sem projeto é mantida somente durante a transição; a primeira criação de projeto copia a árvore e remove essa árvore de transição. A migração clona a árvore existente para cada projeto e reatribui US e mapeamentos Drive às cópias.
- `AcceptanceCriterion` é filho ordenado do requisito. Além do texto legado, o formato colaborativo representa título e cenário `given`, `when`, `then`, com conteúdo complementar opcional quando aplicável.
- `RequirementVersion` armazena o snapshot anterior. Toda alteração editorial relevante cria versão, incrementa `revision` e registra `ActivityLog` na mesma transação.
- `RequirementRelation` liga requisitos no mesmo projeto; `RequirementReference` registra links externos de `PROTOTYPE` ou `ATTACHMENT`. Referência é metadado/link, não upload de arquivo.

## Colaboração

- `DocumentTemplate` pertence a um workspace e guarda a estrutura reutilizável do documento e critérios. Ao aplicar um template, seu conteúdo é copiado para o requisito novo.
- `CommentThread` pertence a um requisito, tem autor, estado `OPEN`/`RESOLVED` e âncora de seleção. A âncora preserva o identificador do trecho no documento e uma prévia textual para recuperação visual se o trecho for removido.
- `CommentMessage` pertence a uma thread; respostas e menções são mensagens, não revisão do requisito.
- `Notification` pertence a um usuário e aponta para uma menção ou pedido de acesso. Avisos de pedido vão para todos os Owners do workspace; a decisão cria aviso para a pessoa solicitante. E-mails acompanham os dois eventos.

## Google Drive por projeto

- `GoogleDriveFolderLink` associa uma pasta de importação a um projeto. Um único vínculo por projeto tem `isExportRoot=true`; o primeiro vínculo é selecionado inicialmente e OWNER pode trocar a raiz.
- `GoogleDriveFolderMapping` relaciona pastas remotas e locais por vínculo. Uma pasta local pode ter mapeamentos em mais de um vínculo do projeto.
- `GoogleDriveOutbox` representa uma escrita persistente de requisito ou pasta, com estado, tentativas, erro e chave de idempotência. Escritas locais continuam válidas sem raiz ou conexão; arquivos importados mantêm o vínculo à fonte.

## Papéis

| Papel | Leitura | Comentários | Editar requisitos/pastas | Administrar acesso |
| --- | --- | --- | --- | --- |
| Workspace `OWNER` | Todos os projetos | Sim | Sim | Sim |
| Workspace `EDITOR` | Todos os projetos | Sim | Sim | Não |
| Workspace `VIEWER` | Todos os projetos | Sim | Não | Não |
| Projeto `EDITOR` | Somente o projeto concedido | Sim | Sim | Não |
| Projeto `VIEWER` | Somente o projeto concedido | Sim | Não | Não |

Owners e Editors podem resolver/reabrir threads dentro do escopo concedido. Viewers podem comentar, responder e resolver/reabrir apenas as threads que criaram, conforme as regras de autorização da API.

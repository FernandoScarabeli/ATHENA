# Decisões de produto do ATHENA

Este documento é a fonte de verdade das regras de produto da reformulação atual. Toda alteração de comportamento deve atualizar este arquivo e o contrato técnico correspondente.

## Requisitos

- Todo requisito é uma User Story e usa o código `US-###`.
- Não existem tipos Funcional ou Não funcional no produto.
- O conteúdo da User Story fica no Documento TipTap; não há campos separados Como/Quero/Para.
- O Documento oferece formatação essencial estilo Docs e só persiste alterações por salvamento explícito.
- Prioridade e descrição separada não fazem parte do produto.

## Status

- Nova US: `DRAFT`.
- Primeiro salvamento no editor: `ACTIVE` automaticamente.
- Cancelamento: `ARCHIVED` com soft delete transacional. A operação preserva documento, critérios, versões, comentários e atividade; remove relações e é idempotente. Canceladas aparecem em uma lista própria, são consultáveis por qualquer membro autorizado em modo somente leitura e não aceitam novos comentários, respostas ou alterações de status de comentários.

## Papéis e acesso

- No workspace existem `OWNER`, `EDITOR` e `VIEWER`. Em um projeto, os papéis são `EDITOR` e `VIEWER`.
- A membership do workspace dá acesso a todos os projetos. Ela prevalece sobre qualquer membership de projeto; ao promover alguém ao workspace, seus vínculos redundantes de projeto são removidos.
- O papel de projeto dá acesso somente às User Stories, pastas, comentários e tarefas externas vinculadas daquele projeto. Não libera templates, checklist, importações ou outros recursos globais do workspace.
- `OWNER` administra membros, convites e pedidos de acesso do workspace e dos projetos. `EDITOR` edita requisitos, pastas, relações e comentários dentro do escopo concedido; `VIEWER` lê e comenta.
- Remover uma pessoa do workspace também remove qualquer vínculo de projeto remanescente.
- A migração preserva os membros e papéis atuais como memberships do workspace, mantendo o acesso existente a todos os projetos.
- `COMMENTER` é uma nomenclatura obsoleta e não representa um papel atual.

## Identidade e convites

- Cadastro é público, requer nome, senha com no mínimo 8 caracteres incluindo letra, número e caractere especial, aceite versionado de Termos/Privacidade e confirmação de e-mail; nunca cria workspace automaticamente. A mesma política vale para redefinição de senha.
- Login só é permitido para contas confirmadas. Refresh é rotativo por sessão/dispositivo; redefinir senha revoga todas as sessões.
- E-mails de confirmação, reset e convite usam Resend, tokens de alta entropia e links absolutos. Em desenvolvimento o envio é explicitamente capturado; produção exige `APP_ORIGIN`, `RESEND_API_KEY` e `RESEND_FROM`.
- Somente `OWNER` convida, reenvia e revoga. Convites expiram em sete dias, não aceitam `OWNER` como papel e exigem conta confirmada no mesmo e-mail antes de criar a membership.
- Convites diretos podem conceder acesso ao workspace ou a um projeto e aceitam pessoas que ainda não têm conta. O acesso só é ativado depois do cadastro, confirmação do e-mail correspondente e aceite do convite.
- Abrir o link de origem de uma User Story sem acesso preserva o destino durante cadastro, confirmação e login. Após autenticar, a conta envia um pedido pendente e não recebe o conteúdo até um Owner decidir.
- Owners escolhem explicitamente projeto ou workspace e papel `VIEWER` ou `EDITOR`. Todos os Owners recebem aviso no ATHENA e por e-mail; a primeira decisão encerra o pedido. A pessoa solicitante recebe o resultado no ATHENA e por e-mail. Uma recusa permite enviar novo pedido.
- O link de origem usa a origem pública configurada para o app; produção não pode emitir links `localhost`. Login OAuth do GitHub não faz parte do fluxo.

## Pastas

- Cada US pertence a uma única pasta do workspace.
- A pasta `Sem pasta` existe sempre.
- Cada US nova pertence a uma pasta; `Sem pasta` é a pasta padrão. Não há migração automática de tags ou de dados do RequisitoGraph nesta baseline.
- `OWNER` e `EDITOR` podem editar nome/descrição de pastas. Nomes são obrigatórios e únicos no workspace; `Sem pasta` é reservada e não pode ser renomeada ou excluída.
- Excluir uma pasta move suas US para `Sem pasta`.

## Navegação

- A tela inicial mostra pastas e US em cards.
- Selecionar uma US abre seu grafo de dependências e dependentes.
- A busca considera código e título.

## Colaboração

- Comentários são ancorados por seleção de texto e possuem thread, resposta, resolução e menções.
- Templates são administrados nas configurações do workspace, acessíveis pela engrenagem ao lado de Athena.
- Relações com outras US são navegáveis no painel lateral do editor; abrir uma relacionada mantém o editor e atualiza o histórico do navegador. Alterações não salvas exigem confirmação antes da troca.
- Relações entre US oferecem pré-requisito, dependente, associação e bloqueio. Ao alterar o sentido, a origem e o destino podem inverter, mantendo o mesmo par de US. Registros antigos de conflito são apresentados como bloqueios, preservando a direção já armazenada.
- Referências externas (protótipos e anexos) são exibidas separadamente das relações entre US. Referências manuais já existentes são preservadas e podem ser consultadas/removidas; a criação de novas referências pela interface ainda não faz parte do produto.

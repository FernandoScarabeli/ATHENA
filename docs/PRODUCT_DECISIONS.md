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

- Existem somente três papéis: `OWNER`, `EDITOR` e `VIEWER`.
- `OWNER` administra membros, workspace e projetos, além de editar e comentar.
- `EDITOR` edita requisitos, pastas, templates, relações e comentários, mas não administra membros ou projetos.
- `VIEWER` lê e comenta, mas não edita.
- `COMMENTER` é uma nomenclatura obsoleta e não representa um papel atual.

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
- Referências manuais já existentes são preservadas e podem ser consultadas/removidas. A nova criação pela UI será feita somente pela aprovação de sugestão da IA.

## IA

- Após a ativação de uma US, a arquitetura poderá iniciar uma análise assíncrona.
- A IA sugere relações e referências, mas nunca grava automaticamente.
- Cada sugestão deve ser aprovada ou descartada pelo usuário.
- Nesta etapa o provider real permanece desativado.
- A arquitetura de análise, sugestões e aprovação está preparada, mas ainda é parcial e não está integrada ao fluxo de API com provider real.

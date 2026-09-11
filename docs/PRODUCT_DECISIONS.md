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
- Cancelamento: `ARCHIVED` com soft delete.
- US arquivada continua consultável em Canceladas, mas não participa da visão ativa e não pode possuir relações.

## Pastas

- Cada US pertence a uma única pasta do workspace.
- A pasta `Sem pasta` existe sempre.
- Tags antigas são migradas para pastas; a primeira tag de uma US vira sua pasta.
- Excluir uma pasta move suas US para `Sem pasta`.

## Navegação

- A tela inicial mostra pastas e US em cards.
- Selecionar uma US abre seu grafo de dependências e dependentes.
- A busca considera código e título.

## Colaboração

- Comentários são ancorados por seleção de texto e possuem thread, resposta, resolução e menções.
- Templates são administrados nas configurações do workspace, acessíveis pela engrenagem ao lado de Athena.
- Referências manuais não são criadas no editor; referências futuras serão sugestões da IA.

## IA

- Após a ativação de uma US, a arquitetura poderá iniciar uma análise assíncrona.
- A IA sugere relações e referências, mas nunca grava automaticamente.
- Cada sugestão deve ser aprovada ou descartada pelo usuário.
- Nesta etapa o provider real permanece desativado.

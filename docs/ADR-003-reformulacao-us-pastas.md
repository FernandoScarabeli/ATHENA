# ADR-003 — User Stories únicas e organização por pastas

## Status

Aceita.

## Contexto

O MVP antigo organizava User Stories por pastas e abria um grafo focado na US selecionada. O passe colaborativo posterior introduziu tipos, prioridade, campos separados de User Story e uma visão geral de mapa. Essa divisão tornou o fluxo mais complexo que o domínio desejado.

## Decisão

O ATHENA passa a tratar todos os requisitos como User Stories. A organização primária será uma pasta por US. A tela inicial será a visão de pastas; a seleção de uma US abrirá seu grafo de relações.

Status será automático: rascunho na criação, ativo no primeiro salvamento e arquivado no cancelamento. Arquivamento remove relações e preserva o documento para consulta.

## Consequências

- A migration converte tipos antigos e códigos para `US-*`.
- Tags legadas são materializadas como entidades de pasta.
- O campo `userStory` é incorporado ao Documento TipTap.
- Prioridade, tags livres e tipo deixam de ser campos editoriais.
- A IA terá somente sugestões confirmáveis.

## Compatibilidade

Relações, referências e versões são preservadas por ID. Snapshots históricos podem conter campos antigos, mas novas versões usam o contrato atual.

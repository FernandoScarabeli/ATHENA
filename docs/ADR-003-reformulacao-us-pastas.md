# ADR-003 — User Stories únicas e organização por pastas

## Status

Aceita.

## Contexto

O MVP antigo organizava User Stories por pastas e abria um grafo focado na US selecionada. O passe colaborativo posterior introduziu tipos, prioridade, campos separados de User Story e uma visão geral de mapa. Essa divisão tornou o fluxo mais complexo que o domínio desejado.

## Decisão

O ATHENA passa a tratar todos os requisitos como User Stories. A organização primária será uma pasta por US. A tela inicial será a visão de pastas; a seleção de uma US abrirá seu grafo de relações.

Status será automático: rascunho na criação, ativo no primeiro salvamento e arquivado no cancelamento. Arquivamento remove relações e preserva o documento para consulta em Canceladas, comportamento desejado ainda pendente de conclusão/validação.

## Consequências

- A baseline exige banco PostgreSQL novo e não executa migração automática de tipos, códigos, tags ou dados do RequisitoGraph. Conversão de dados legados exige projeto separado.
- O campo `userStory` é incorporado ao Documento TipTap.
- Prioridade, tags livres e tipo deixam de ser campos editoriais.
- A IA terá somente sugestões confirmáveis; o provider real e o fluxo de API ainda são arquitetura parcial nesta etapa.
- A autorização continua limitada a `OWNER`, `EDITOR` e `VIEWER`; `VIEWER` lê e comenta, mas não edita.

## Compatibilidade

Relações, referências e versões são preservadas por ID. Snapshots históricos podem conter campos antigos, mas novas versões usam o contrato atual.

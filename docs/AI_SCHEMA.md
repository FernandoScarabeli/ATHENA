# Contrato de IA

Providers devolvem JSON: `{ summary, items: [{ requirementId, severity, rationale, suggestedRelationType? }] }`. IDs precisam pertencer ao projeto e estar no conjunto contextual; `severity` é `LOW`, `MEDIUM` ou `HIGH`; `rationale` é obrigatório. Sugestões não criam relações sem confirmação humana.
# Arquitetura de sugestões de IA

## Estado atual

O provider real permanece desativado nesta etapa. O contrato existente de análise de impacto será expandido para suportar sugestões de relações e referências.

## Fluxo planejado

1. Uma US é salva pela primeira vez e passa para `ACTIVE`.
2. Um job assíncrono recebe o conteúdo da US e o contexto do projeto.
3. O provider retorna sugestões com tipo, confiança, justificativa e payload.
4. O usuário aprova ou descarta cada sugestão.
5. Somente sugestões aprovadas criam `RequirementRelation` ou `RequirementReference`.

## Regras

- A IA não altera documentos nem cria vínculos diretamente.
- Sugestões devem apontar para requisitos do mesmo projeto quando forem relações.
- URLs devem respeitar os protocolos permitidos pelo contrato REST.
- Falhas de provider ficam registradas como análise `FAILED` e não bloqueiam o salvamento da US.

# Contrato de IA

Na primeira ativação (`DRAFT → ACTIVE`) o backend cria uma `ImpactAnalysis` em `PENDING` e dispara o provider fora da transação editorial. O salvamento não espera o modelo. Há no máximo uma análise por US; retry reutiliza essa linha e não duplica sugestões. `AI_PROVIDER=disabled` é explícito e conclui o job como `FAILED` com a mensagem `Provider de IA desativado`.

`AI_PROVIDER=ollama` usa `OLLAMA_GENERATION_MODEL` para geração e `OLLAMA_EMBEDDING_MODEL` para embeddings, com limite `AI_TIMEOUT_MS`. Indisponibilidade, timeout ou JSON inválido ficam em `ImpactAnalysis.status=FAILED` e `error` legível. O contexto enviado contém apenas dados editoriais da US e identificadores/títulos de requisitos ativos do mesmo projeto; secrets de configuração nunca são enviados.

Providers devolvem JSON: `{ summary, items: [...], suggestions: [...] }`. `items` mantém o contrato de impacto legado. Cada sugestão tem `type`, `confidence` entre `0` e `1` e `justification`; sugestões de `RELATION` têm `targetRequirementId` e `relationType`, e sugestões de `REFERENCE` têm `referenceType` e `url`.

`url` aceita somente `http`, `https` ou `mailto`. IDs de alvo precisam pertencer ao mesmo projeto da US analisada, não podem apontar para a própria US e requisitos arquivados não são alvos válidos. O backend valida o JSON inteiro, o escopo e os protocolos antes de persistir; resposta inválida marca a análise como `FAILED` e não cria sugestões.

Sugestões persistidas têm `status` `PENDING`, `CONFIRMED` ou `DISMISSED`, além de `error` opcional. Confirmar uma sugestão é um comando explícito e separado; persistir ou descartar uma sugestão nunca altera a US canônica.
# Arquitetura de sugestões de IA

## Estado atual e limites

O provider real permanece desativado nesta etapa. O contrato existente de análise de impacto foi expandido para suportar sugestões de relações e referências; a persistência interna valida a resposta antes de gravar.

A análise respeita os três papéis do workspace (`OWNER`, `EDITOR` e `VIEWER`): somente usuários autorizados pelo backend podem solicitar análise ou aprovar/descartar sugestões; `VIEWER` não edita a US.

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
- Sugestões aprovadas são o único caminho de criação de novas relações e referências pela UI; referências manuais existentes são preservadas e removíveis.
- A listagem de sugestões é permitida a qualquer membro do workspace. Apenas `OWNER`/`EDITOR` podem aprovar ou descartar; a decisão usa transação serializável e pode ser repetida com segurança. Uma condição externa inválida mantém a sugestão `PENDING` com `error`, permitindo nova aprovação depois que o alvo for corrigido.
- A migration da análise única não apaga histórico: se encontrar duplicatas legadas, falha com mensagem explícita para reconciliação manual preservando a linha auditável escolhida.

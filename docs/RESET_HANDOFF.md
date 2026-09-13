# ATHENA — resumo para retomada após reset de limite

Atualizado em 12/09/2026. Este é o ponto de retomada oficial. Leia também `ATHENA_SPEC.md`, `BACKLOG.md`, `CONTINUITY.md`, `EXECUTION_LOG.md` e as specs em `tasks/`.

## Resultado entregue

As tarefas ATH-001 a ATH-011 e ATH-013 a ATH-019 foram implementadas e revisadas. O produto possui, entre outros, autorização por workspace, arquivamento de US, pastas/templates/relacionamentos/histórico, contratos compartilhados, sugestões de IA e a base de integrações GitHub e Google. Nada foi commitado: o worktree contém as alterações intencionalmente não versionadas e alterações locais anteriores do usuário, que não devem ser descartadas.

### Domínio e colaboração

- ATH-001–003: contrato/documentação reconciliados; RBAC e isolamento por workspace reforçados; último `OWNER` protegido em corrida; versões otimistas retornam conflito com revisão atual; arquivamento é idempotente e mantém histórico em modo somente leitura.
- ATH-004–009: navegação Pastas → US → Grafo com URL/histórico; CRUD de pastas e fallback `Sem pasta`; templates e critérios Dado/Quando/Então; painel de relações com proteção de pares simétricos; histórico/diff; criação manual pública de referências bloqueada (`409 MANUAL_REFERENCE_CREATION_DISABLED`).
- ATH-010–011: tipos estáveis em `@athena/shared`; E2E HTTP e suítes PostgreSQL opt-in com banco isolado.

### IA

- ATH-013–016: modelo `AiSuggestion`, validação de payloads/URLs/alvos, sugestões separadas do documento canônico e contratos compartilhados.
- A primeira transição `DRAFT → ACTIVE` agenda análise assíncrona. `AI_PROVIDER=disabled` é explícito; Ollama tem modelos de geração/embedding separados e timeout.
- Retry e persistência evitam sugestões duplicadas; aprovação/recusa é transacional, RBAC protege decisões e a interface mostra loading/erro/retry. `VIEWER` somente lê.
- Limite conhecido: a UI de sugestões ainda não apresenta o estado global de `ImpactAnalysis` (`FAILED`), somente erro por sugestão/consulta.

### Integrações

- ATH-017: `IntegrationConnection`, `IntegrationSource` e `IntegrationCandidate`, AES-256-GCM, conexões únicas por workspace/provider, metadados seguros e desconexão que zera credenciais mas preserva histórico.
- `INTEGRATION_ENCRYPTION_KEY` agora é obrigatória: base64 de exatamente 32 bytes. Sem ela, a API deve falhar ao iniciar. A chave deve vir de secret manager; rotação requer recifrar registros em operação controlada. Consulte `INTEGRATIONS.md`.
- ATH-018: GitHub PAT com cliente HTTP mockável, conta, repositórios paginados, leitura explícita de arquivos, rate limit/autenticação/arquivo removido e upsert por identidade externa. Não cria US.
- ATH-019: Google OAuth state hasheado, TTL de 10 min e uso único; token/refresh token cifrados; Drive/Docs paginados e candidatos estáveis. Conta real de GitHub/Google continua pendente de credenciais de teste.

## Estado posterior à retomada

ATH-020 e ATH-021 foram concluídas após esta passagem. ATH-020 entregou sincronização de candidatos por fingerprint/versão, auditoria de revisão/remoção, decisões otimistas e painel UI. ATH-021 entregou observabilidade segura, matriz operacional e quality gates; os testes simulados e PostgreSQL isolado passaram. Mantêm-se pendentes apenas validação real com contas descartáveis GitHub/Google e ATH-012 (navegador/operação controlada).

## Registro histórico: ATH-020 parcial na pausa anterior

ATH-020 foi interrompida propositalmente para esta passagem. Há código parcial em `backend/api/src/integrations/integrations.service.ts` e migration `20260912200000_integration_candidate_revisions`:

- adiciona fingerprint/versão externa, revisões de candidato e trilha de mudança;
- `syncCandidate` sanitiza texto, faz upsert de fonte/candidato e não toca US canônica;
- há rascunho de listar, aprovar e rejeitar candidatos com revisão otimista;
- GitHub e Google já começaram a consumir `syncCandidate`.

Antes de aceitar ATH-020, revisar e completar:

1. Executar lint/build e testes; confirmar compatibilidade do schema/migration nova.
2. Criar testes unitários e PostgreSQL opt-in para criação, reimportação idempotente, mudança, rejeição, aprovação para nova US, atualização com conflito de revisão e isolamento de workspace.
3. Finalizar API/DTOs e a UI de revisão de candidatos (a interface ainda não foi entregue).
4. Implementar marcação de fonte removida/renomeada preservando auditoria; hoje o fluxo parcial cobre upsert/alteração, não uma varredura completa de remoção.
5. Validar TipTap/conteúdo importado e o enum `source` de Requirement; não deixar o rascunho converter conteúdo externo em documento canônico sem validação adequada.
6. Não marcar ATH-020 concluída até cumprir a spec inteira.

## O que testar agora

Defina somente durante o processo de teste uma chave efêmera válida (não salve segredo real):

```bash
env INTEGRATION_ENCRYPTION_KEY='BwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwc=' corepack pnpm test
env INTEGRATION_ENCRYPTION_KEY='BwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwc=' corepack pnpm lint
env INTEGRATION_ENCRYPTION_KEY='BwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwc=' corepack pnpm build
git diff --check
```

Para PostgreSQL, usar apenas o banco temporário `athena_test` em `127.0.0.1:32768`, nunca a stack/volume `prototipos` do usuário:

```bash
env DATABASE_URL='postgresql://athena_test:athena_test_local_only@127.0.0.1:32768/athena_test?schema=public' corepack pnpm --filter @athena/api exec prisma migrate deploy --schema prisma/schema.prisma
env TEST_DATABASE_URL='postgresql://athena_test:athena_test_local_only@127.0.0.1:32768/athena_test?schema=public' INTEGRATION_ENCRYPTION_KEY='BwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwc=' corepack pnpm --filter @athena/api test -- --runInBand
```

Também testar manualmente, em ambiente seguro:

- API falha sem `INTEGRATION_ENCRYPTION_KEY` e inicia com chave válida.
- `VIEWER` lista metadados/sugestões/candidatos permitidos, mas não conecta, importa, aprova ou descarta.
- Nenhuma resposta, log, erro ou snapshot inclui PAT, token OAuth ou refresh token.
- Desconectar torna a credencial inacessível e preserva fontes/candidatos.
- GitHub/Google reais apenas com contas de teste: marcar evidência como pendente enquanto não houver credenciais.
- ATH-012 permanece pendente: navegador indisponível impediu screenshots desktop/mobile, teclado/foco, contraste e console; subida limpa e backup/restore também aguardam ambiente controlado.

## Próxima fila

1. ATH-012 — terminar revisão visual/acessibilidade/operação quando houver navegador e ambiente seguro.
2. Executar o checklist de `INTEGRATION_VALIDATION.md` com contas descartáveis GitHub/Google; não registrar tokens.
3. Backlog futuro (`FUT-01` a `FUT-07`).

## Riscos e regras de segurança

- Não executar `sudo`, reset, checkout, limpeza recursiva ou migração contra banco do usuário.
- Migrations de índice único de pastas/relações/análise exigem investigar duplicatas em ambientes já povoados. A migration de análise falha explicitamente em vez de apagar histórico.
- Preservar alterações locais pré-existentes do frontend, especialmente `FolderOverview.tsx`, `NewRequirementModal.tsx`, `ProjectWorkspace.tsx`, `documentEditor.css` e `TemplateEditor`.
- A stack Docker existente é do usuário. Leitura de health/ready foi feita; não alterar volumes/dados.

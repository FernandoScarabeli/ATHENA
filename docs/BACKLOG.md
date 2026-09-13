# ATHENA — quadro de execução

Fonte de escopo: [ATHENA_SPEC.md](ATHENA_SPEC.md). Cada ID aponta para uma spec pequena em `tasks/`. Prioridade menor vem primeiro; dentro de uma prioridade, respeitar a ordem e dependências. Estados: `A fazer`, `Em andamento`, `Em revisão`, `Concluída`, `Bloqueada`.

| Ordem | ID | Tarefa | Estado | Dependências |
| --- | --- | --- | --- | --- |
| P0.1 | [ATH-001](tasks/ATH-001.md) | Consolidar contrato e documentação | Concluída | — |
| P0.2 | [ATH-002](tasks/ATH-002.md) | Autorização, isolamento e validação | Concluída | ATH-001 |
| P0.3 | [ATH-003](tasks/ATH-003.md) | Arquivamento, atividade e Canceladas | Concluída | ATH-002 |
| P1.1 | [ATH-004](tasks/ATH-004.md) | Pastas → US → Grafo e navegação | Concluída | ATH-003 |
| P1.2 | [ATH-005](tasks/ATH-005.md) | Gestão completa de pastas | Concluída | ATH-004 |
| P1.3 | [ATH-006](tasks/ATH-006.md) | Templates e critérios de aceite | Concluída | ATH-004 |
| P1.4 | [ATH-007](tasks/ATH-007.md) | Relações na interface | Concluída | ATH-004 |
| P1.5 | [ATH-008](tasks/ATH-008.md) | Histórico e comparação | Concluída | ATH-003 |
| P1.6 | [ATH-009](tasks/ATH-009.md) | Política de referências | Concluída | ATH-001 |
| P2.1 | [ATH-010](tasks/ATH-010.md) | Contratos compartilhados | Concluída | ATH-009 |
| P2.2 | [ATH-011](tasks/ATH-011.md) | Testes PostgreSQL e E2E | Concluída | ATH-003–010 |
| P2.3 | [ATH-012](tasks/ATH-012.md) | Revisão visual e operação | Em andamento (auditoria parcial) | ATH-011 |
| P3.1 | [ATH-013](tasks/ATH-013.md) | Modelo de sugestões de IA | Concluída | ATH-010 |
| P3.2 | [ATH-014](tasks/ATH-014.md) | Execução assíncrona da análise | Concluída | ATH-013 |
| P3.3 | [ATH-015](tasks/ATH-015.md) | Aprovação de sugestões na API | Concluída | ATH-014 |
| P3.4 | [ATH-016](tasks/ATH-016.md) | Revisão de sugestões na interface | Concluída | ATH-015 |
| P4.1 | [ATH-017](tasks/ATH-017.md) | Base segura de integrações | Concluída | ATH-010 |
| P4.2 | [ATH-018](tasks/ATH-018.md) | GitHub PAT | Concluída | ATH-017 |
| P4.3 | [ATH-019](tasks/ATH-019.md) | Google OAuth/Drive/Docs | Concluída | ATH-017 |
| P4.4 | [ATH-020](tasks/ATH-020.md) | Candidatos e sincronização | Concluída | ATH-018, ATH-019 |
| P4.5 | [ATH-021](tasks/ATH-021.md) | Testes de integração e operação | Concluída | ATH-020 |

## Backlog futuro, fora desta rodada

| ID | Capacidade | Prioridade relativa | Dependência principal |
| --- | --- | --- | --- |
| FUT-01 | Convites por e-mail e ciclo de acesso | Alta | Segurança e membros estabilizados |
| FUT-02 | Upload de anexos binários | Alta | Política de armazenamento, malware e quotas |
| FUT-03 | Edição simultânea de documentos | Média | Modelo de conflitos e presença em tempo real |
| FUT-04 | Notificações por e-mail/push | Média | Preferências e infraestrutura de envio |
| FUT-05 | Permissões por projeto | Média | Migração da autorização por workspace |
| FUT-06 | Analytics avançado | Baixa | Eventos confiáveis e privacidade |
| FUT-07 | Templates globais | Baixa | Governança entre workspaces |

## Estado inicial verificado

`corepack pnpm test`, `build` e `lint` passaram em 12/09/2026. Há alterações locais não versionadas em `FolderOverview.tsx`, `NewRequirementModal.tsx`, `ProjectWorkspace.tsx`, `documentEditor.css` e novos `TemplateEditor.tsx`/teste. São trabalho parcial do usuário e não devem ser descartadas.

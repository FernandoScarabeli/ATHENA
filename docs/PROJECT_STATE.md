# ATHENA — estado do projeto

## Entregue

- Monorepo PNPM organizado em `frontend/` (React), `backend/api/` (NestJS), `ai/` (providers e operações de IA), `packages/shared/` (contratos) e `docs/`.
- Núcleo persistente: autenticação por cookies, workspaces, projetos, requisitos, critérios, revisões, relações e grafo.
- Editor de requisito com TipTap Community: documento JSON persistido, toolbar de formatação estilo Docs, salvamento explícito, revisão otimista, recuperação de conflito e proteção contra saída com alterações não salvas.
- Colaboração de workspace: papéis `OWNER`, `EDITOR` e `VIEWER`; gestão de membros pelo Owner; templates do workspace; referências de protótipo/anexo; comentários em thread, menções e notificações internas.
- User Story estruturada e critérios de aceite enriquecidos para representar cenários `Dado / Quando / Então`, além de tabelas de especificação no documento.
- Contrato de IA e integrações preparados; nenhuma fonte de demonstração da Defesa Agropecuária foi migrada.
- Reformulação em andamento: requisitos são User Stories únicas, organizadas por pastas, com status automático e editor baseado somente no Documento.

## Limites deliberados do passe colaborativo

- Um requisito é editado por uma pessoa por vez. O controle de revisão impede sobrescrita, mas não há colaboração de texto em tempo real.
- Convites por e-mail, anexos binários, notificações por e-mail/push, upload, permissões por projeto e templates globais ficam fora deste passe.
- Um template é exclusivo do workspace, é aplicado como cópia independente e não carrega código, status, prioridade, comentários ou histórico do requisito de origem.

## Próximos marcos

- M3: executar providers de IA configurados e migration pgvector em ambiente PostgreSQL.
- M4/M5: fluxos OAuth Google, PAT GitHub e jobs de importação/sincronização.
- Próximo passe: concluir configurações de pastas/templates, sugestões confirmáveis de IA e validação visual do fluxo Pastas → US → Grafo.

## Verificação

Execute `corepack pnpm install`, copie `.env.example` para `.env`, aplique o schema com `prisma migrate deploy` e use `docker compose up --build`. Esta linha requer um banco novo. Consulte `REST_API.md`, `DOMAIN_MODEL.md` e `ADR-002-editor-colaborativo.md` antes de alterar os contratos; a entrega deve passar pelo `COLLABORATION_TEST_CHECKLIST.md`.

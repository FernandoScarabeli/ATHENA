# ATHENA — estado do projeto

## Entregue

- Monorepo PNPM organizado em `frontend/` (React), `backend/api/` (NestJS), `ai/` (providers e operações de IA), `packages/shared/` (contratos) e `docs/`.
- Núcleo persistente: autenticação por cookies, confirmação de e-mail, recuperação de senha, sessões rotativas por dispositivo, convites Resend, workspaces, projetos, requisitos, critérios, revisões, relações e grafo.
- Editor de requisito com TipTap Community: documento JSON persistido, toolbar de formatação estilo Docs, salvamento explícito, revisão otimista, recuperação de conflito e proteção contra saída com alterações não salvas.
- Colaboração de workspace: papéis `OWNER`, `EDITOR` e `VIEWER`; gestão de membros pelo Owner; templates do workspace; referências de protótipo/anexo existentes; comentários em thread, menções e notificações internas. `VIEWER` lê e comenta, mas não edita.
- User Story estruturada e critérios de aceite enriquecidos para representar cenários `Dado / Quando / Então`, além de tabelas de especificação no documento.
- Google Drive possui vínculo de raiz por projeto, árvore de subpastas, sincronização automática a cada 10 minutos e botão manual; alterações de arquivos suportados são espelhadas nos dois sentidos por outbox persistente. A análise global aplica dependências ao grafo automaticamente, preservando bloqueios de relações removidas manualmente.
- Reformulação em andamento: requisitos são User Stories únicas, organizadas por pastas, com status automático e editor baseado somente no Documento. US canceladas ficam disponíveis em Canceladas para consulta somente leitura, sem relações ou novas interações de comentário.

## Limites deliberados do passe colaborativo

- Um requisito é editado por uma pessoa por vez. O controle de revisão impede sobrescrita, mas não há colaboração de texto em tempo real.
- Anexos binários, notificações por e-mail/push além das mensagens transacionais de acesso, upload, permissões por projeto e templates globais ficam fora deste passe.
- Um template é exclusivo do workspace, é aplicado como cópia independente e não carrega código, status, prioridade, comentários ou histórico do requisito de origem.

## Próximos marcos

- M3: executar providers de IA configurados e validar pgvector em ambiente PostgreSQL novo; migração automática do RequisitoGraph não faz parte desta baseline.
- M4/M5: fluxos OAuth Google, PAT GitHub e jobs de importação/sincronização.
- Configurações de pastas concluídas neste passe: OWNER/EDITOR podem editar nome/descrição e excluir com realocação transacional para `Sem pasta`; nomes são validados como obrigatórios e únicos, e VIEWER permanece somente leitura.
- Próximo passe: concluir configurações de templates, sugestões confirmáveis de IA e validação visual do fluxo Pastas → US → Grafo.

## Verificação

Execute `corepack pnpm install`, copie `.env.example` para `.env`, aplique o schema com `prisma migrate deploy` e use `docker compose up --build`. Esta linha requer um banco novo. Consulte `REST_API.md`, `DOMAIN_MODEL.md` e `ADR-002-editor-colaborativo.md` antes de alterar os contratos; a entrega deve passar pelo `COLLABORATION_TEST_CHECKLIST.md`.

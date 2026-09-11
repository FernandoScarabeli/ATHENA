# ATHENA

Requirements Hub é uma aplicação para rastrear requisitos, suas versões e relações, com análise de impacto assistida por IA.

O editor usa TipTap Community e salva documentos como JSON no ATHENA; não depende de API paga para escrita ou formatação. Workspaces podem ter Owners, Editors e Viewers. Consulte [o contrato REST](docs/REST_API.md), [o modelo de domínio](docs/DOMAIN_MODEL.md) e [a decisão do editor colaborativo](docs/ADR-002-editor-colaborativo.md).

## Estrutura

- `frontend/`: React/Vite — somente interface e cliente REST.
- `backend/api/`: NestJS, Prisma, autenticação, RBAC e regras de domínio.
- `ai/`: prompts e recursos operacionais dos providers.
- `packages/shared/`: contratos REST e enums que podem ser consumidos pelas duas aplicações.
- `docs/`: decisões, modelo, API e contratos.
- `infra/`: Nginx e topologia local.

O diretório `RequisitoGraph/` é o protótipo legado. Não é dependência do ATHENA e seus mocks/dados não são importados.

## Executar

### Docker (recomendado)

Suba tudo com `docker compose up --build`. Na primeira inicialização, a API aplica as migrations. Abra `http://localhost:8080`; a documentação fica em `http://localhost:8080/api/docs`.

Para encerrar, use `docker compose down`. Os dados permanecem no volume `postgres_data`. Para também removê-los: `docker compose down -v`.

### Desenvolvimento local

1. Copie `.env.example` para `.env` e substitua os segredos JWT.
2. Instale: `corepack pnpm install`.
3. Inicie banco: `docker compose up -d postgres`.
4. Aplique o schema local: `corepack pnpm --filter @athena/api exec prisma migrate deploy --schema prisma/schema.prisma`.
5. Rode: `corepack pnpm dev`.

A API fica em `http://localhost:3000/api`, documentação OpenAPI em `/api/docs`, e health checks em `/api/health` e `/api/ready`. Com Compose, entre por `http://localhost:8080`.

Para desenvolvimento com hot reload, mantenha apenas o banco no Docker (`docker compose up -d postgres`) e rode `corepack pnpm dev` no host. O Vite e o Nest reiniciam ao salvar, sem derrubar containers.

### Desenvolvimento Docker com hot reload

Para manter também API e frontend dentro do Docker, execute `corepack pnpm dev:docker` (equivalente a `docker compose -f docker-compose.yml -f docker-compose.dev.yml up --build`). Abra `http://localhost:8080` normalmente. O primeiro comando constrói as imagens e cria volumes de dependências; o serviço web sincroniza o lockfile ao iniciar para que novas dependências apareçam mesmo com o volume persistente.

Os diretórios `frontend/`, `backend/api/` e `packages/shared/` são montados no container. Salvar uma alteração no React atualiza a página pelo Vite/HMR; salvar uma alteração no Nest reinicia apenas a API em watch. Para parar sem apagar PostgreSQL ou dependências, use `corepack pnpm dev:docker:down` (não use `-v`).

Esta versão exige banco novo. Antes de atualizar, recrie volumes/bancos anteriores (`docker compose down -v` em ambiente local). O runtime usa `prisma migrate deploy` e falha explicitamente se não puder aplicar a migration-base; não há bridge automático para schema legado.

## Demonstração pública: Netlify + PC + Tailscale Funnel

Este modo deixa o frontend no Netlify e expõe somente a API do PC por uma origem HTTPS do Tailscale Funnel. A API é ligada em `127.0.0.1:3000`, para o Funnel local consumi-la; PostgreSQL não publica porta e não fica acessível pelo Funnel.

1. Instale e autentique o Tailscale neste PC. Funnel exige MagicDNS, HTTPS e permissão de Funnel no tailnet.
2. Crie um site no Netlify apontando para este repositório. `netlify.toml` constrói `frontend/dist`, inclui fallback de SPA e encaminha `/api/*` por uma Edge Function.
3. Copie `.env.demo.example` para `.env.demo`. Preencha `NETLIFY_SITE_ORIGIN` com a origem HTTPS do seu site Netlify e substitua os dois secrets JWT por valores longos e únicos.
4. Rode `corepack pnpm demo:on`. Ele inicia apenas `postgres` e `api`, verifica a healthcheck em loopback e cria/atualiza o Funnel para essa mesma API.
5. Copie a origem HTTPS mostrada por `tailscale funnel status` e cadastre-a no Netlify como variável de ambiente de runtime `TAILSCALE_FUNNEL_ORIGIN`. Use somente a origem, por exemplo `https://nome-da-maquina.seu-tailnet.ts.net`, sem `/api`. Faça novo deploy depois de alterar essa variável.

Use `corepack pnpm demo:status` para consultar Docker e Funnel. Para encerrar, rode `corepack pnpm demo:off`: ele desativa somente a porta HTTPS escolhida para o ATHENA e para `api` e `postgres`, sem `down -v`, sem remover volumes e sem resetar outros Funnels.

No modo demo, `COOKIE_SECURE=true` e o navegador conversa apenas com a origem Netlify: `/api` é proxy da Edge Function, portanto os cookies HttpOnly permanecem same-origin. `WEB_ORIGIN` da API vem de `NETLIFY_SITE_ORIGIN`; mantenha-o exatamente igual à URL pública do Netlify. O Funnel torna a API pública: use secrets reais, contas de teste e desligue-o ao final. A demonstração ficará indisponível se este PC, Docker, Tailscale ou a conexão do PC ficarem offline. Funnel também está sujeito aos requisitos e limites do Tailscale.

## Backup

`scripts/backup.sh arquivo.sql` gera um dump; `scripts/restore.sh arquivo.sql` restaura o dump no serviço Postgres do Compose.

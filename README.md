# ATHENA

ATHENA é um hub de requisitos para organizar User Stories, versões, critérios de aceite, relações e documentação técnica de produto. O editor usa TipTap Community e grava o documento como JSON: não há dependência de API paga para escrever ou formatar.

O projeto mantém o design system útil do protótipo legado, mas não importa seus dados, mocks ou domínio. Consulte também o [contrato REST](docs/REST_API.md), o [modelo de domínio](docs/DOMAIN_MODEL.md) e as [decisões arquiteturais](docs/ADR-001-monorepo.md).

## Arquitetura

```text
Navegador
    │
    ├── desenvolvimento host: Vite (5173) ──► Nest API (3000)
    │
    └── Docker: Nginx (8080) ──► Web estático / Vite em dev
                                  └── Nest API ──► PostgreSQL + pgvector
                                                        └── volume postgres_data

Netlify (modo demo) ──► Edge Function /api ──► Tailscale Funnel ──► API local
```

| Diretório | Responsabilidade |
| --- | --- |
| `frontend/` | React, Vite e cliente REST. |
| `backend/api/` | NestJS, Prisma, autenticação, autorização e domínio. |
| `packages/shared/` | Tipos e contratos compartilhados, sem regras de negócio. |
| `ai/` | Recursos operacionais e contrato dos providers de IA. |
| `infra/` | Configuração Nginx. |
| `scripts/` | Backup, restore e operações da demonstração. |
| `docs/` | Modelo, API, decisões e estado do projeto. |

## Pré-requisitos

- Node.js `>=20.19` e Corepack; o repositório usa PNPM `9.15.4`.
- Docker Engine com Docker Compose para os modos Docker, banco, backup e demo.
- Para a demonstração pública: Tailscale instalado, autenticado e autorizado a usar Funnel, além de uma conta/site no Netlify.

Instale as dependências uma vez:

```bash
corepack pnpm install
```

## Configuração

Crie a configuração local a partir do exemplo:

```bash
cp .env.example .env
```

Preencha ao menos os dois segredos JWT com valores diferentes, longos e aleatórios. Os campos relevantes são:

| Variável | Uso |
| --- | --- |
| `DATABASE_URL` | Conexão PostgreSQL usada pelo Prisma. O valor de exemplo usa o hostname `postgres`, válido dentro da rede Docker. |
| `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET` | Segredos dos cookies de sessão; nunca use os valores de exemplo fora do desenvolvimento. |
| `WEB_ORIGIN` | Origem permitida para o frontend. |
| `COOKIE_SECURE` | `false` para HTTP local; `true` quando a aplicação é exposta por HTTPS. |
| `AI_PROVIDER`, `OLLAMA_BASE_URL`, `OLLAMA_MODEL` | Configuração opcional do provider de IA/Ollama. |
| `INTEGRATION_ENCRYPTION_KEY` | Chave prevista para credenciais de integrações. |

O `docker-compose.yml` define a conexão interna do banco e a origem do frontend para seus próprios serviços. Alterar somente `DATABASE_URL` no `.env` não muda essa conexão do Compose.

## Execução local

### Processos no host

Use este modo quando `DATABASE_URL` apontar para um PostgreSQL acessível pelo seu host. O hostname `postgres` de `.env.example` é resolvido pelos containers, não pelo sistema operacional.

1. Ajuste `DATABASE_URL`, `WEB_ORIGIN=http://localhost:5173` e os segredos no `.env`.
2. Aplique as migrations no banco configurado:

   ```bash
   corepack pnpm --filter @athena/api exec prisma migrate deploy --schema prisma/schema.prisma
   ```

3. Inicie API e frontend em watch:

   ```bash
   corepack pnpm dev
   ```

O frontend fica em `http://localhost:5173`, a API em `http://localhost:3000/api`, a documentação OpenAPI em `http://localhost:3000/api/docs`, e as verificações em `/api/health` e `/api/ready`.

### Docker: execução padrão

Para subir Nginx, web, API e PostgreSQL:

```bash
docker compose up --build
```

Abra `http://localhost:8080`; a documentação está em `http://localhost:8080/api/docs`. A API executa `prisma migrate deploy` antes de iniciar. A migration-base atual é destinada a banco novo; não há bridge automática para schemas legados.

Para parar preservando os dados:

```bash
docker compose down
```

`docker compose down -v` também remove o volume `postgres_data`; use-o somente se você aceitar apagar o banco local.

> O Compose padrão é uma topologia de implantação local. Antes de uma exposição real, substitua os defaults de JWT e configure HTTPS/`COOKIE_SECURE` adequadamente; o arquivo atual usa `COOKIE_SECURE=false` para acesso local em HTTP.

### Docker com hot reload

Este é o modo mais simples para desenvolver sem configurar um banco externo no host:

```bash
corepack pnpm dev:docker
```

Ele combina `docker-compose.yml` e `docker-compose.dev.yml`, monta `frontend/`, `backend/api/` e `packages/shared/`, mantém dependências em volumes Docker e expõe tudo por `http://localhost:8080`. O Vite atualiza o frontend por HMR e o Nest reinicia a API em watch ao salvar arquivos.

Para parar sem remover banco ou volumes de dependências:

```bash
corepack pnpm dev:docker:down
```

## Demonstração: Netlify + Tailscale Funnel

Este modo publica o frontend pelo Netlify e expõe apenas a API do PC através do Funnel. No PC, a API é vinculada a `127.0.0.1`; PostgreSQL não publica porta.

1. Crie o site no Netlify apontando para este repositório. O `netlify.toml` constrói `frontend/dist`, aplica fallback de SPA e entrega `/api/*` à Edge Function.
2. Prepare o arquivo de demo:

   ```bash
   cp .env.demo.example .env.demo
   ```

   Defina `NETLIFY_SITE_ORIGIN` com a origem HTTPS do site Netlify e use segredos JWT exclusivos. `FUNNEL_API_PORT` e `FUNNEL_HTTPS_PORT` são opcionais e têm defaults `3000` e `443`.

3. Ative a API e o Funnel:

   ```bash
   corepack pnpm demo:on
   ```

4. Copie a origem HTTPS mostrada por `tailscale funnel status` e configure-a no Netlify como variável de ambiente de runtime `TAILSCALE_FUNNEL_ORIGIN`. Ela deve ser uma origem HTTPS sem caminho, por exemplo `https://maquina.tailnet.ts.net`. Faça um novo deploy no Netlify após alterar a variável.

Comandos operacionais:

```bash
corepack pnpm demo:status
corepack pnpm demo:off
```

`demo:off` desativa somente a porta HTTPS configurada para o ATHENA e para os containers `api` e `postgres`; volumes e outros Funnels não são removidos. A demonstração depende de PC, Docker, Tailscale e conexão ativos. Como o Funnel torna a API pública, use contas de teste e desligue-o após a apresentação.

## Branches Git

| Branch | Finalidade |
| --- | --- |
| `main` | Linha principal do ATHENA. |
| `dev` | Integração do desenvolvimento em andamento. |
| `legacy-requisitograph` | Histórico do protótipo RequisitoGraph; não é dependência do ATHENA e não deve fornecer dados, mocks ou fixtures para `main`/`dev`. |

Troque de branch com `git switch main`, `git switch dev` ou `git switch legacy-requisitograph`.

## Backup e restore

Com o serviço `postgres` em execução no Compose:

```bash
scripts/backup.sh athena-backup.sql
scripts/restore.sh athena-backup.sql
```

O restore grava o SQL no banco `athena` existente. Faça um backup antes de restaurar um arquivo que não tenha sido validado.

## Qualidade

Execute no diretório raiz:

```bash
corepack pnpm build
corepack pnpm test
corepack pnpm lint
```

Os scripts executam os pacotes do workspace recursivamente. A API usa Jest; o frontend e contratos usam Vitest/TypeScript conforme cada pacote.

## Troubleshooting

### API não fica saudável ou Prisma falha

- Consulte o estado e os logs: `docker compose ps` e `docker compose logs api`.
- Confirme que o PostgreSQL ficou saudável antes da API. O Compose usa `depends_on` com healthcheck para isso.
- Em execução no host, confirme que `DATABASE_URL` não aponta para o hostname Docker `postgres`; use Docker hot reload ou um PostgreSQL que o host consiga alcançar.
- A inicialização usa `prisma migrate deploy`. Para um banco local descartável incompatível com a migration-base, pare o Compose e recrie o volume com `docker compose down -v`; esse comando apaga os dados locais.

### Demo/Funnel não abre ou retorna erro do proxy

- Execute `corepack pnpm demo:status` para ver os containers da demo e o estado do Funnel.
- Verifique se `.env.demo` existe, se `NETLIFY_SITE_ORIGIN` começa com `https://` e se os segredos JWT não usam defaults locais.
- Se o Netlify responder `DEMO_PROXY_NOT_CONFIGURED`, configure `TAILSCALE_FUNNEL_ORIGIN` como origem HTTPS sem caminho e faça novo deploy.
- Se responder `DEMO_API_UNAVAILABLE`, confirme que o PC, Docker e Tailscale continuam online e verifique o healthcheck da API no modo demo.
- Funnel requer MagicDNS, HTTPS e a permissão correspondente no tailnet; `tailscale funnel status` mostra a URL e o estado atual.

## Segurança e limites atuais

- Tokens de acesso e refresh são enviados por cookies HttpOnly; mantenha secrets e arquivos `.env*` fora do Git.
- Nginx é a única porta pública do Compose padrão. No modo demo, somente a API é exposta pelo Funnel em loopback; o PostgreSQL permanece sem porta publicada.
- A colaboração usa revisão otimista, não edição simultânea em tempo real. Arquivamento preserva histórico; não há hard delete de requisito.
- GitHub/Google, upload de anexos, convites por e-mail, sincronização bidirecional, webhooks, i18n e analytics avançado permanecem fora do MVP.

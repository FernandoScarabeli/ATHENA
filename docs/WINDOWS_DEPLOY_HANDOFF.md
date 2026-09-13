# Handoff de deploy Windows: Netlify + Tailscale Funnel

Este guia instala uma instância **nova** do ATHENA no PC Windows de deploy. Não
importe volumes, dumps ou dados do ambiente de desenvolvimento. O banco começa
vazio; os backups gerados neste PC ficam em disco local e são copiados
manualmente para outro local confiável.

## Topologia e limites

```text
Navegador
  │ HTTPS
  ▼
Netlify (frontend estático)
  │ /api/*: Edge Function
  ▼
https://<hostname-tailnet>.ts.net  (Tailscale Funnel)
  ▼
127.0.0.1:3000 no PC Windows ──► API ──► PostgreSQL privado
                                      └──► Ollama privado (RTX 3060)
```

O valor público estável é o hostname MagicDNS do PC (`<hostname-tailnet>.ts.net`).
O Funnel publica somente a API que está ligada ao loopback. PostgreSQL não tem
porta publicada e nunca deve receber uma regra de port mapping. Ollama também
permanece apenas na rede interna do Compose.

## Pré-requisitos no PC de deploy

1. Atualize o Windows e instale o WSL2 com Ubuntu. Trabalhe no clone dentro do
   filesystem Linux do WSL, não em `C:\\` ou numa pasta sincronizada.
2. Instale Docker Desktop, use o backend WSL2 e habilite a integração com a
   distribuição Ubuntu. Confirme no WSL: `docker version` e `docker compose version`.
3. Instale o driver NVIDIA que suporte CUDA no WSL e reinicie. Com Docker
   Desktop aberto, `nvidia-smi` no WSL deve mostrar a RTX 3060 12 GB.
4. Instale e autentique o Tailscale no Windows/WSL. No painel do tailnet,
   habilite MagicDNS e autorize Funnel para este dispositivo/conta. Confirme
   `tailscale status` e `tailscale funnel status` no WSL.
5. Tenha acesso administrativo ao Google Cloud e ao site Netlify. Crie uma
   conta ATHENA de teste para a validação; não use dados de produção.

Se `nvidia-smi` não funcionar no WSL, pare aqui: subir Ollama antes disso fará
fallback para CPU e mascarará o problema de driver/WSL.

## Obter o código e fixar a versão

No Ubuntu/WSL, em uma pasta de trabalho Linux:

```bash
git clone <URL_DO_REPOSITORIO> athena
cd athena
git fetch --all --tags
git switch <BRANCH_DE_DEPLOY>
git pull --ff-only
```

Registre o commit instalado com `git rev-parse HEAD`. A branch deve ser a
definida para o deploy (normalmente `main`); não faça deploy de alterações
locais não revisadas.

## Arquivos locais de configuração

O `.env.demo` já é ignorado pelo Git. Copie o exemplo e preencha valores
exclusivos deste servidor:

```bash
cp .env.demo.example .env.demo
chmod 600 .env.demo
openssl rand -base64 48 # gere um valor para cada JWT
openssl rand -base64 32 # gera a chave base64 de 32 bytes da integração
```

Edite `.env.demo` sem aspas, espaços supérfluos ou quebra de linha nos valores:

```dotenv
NETLIFY_SITE_ORIGIN=https://<site>.netlify.app
FUNNEL_API_PORT=3000
FUNNEL_HTTPS_PORT=443

JWT_ACCESS_SECRET=<segredo-novo-e-longo>
JWT_REFRESH_SECRET=<outro-segredo-novo-e-longo>
INTEGRATION_ENCRYPTION_KEY=<base64-de-exatos-32-bytes>

AI_PROVIDER=ollama
OLLAMA_BASE_URL=http://ollama:11434
OLLAMA_GENERATION_MODEL=llama3.2
OLLAMA_EMBEDDING_MODEL=nomic-embed-text
AI_TIMEOUT_MS=120000

GOOGLE_CLIENT_ID=<client-id-do-web-app>
GOOGLE_CLIENT_SECRET=<client-secret>
GOOGLE_OAUTH_REDIRECT_URI=https://<hostname-tailnet>.ts.net/api/integrations/google/oauth/callback
```

`INTEGRATION_ENCRYPTION_KEY` não é opcional quando as integrações estão
carregadas: ela precisa decodificar para exatamente 32 bytes. Nunca reutilize
JWTs ou essa chave de outro ambiente, não a cole em tickets/logs e não faça
commit de `.env.demo`.

## GPU: overlay exclusivo do deploy

O arquivo `docker-compose.deploy-gpu.yml` acrescenta `gpus: all` somente ao
serviço `ollama`. Ele não altera `docker-compose.yml`, `docker-compose.dev.yml`
nem os comandos de desenvolvimento. Todo comando Compose deste servidor deve
incluir este terceiro arquivo:

```bash
docker compose --env-file .env.demo \
  -f docker-compose.yml -f docker-compose.demo.yml -f docker-compose.deploy-gpu.yml config
```

Revise a saída e confirme que `postgres` não possui `ports` e que `api` possui
apenas `127.0.0.1:3000:3000`. Não adicione `--profile local-web`: o frontend
público é entregue pelo Netlify, não por Nginx local.

## Google Cloud e Netlify

No cliente OAuth do tipo **Aplicativo da Web** no Google Cloud, inclua exatamente
este URI de redirecionamento autorizado (sem barra final):

```text
https://<hostname-tailnet>.ts.net/api/integrations/google/oauth/callback
```

Habilite as APIs Google Drive e Google Docs no projeto desse cliente. Após
alterar o hostname, crie outro URI no Google Cloud e atualize
`GOOGLE_OAUTH_REDIRECT_URI`; não tente usar a URL Netlify como callback.

No Netlify, conecte o repositório e deixe `netlify.toml` controlar o build. Em
**Environment variables**, configure para o contexto de produção:

```text
TAILSCALE_FUNNEL_ORIGIN=https://<hostname-tailnet>.ts.net
```

É uma origem HTTPS, sem caminho, query, usuário ou senha. Salvar a variável não
atualiza uma Edge Function já publicada: dispare um novo deploy depois de
configurá-la. O frontend precisa permanecer em `NETLIFY_SITE_ORIGIN` para que
os cookies cross-origin sejam permitidos pela API.

## Primeira subida

O script de inicialização da API executa `prisma migrate deploy`, portanto as
migrations são aplicadas no PostgreSQL vazio antes de a API aceitar tráfego.
Execute, sempre no clone:

```bash
docker compose --env-file .env.demo \
  -f docker-compose.yml -f docker-compose.demo.yml -f docker-compose.deploy-gpu.yml \
  up -d --build postgres ollama api

docker compose --env-file .env.demo \
  -f docker-compose.yml -f docker-compose.demo.yml -f docker-compose.deploy-gpu.yml \
  exec ollama ollama pull llama3.2
docker compose --env-file .env.demo \
  -f docker-compose.yml -f docker-compose.demo.yml -f docker-compose.deploy-gpu.yml \
  exec ollama ollama pull nomic-embed-text
```

Espere a prontidão, não apenas o container estar em execução:

```bash
curl --fail http://127.0.0.1:3000/api/health
curl --fail http://127.0.0.1:3000/api/ready
docker compose --env-file .env.demo \
  -f docker-compose.yml -f docker-compose.demo.yml -f docker-compose.deploy-gpu.yml ps
```

Então habilite o Funnel para o destino loopback (reaplicar o comando atualiza a
mesma porta):

```bash
tailscale funnel --bg --yes --https=443 http://127.0.0.1:3000
tailscale funnel status
```

Copie a origem exibida pelo status para `TAILSCALE_FUNNEL_ORIGIN` no Netlify e
publique novamente o site. Teste tanto `https://<hostname-tailnet>.ts.net/api/ready`
quanto o frontend Netlify. Não exponha `3000` no firewall: o Funnel se conecta
ao loopback.

### Confirmar que a RTX está em uso

Após uma ação de IA, rode:

```bash
docker compose --env-file .env.demo \
  -f docker-compose.yml -f docker-compose.demo.yml -f docker-compose.deploy-gpu.yml \
  exec ollama ollama ps
nvidia-smi
```

`ollama ps` deve indicar GPU para o modelo em execução e `nvidia-smi` deve
mostrar o processo/consumo correspondente. Se aparecer CPU, verifique nesta
ordem: driver NVIDIA compatível com WSL, `nvidia-smi` no WSL, backend e
integração WSL2 do Docker Desktop, presença de `gpus: all` no `config` do
Compose e recriação de `ollama` com o overlay. Não tente resolver aumentando
o timeout; isso não habilita GPU.

## Aceite funcional obrigatório

Execute esta lista após o deploy, registrando apenas IDs mascarados e horários:

- [ ] Após reboot do Windows/Docker Desktop, `postgres` não tem porta publicada,
  `/api/health` e `/api/ready` voltam a responder, e o Funnel aponta para a API.
- [ ] Abra o site Netlify, cadastre/entre com uma conta de teste e confirme que
  uma chamada `/api/*` atravessa Netlify → Funnel → API.
- [ ] Conclua OAuth Google pelo hostname Tailscale e confirme que retorna ao app.
- [ ] Importe um DOCX suportado pela interface e confirme o candidato/documento.
- [ ] Vincule uma pasta Google a um projeto; use **Sincronizar agora** e altere
  um arquivo. Confirme a sincronização automática seguinte (o poll é de 10 min).
- [ ] Crie conteúdo com dependência inequívoca, dispare a análise global do
  projeto e confirme no grafo as dependências geradas pela IA. Verifique também
  `ollama ps` durante o job e que ele não excede `AI_TIMEOUT_MS`.

## Operação diária, atualização e backup

Antes de atualizar, gere um dump. Exemplo de destino no disco Windows montado
no WSL (ajuste `D:` e crie a pasta antes):

```bash
mkdir -p /mnt/d/Athena-backups
backup=/mnt/d/Athena-backups/athena-$(date +%Y%m%d-%H%M%S).sql
docker compose --env-file .env.demo \
  -f docker-compose.yml -f docker-compose.demo.yml -f docker-compose.deploy-gpu.yml \
  exec -T postgres pg_dump -U athena athena > "$backup"
test -s "$backup" && sha256sum "$backup" > "$backup.sha256"
```

Copie o `.sql` e o `.sha256` manualmente para uma mídia/local protegido. Para
atualizar depois do backup:

```bash
git fetch --all --tags
git switch <BRANCH_DE_DEPLOY>
git pull --ff-only
docker compose --env-file .env.demo \
  -f docker-compose.yml -f docker-compose.demo.yml -f docker-compose.deploy-gpu.yml \
  up -d --build postgres ollama api
tailscale funnel status
```

Diagnóstico diário:

```bash
docker compose --env-file .env.demo \
  -f docker-compose.yml -f docker-compose.demo.yml -f docker-compose.deploy-gpu.yml logs --tail=200 api ollama postgres
tailscale funnel status
```

### Restore: somente com confirmação explícita

Primeiro valide um dump em um ambiente descartável; não teste restore no banco
de deploy. Para restaurar deliberadamente no banco de deploy, pare a API,
confirme o arquivo e digite a frase literal abaixo:

```bash
read -r -p "Digite RESTAURAR BANCO ATHENA para sobrescrever dados: " confirm
[ "$confirm" = "RESTAURAR BANCO ATHENA" ] || { echo "Cancelado"; exit 1; }
docker compose --env-file .env.demo \
  -f docker-compose.yml -f docker-compose.demo.yml -f docker-compose.deploy-gpu.yml stop api
docker compose --env-file .env.demo \
  -f docker-compose.yml -f docker-compose.demo.yml -f docker-compose.deploy-gpu.yml \
  exec -T postgres psql -U athena -d athena < /caminho/confirmado/backup.sql
docker compose --env-file .env.demo \
  -f docker-compose.yml -f docker-compose.demo.yml -f docker-compose.deploy-gpu.yml start api
```

O SQL é aplicado ao banco existente; ele não apaga objetos automaticamente.
Use somente um dump compatível e validado. Se o procedimento exigir substituir
todo o banco, planeje janela, teste em cópia descartável e obtenha confirmação
operacional separada antes de qualquer limpeza de schema/volume.

## Segurança e incidentes

- Não versione `.env.demo`, dumps, tokens, cookies nem a chave de integração.
  Se um secret for exposto, revogue-o e gere JWTs/chave OAuth novos; conexões
  Google existentes cifradas com uma chave trocada exigem plano de rotação.
- Mantenha PostgreSQL sem `ports`, o Docker Desktop atualizado e o host físico
  protegido. Desligue a exposição após demonstrações: `tailscale funnel --https=443 off`.
- **Callback OAuth inválido:** compare literalmente URI no Google Cloud,
  `GOOGLE_OAUTH_REDIRECT_URI` e hostname do Funnel; depois recrie a API e refaça
  a autorização. Não use URL Netlify no callback.
- **API indisponível no Netlify:** teste primeiro o loopback `/api/ready`, depois
  `tailscale funnel status`, e por fim a variável `TAILSCALE_FUNNEL_ORIGIN` e o
  último deploy Netlify. `DEMO_API_UNAVAILABLE` indica falha no upstream;
  `DEMO_PROXY_NOT_CONFIGURED` indica variável ausente ou inválida.
- **Timeout do Ollama:** confira GPU/modelos com `ollama ps` e logs; confirme
  `AI_TIMEOUT_MS=120000` para a RTX. Se ainda falhar, reduza o escopo do projeto
  de teste ou eleve o timeout de forma controlada, registrando a mudança.

Ao encerrar uma apresentação, desligue o Funnel e mantenha os volumes intactos:

```bash
tailscale funnel --https=443 off
```

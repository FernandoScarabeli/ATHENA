# ATHENA — checklist operacional das integrações

Este documento fecha o ciclo de validação de GitHub PAT, Google OAuth/Drive/Docs e da fila de candidatos. Ele separa evidência automatizada (segura para CI) de validação contra contas externas, que só deve ocorrer com contas descartáveis e autorização explícita.

## Configuração local

1. Copie `.env.example` para o arquivo de ambiente local e gere uma chave efêmera de 32 bytes em base64:

   ```bash
   openssl rand -base64 32
   ```

2. Defina `INTEGRATION_ENCRYPTION_KEY` somente no ambiente/secret manager. Nunca coloque PAT, client secret, access token ou refresh token em `.env` versionado, fixture, snapshot, URL ou log.
3. Para Google, configure `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` e `GOOGLE_OAUTH_REDIRECT_URI`; o redirect precisa estar cadastrado no projeto Google de teste.
4. Para GitHub, o PAT deve ser de uma conta/repositório de teste e possuir somente o escopo mínimo necessário para leitura.
5. Os endpoints dos adaptadores são configuráveis (`GITHUB_API_URL`, `GOOGLE_AUTH_URL`, `GOOGLE_TOKEN_URL`, `GOOGLE_DRIVE_API_URL`, `GOOGLE_DOCS_API_URL`) para mocks locais; os testes padrão não acessam a internet.

## Quality gate automatizado

Execute na raiz:

```bash
INTEGRATION_ENCRYPTION_KEY="$(openssl rand -base64 32)" corepack pnpm test
INTEGRATION_ENCRYPTION_KEY="$(openssl rand -base64 32)" corepack pnpm lint
INTEGRATION_ENCRYPTION_KEY="$(openssl rand -base64 32)" corepack pnpm build
corepack pnpm exec prisma validate --schema backend/api/prisma/schema.prisma
git diff --check
```

Com `TEST_DATABASE_URL` apontando exclusivamente para `athena_test` (nunca para o volume da aplicação), acrescente os testes de integração. Eles cobrem isolamento por workspace, OWNER/VIEWER, credencial ausente, desconexão/revogação lógica, importação repetida sem nova revisão, mudança de fingerprint, arquivo removido, aprovação concorrente e histórico.

## Matriz de falhas esperada

| Cenário | Resultado seguro |
|---|---|
| PAT/access token ausente ou curto | `400`, antes de cifrar |
| membro fora do workspace ou sem OWNER | `403`, sem consulta ao segredo |
| conexão desconectada/segredo ausente | `404` ou reconexão explícita |
| GitHub `401` | `401`, sem token na mensagem |
| GitHub `403` com rate limit zerado | `429` |
| Google `401` ou refresh revogado | `401`/reconexão |
| Google `403` | `403` permissão revogada |
| GitHub/Google `429` | `429`, sem retry automático infinito |
| arquivo ausente ou inacessível | candidato `failed`, sem requisito canônico |
| importação idêntica | `changed=false`, sem revisão duplicada |
| conteúdo alterado | nova revisão pendente, requisito canônico intacto |
| candidato já revisado ou revisão divergente | `409` |

## Validação real — pendente de credenciais

Esta seção só pode ser executada depois de registrar contas de teste, janela de uso e responsável. Não usar contas pessoais ou tokens de produção.

- [ ] Conectar GitHub como OWNER e confirmar que resposta/logs não exibem PAT.
- [ ] Validar `/account`, paginação de repositórios e leitura de um arquivo de teste.
- [ ] Reimportar o mesmo arquivo e confirmar ausência de revisão duplicada.
- [ ] Alterar o arquivo e confirmar novo candidato/revisão sem alterar US canônica.
- [ ] Revogar/remover acesso e confirmar erro legível e preservação do histórico.
- [ ] Conectar Google com OAuth, confirmar state único/TTL e ausência de tokens na URL.
- [ ] Listar Drive, importar Docs e arquivo texto suportado; rejeitar MIME não suportado.
- [ ] Forçar expiração e refresh; revogar refresh token e confirmar reconexão.
- [ ] Exercitar rate limit controlado, se o provedor/conta de teste permitir.
- [ ] Aprovar com OWNER/EDITOR e confirmar bloqueio para VIEWER e outro workspace.
- [ ] Desconectar e confirmar remoção do segredo cifrado, preservando sources/candidates.

## Observabilidade e resposta a incidentes

Eventos básicos são emitidos sem credenciais ou conteúdo: `integration.connected`, `disconnected`, `sync_unchanged`, `candidate_changed` e `candidate_approved`. Adaptadores registram apenas códigos de falha e workspace; nunca registre headers, corpos OAuth, conteúdo importado ou valores de `credentials`. Em caso de segredo suspeito em log, interrompa a coleta, revogue o segredo no provedor e preserve somente IDs/timestamps para investigação.

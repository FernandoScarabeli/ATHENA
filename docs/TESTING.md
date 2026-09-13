# Testes da API ATHENA

## Suíte PostgreSQL e E2E HTTP

As suítes `backend/api/test/*.integration.spec.ts` e `backend/api/test/api.e2e.spec.ts` são opt-in. Elas exigem `TEST_DATABASE_URL` apontando explicitamente para um banco descartável chamado `athena_test` ou `athena_test_*`; sem essa variável, os testes são ignorados. Cada suíte cria usuários/workspace próprios com sufixos aleatórios e remove seus registros no encerramento. Nunca use a URL da base de desenvolvimento ou da demonstração.

Com PostgreSQL novo e migrations aplicadas:

```sh
TEST_DATABASE_URL='postgresql://postgres:postgres@127.0.0.1:32768/athena_test' \
  corepack pnpm --filter @athena/api exec jest --runInBand test/api.e2e.spec.ts test/requirements.integration.spec.ts test/folders.integration.spec.ts
```
O E2E inicializa o `AppModule` real e envia requisições HTTP para o servidor Nest, preservando cookies HttpOnly, `ValidationPipe` e `HttpErrorFilter`; não substitui serviços por mocks. Cobre autenticação/cookie, workspace/projeto, papéis e isolamento, pastas, templates, criação e salvamento de US, versões, relações, política de referências, comentários/menções/notificações, recarga HTTP e arquivamento.

Quality gates da API:

```sh
corepack pnpm --filter @athena/api test
corepack pnpm --filter @athena/api build
corepack pnpm --filter @athena/api lint
```

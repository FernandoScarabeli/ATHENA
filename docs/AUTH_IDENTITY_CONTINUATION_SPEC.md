# ATHENA — especificação de continuidade: identidade, acesso e e-mail

> **Meta para o próximo agente:** concluir o fluxo de identidade ATHENA até que login, cadastro, confirmação de e-mail, recuperação de senha, sessões por dispositivo e convites estejam implementados, testados e verificáveis em ambiente local com Resend configurado. Não considerar a meta atingida ao apenas compilar a interface ou criar o schema.

## 1. Contexto e limites

ATHENA é um monorepo PNPM com React/Vite em `frontend/`, NestJS/Prisma em `backend/api/` e PostgreSQL. O produto é um hub para requisitos e workspaces; uma pessoa possui uma única conta e pode pertencer a vários workspaces.

O pedido original cobre front-end e back-end, com uma experiência de autenticação limpa, minimalista e Apple-like. As telas devem preservar a identidade gráfica atual do ATHENA: superfícies claras, tipografia de sistema, preto/grafite como ação principal e o mapa de requisitos como contexto visual discreto. Autenticação é uma superfície utilitária: clareza, segurança e familiaridade têm prioridade sobre efeitos decorativos.

Não alterar os arquivos já modificados para Google Drive, requisitos e componentes de projeto, salvo uma dependência técnica comprovada. A árvore está suja com trabalho de outro fluxo. Não usar `git reset`, checkout destrutivo ou limpeza ampla.

## 2. Decisões de produto fechadas

- Login e cadastro são rotas distintas: `/login` e `/cadastro`.
- Há páginas públicas para `/verificar-email`, `/esqueci-senha`, `/redefinir-senha` e, ao concluir convites, `/convites/aceitar`.
- Cadastro é público; cria conta não verificada e jamais cria automaticamente um workspace.
- Somente e-mail confirmado permite autenticação e acesso a workspaces.
- Após confirmação sem convite, direcionar para o onboarding já existente de seleção/criação de workspace e projeto.
- Após aceitar convite, entrar no workspace que concedeu acesso.
- A conta usa nome completo, e-mail normalizado e senha de ao menos 12 caracteres. Senha comprometida é bloqueada via consulta k-anônima ao Pwned Passwords API; indisponibilidade desse serviço falha fechada com mensagem recuperável.
- Aceite de Termos e Política de Privacidade é obrigatório. Os textos ficam fora do produto, em URLs configuráveis, e devem ter a versão registrada no banco.
- E-mails transacionais usam **Resend**, SDK oficial `resend`, `RESEND_API_KEY` e remetente/dominio configurado em `RESEND_FROM`.
- Access token dura 15 minutos. Refresh token é rotacionado e preso a uma sessão persistida: 30 dias com “Lembrar este dispositivo”; cookie de sessão, sem `maxAge`, quando desmarcado.
- Reset de senha revoga todas as sessões ativas do usuário.
- Não existe papel `ADMIN`. Os únicos papéis permitidos são `OWNER`, `EDITOR` e `VIEWER`.
- Convites: somente `OWNER` cria, reenvia ou revoga; o papel do convite só pode ser `EDITOR` ou `VIEWER`; expira em 7 dias; a pessoa deve autenticar/cadastrar no mesmo e-mail e confirmar o e-mail antes do aceite.
- Não há webhooks de bounce/delivery do Resend neste marco. Falhas síncronas da API Resend precisam ser tratadas sem vazar dados sensíveis.

## 3. Estado atual — já iniciado, mas **não concluído**

### Alterações presentes na árvore

- `backend/api/package.json` e `pnpm-lock.yaml` já incluem `resend` (`^6.28.1`).
- `backend/api/prisma/schema.prisma` já contém os modelos `AuthSession`, `EmailVerificationToken`, `PasswordResetToken`, `LegalAcceptance`, `AuthAttempt` e `WorkspaceInvite`, além de `User.verifiedAt`.
- Há uma migration criada em `backend/api/prisma/migrations/20260920143000_auth_identity_resend/migration.sql`.
- `backend/api/src/auth/auth.service.ts` contém uma implementação inicial de envio Resend, registro, confirmação, reset, rate limit e sessões.
- `backend/api/src/auth/auth.controller.ts` expõe endpoints iniciais de autenticação e sessões.
- `.env.example` já documenta `RESEND_API_KEY`, `RESEND_FROM`, `APP_ORIGIN`, URLs/versões legais e as URLs `VITE_*` usadas pelo frontend.
- `frontend/src/features/auth/AuthPage.tsx` substitui a alternância interna pelo roteamento por `window.history` e cobre login, cadastro, verificação e reset visualmente.
- `frontend/src/styles.css` recebeu refinamento visual de autenticação, inclusive foco, transição curta e `prefers-reduced-motion` já existente globalmente.

### Lacunas e riscos obrigatórios de corrigir

1. **Convites não foram implementados.** O modelo existe, mas não há serviço, controlador, UI ou testes para criar, reenviar, revogar e aceitar.
2. **O guard JWT não consulta `AuthSession`.** Hoje `JwtCookieGuard` apenas verifica assinatura/expiração; um access token revogado continua válido até 15 minutos. Atualize o guard para validar `sid`, sessão não revogada, expiração e usuário verificado. Mantenha o erro público genérico.
3. **Não existem testes novos de auth, Resend, sessão ou convite.** Criá-los antes de concluir.
4. **A API ainda não tem documentação REST ou documentação de produto atualizada.** Atualizar `docs/REST_API.md`, `docs/DOMAIN_MODEL.md`, `docs/PRODUCT_DECISIONS.md`, `docs/PROJECT_STATE.md` e `docs/BACKLOG.md` para remover o status futuro de e-mail/convites e documentar o novo contrato.
5. **A interface não preserva `returnTo`**, embora essa seja parte do contrato. Validar somente paths relativos internos, persistir o destino ao navegar entre Login/Cadastro/Reset/Convite e consumir após autenticação ou aceite.
6. **Não há UI de reenvio de confirmação**, tela de sessão/dispositivos nem tela/ação de convite na gestão de membros do workspace.
7. **A migration precisa ser revisada contra um PostgreSQL limpo** e aplicada via `prisma migrate deploy`. Não assuma que `prisma generate` significa migration válida.
8. **A linha única e compactada dos arquivos de auth deve ser reformatada** para código legível, testável e revisável. Não altere comportamento em massa sem testes.

## 4. Arquitetura de backend a implementar

### 4.1 Módulos e responsabilidades

Manter `AuthModule` como dono do ciclo de identidade. Extrair serviços pequenos, injetáveis e testáveis:

- `AuthService`: registro, login, confirmação, refresh, logout, recuperação, redefinição, sessão atual e sessões do usuário.
- `TransactionalEmailService`: única integração com Resend. Recebe comandos sem token em logs (`sendVerification`, `sendPasswordReset`, `sendWorkspaceInvite`) e produz HTML + texto simples. Não permita que controllers chamem `Resend` diretamente.
- `PasswordPolicyService`: mínimo de 12, validação k-anônima e timeout. Em testes, usar uma dependência mockável; nunca chamar a internet durante testes unitários.
- `AuthRateLimitService`: limite progressivo por ação, e-mail normalizado e IP/origem. Definir explicitamente janelas/limiares e respostas. Preferir registrar falha, não senha nem token.
- `InviteService`: autoridade exclusiva para o ciclo de convites, com verificações de membership dentro de transações.

Use `crypto.randomBytes(32).toString('base64url')` para tokens; persistir apenas SHA-256. Tokens nunca vão para logs, erros, resposta REST, analytics ou `ActivityLog` textual. Use `argon2id` para senhas e hash separado (SHA-256) para tokens aleatórios de alta entropia.

### 4.2 Resend

Variáveis obrigatórias em produção:

```dotenv
APP_ORIGIN=https://app.exemplo.com
RESEND_API_KEY=re_...
RESEND_FROM=ATHENA <acesso@exemplo.com>
TERMS_URL=https://exemplo.com/termos
PRIVACY_URL=https://exemplo.com/privacidade
TERMS_VERSION=2026-09
PRIVACY_VERSION=2026-09
```

- Falhar rapidamente no boot em produção se `RESEND_API_KEY`, `RESEND_FROM` ou `APP_ORIGIN` faltarem; desenvolvimento pode usar uma implementação explícita de captura/local fake, nunca um envio silencioso.
- Usar a SDK `Resend` e `emails.send` com `from`, `to`, `subject`, `html`, `text` e `idempotencyKey`.
- Chaves de idempotência devem ser estáveis por evento e token: `email-verification/<token-hash>`, `password-reset/<token-hash>`, `workspace-invite/<invite-id>/<token-hash>`.
- Um reenvio deve invalidar o token anterior, gerar um novo token e portanto uma nova chave de idempotência.
- Escape todo conteúdo interpolado em HTML. Nome e nome de workspace são entrada do usuário; não inserir cru no e-mail.
- Mensagens necessárias: confirmação de e-mail (24 h), reset de senha (1 h) e convite (7 dias). As três devem conter CTA, URL absoluta e texto alternativo.

### 4.3 Contrato REST proposto

Todos os erros adotam o envelope existente `{ error: { code, message, details? } }`.

| Método e rota | Autorização | Corpo/resultado | Regras |
| --- | --- | --- | --- |
| `POST /auth/register` | público | `{name,email,password,passwordConfirmation,termsAccepted,returnTo?}` | devolve `202`; nunca cria sessão antes de verificar e-mail. |
| `POST /auth/login` | público | `{email,password,remember,returnTo?}` | resposta de falha é sempre neutra; cria sessão + cookies. |
| `POST /auth/verify-email` | público | `{token}` | uso único; confirma usuário; retorna destino seguro ou convite pendente. |
| `POST /auth/resend-verification` | público | `{email}` | sempre `202` neutro; sujeito a limite. |
| `POST /auth/forgot-password` | público | `{email}` | sempre `202` neutro; sujeito a limite. |
| `POST /auth/reset-password` | público | `{token,password,passwordConfirmation}` | token único; revoga sessões. |
| `POST /auth/refresh` | cookie | — | roda rotação atômica do refresh e emite cookies novos. |
| `POST /auth/logout` | cookie | — | revoga sessão do refresh e limpa cookies. |
| `GET /auth/me` | sessão | — | usuário seguro e `verifiedAt`; nunca senha. |
| `GET /auth/sessions` | sessão | — | lista dispositivos/sessões do próprio usuário. |
| `DELETE /auth/sessions/:id` | sessão | — | só a própria sessão; idempotente. |
| `POST /workspaces/:id/invites` | OWNER | `{email,role}` | apenas `EDITOR`/`VIEWER`; cria e envia. |
| `GET /workspaces/:id/invites` | OWNER | — | inclui pendentes/expirados/revogados sem token. |
| `POST /workspaces/:id/invites/:id/resend` | OWNER | — | invalida token anterior e reenviá. |
| `DELETE /workspaces/:id/invites/:id` | OWNER | — | revoga se ainda pendente; idempotente. |
| `GET /invites/resolve?token=...` | público | — | retorna somente contexto seguro do convite válido, sem e-mail completo em interfaces não autenticadas. |
| `POST /invites/accept` | sessão verificada | `{token}` | exige correspondência do e-mail; cria/atualiza membership em transação; é idempotente. |

`returnTo` deve ser normalizado e aceito apenas se iniciar com `/`, não iniciar com `//`, e não for uma URL absoluta. Não refletir destino não confiável em e-mails.

### 4.4 Sessões e cookies

- Acesso: cookie `athena_access`, `HttpOnly`, `SameSite=Lax`, `Secure` em HTTPS, path `/`, 15 minutos.
- Refresh: cookie `athena_refresh`, forma `<session-id>.<secret>`, `HttpOnly`, `SameSite=Lax`, `Secure` em HTTPS. Sem `maxAge` quando `remember=false`; 30 dias quando `true`.
- Persistir hash do segredo do refresh, não o segredo. Uma rotação deve revogar/substituir em transação para reduzir reuso concorrente.
- JWT access deve carregar `sub`, `email` e `sid`; guard valida assinatura **e** consulta `AuthSession` com `id=sid`, usuário correspondente, não revogada, não expirada e usuário verificado.
- Ao logout/revogação, limpar cookies com os mesmos atributos relevantes.
- Ao reset de senha, revogar todas as sessões, inclusive a atual; o usuário entra novamente.

### 4.5 Convites

`WorkspaceInvite` deve manter workspace, e-mail normalizado, papel, autor, token hash, data de expiração, revogação, aceite e destinatário que efetivamente aceitou. Não inserir membership ao enviar.

Fluxo:

1. Owner escolhe e-mail e `EDITOR`/`VIEWER` na gestão de membros.
2. API confirma que requester é OWNER e que o e-mail não possui membership ativo no workspace.
3. Revoga convites pendentes equivalentes ou rejeita duplicata com uma decisão documentada; recomendado: revogar/substituir em uma transação.
4. Persiste invite + token hash e chama Resend. Se envio falhar, decidir e testar: recomendado persistir com estado pendente de envio e permitir retry, sem expor token.
5. Link leva a `/convites/aceitar?token=...`; resolve o contexto mínimo e envia a pessoa para Login/Cadastro preservando o token em memória/URL.
6. Novo usuário cadastra a mesma caixa postal, confirma e-mail e aceita. Usuário existente autentica e aceita. E-mail diferente não recebe informação sobre convite nem acesso.
7. Aceite cria `WorkspaceMember` com o papel convidado em transação e marca `acceptedAt`/`recipientId`; uma repetição retorna sucesso sem duplicar membership.

## 5. Front-end esperado

Não adicionar React Router apenas por conveniência sem avaliar o custo. O app hoje usa navegação manual e `Onboarding` também lê `window.location`. Pode-se introduzir React Router somente se migrar as rotas existentes sem regressão. Alternativamente, isolar um roteador público pequeno que trate `popstate`, URLs e estados de formulário corretamente.

### Telas

- **Login `/login`:** e-mail, senha com mostrar/ocultar, lembrar dispositivo, link recuperação, CTA, erro genérico e caminho para cadastro.
- **Cadastro `/cadastro`:** nome completo, e-mail, senha, confirmação, checklist de política, links legais externos, checkbox obrigatório, CTA e confirmação pós-envio. Não autenticar automaticamente.
- **Confirmação `/verificar-email`:** token na URL, confirmação automática após consentimento de navegação ou CTA explícito; estado expirado/erro com reenvio; redirecionamento seguro após sucesso.
- **Recuperação `/esqueci-senha`:** e-mail e estado neutro de sucesso.
- **Redefinição `/redefinir-senha`:** token, senha, confirmação, regra visível e estado expirado/usado.
- **Convite `/convites/aceitar`:** identifica workspace apenas depois que o token é validado, explica papel, encaminha autenticação e permite aceite após conta confirmada.
- **Sessões:** seção Segurança ou Perfil que lista sessões com data e persistência; botão de revogar necessita confirmação proporcional somente quando a UI estiver removendo a sessão atual ou várias sessões.
- **Membros:** owner vê lista de convites pendentes, cria convite, reenvia e revoga, com estados de entrega/erro próximos à ação.

### Critérios de UI/UX

- Manter o mapa de requisitos como elemento decorativo no desktop e omiti-lo no mobile se competir com o formulário.
- Usar elementos nativos (`form`, `label`, `input`, `button`), `aria-live` para status e `role=alert` para erros que impedem submissão.
- Alvos de no mínimo cerca de 44 px; foco visível; ordem de tabulação segue a leitura.
- Não usar `transition: all`. Animar somente `opacity` e `transform` quando isso explicar mudança de estado. Preferência de movimento reduzido elimina movimento, não feedback.
- Erros de validação aparecem junto ao campo; erros de servidor ficam próximos ao CTA. Não limpar campos em falhas recuperáveis.
- Testar 320 px, 390 px, tablet e desktop, mais zoom de 200%.

## 6. Plano de execução obrigatório

1. **Estabilizar a base:** reformatar auth, validar schema e aplicar migration em banco de teste novo. Resolver arquivos gerados/permissões de `backend/api/dist` sem apagar trabalho do usuário; se necessário, usar uma saída de build diferente ou ajustar propriedade com autorização explícita.
2. **Cobrir o que já existe com testes antes de ampliar:** mock de Prisma, Resend e política de senha; testes controller para cookies e corpo. Garantir que o ambiente de teste não chama Pwned Passwords/Resend.
3. **Corrigir segurança de sessão:** guard consulta sessão; refresh atômico; validar logout, expiração, reuso e reset.
4. **Finalizar e-mails e configuração:** validação de env por ambiente, templates, escape HTML, idempotência, falhas de Resend e documentação de como validar domínio/remetente.
5. **Implementar convites ponta a ponta:** serviço, rotas, autorização OWNER, transações, e-mails, UI de membros, tela pública de aceite e testes.
6. **Completar telas públicas e contexto:** `returnTo`, reenvio, estados do token, anúncios acessíveis e testes de navegação.
7. **Atualizar contratos e documentação.**
8. **Verificar de verdade:** testes unitários/integrados, lint, builds, migration em Postgres e inspeção visual via navegador antes de afirmar conclusão.

## 7. Matriz mínima de testes

### Unitários

- Normalização do e-mail; senha curta; senha vazada; indisponibilidade HIBP.
- `TransactionalEmailService`: destinatário, assunto, texto, HTML escapado, URL absoluta e `idempotencyKey` de confirmação/reset/convite; erro Resend.
- Registro: aceite obrigatório, e-mail existente sem enumeração, token hasheado, aceite com versões e nenhuma sessão.
- Verificação: sucesso, expirado, usado, reenvio invalida anterior.
- Login: credenciais inválidas e não verificadas são indistinguíveis; sessão persistente vs não persistente.
- Refresh: rotação, reutilização do refresh anterior, expiração e sessão revogada.
- Reset: token usado/expirado, senha política, todas as sessões revogadas.
- Convite: role inválido/OWNER rejeitado, emissor não owner, e-mail já membro, expiração, reenvio, revogação, mismatch de e-mail e aceite idempotente.

### Integração/E2E

- PostgreSQL novo recebe migration e Prisma client correto.
- Cookies levam atributos corretos nos dois modos de lembrar dispositivo.
- Guard bloqueia access token cujo `sid` foi revogado.
- Cadastro → e-mail fake/mocked → confirmação → login → onboarding.
- Convite → cadastro/confirmar → aceitar → workspace concedido.
- Rate limit por e-mail e IP não armazena senha/token e retorna respostas públicas apropriadas.

### Front-end/visual

- Testes de componente para cada rota, submit, validação de confirmação, checkbox legal, exibição de senha, erro e sucesso.
- Navegação Back/Forward e preservação do contexto de convite/`returnTo`.
- Inspeção real desktop e mobile; teclado até CTA, foco perceptível, sem overflow; modo reduzido sem movimento abrupto.

## 8. Comandos de verificação e entrega

```bash
corepack pnpm --filter @athena/api prisma:generate
corepack pnpm --filter @athena/api test
corepack pnpm --filter @athena/web test
corepack pnpm --filter @athena/api lint
corepack pnpm --filter @athena/web lint
corepack pnpm --filter @athena/web build
git diff --check
```

Também executar a migration em PostgreSQL isolado antes de entrega. O último passe observou que `@athena/api lint` passou e `@athena/web build` passou. O `@athena/api build` falhou porque arquivos existentes em `backend/api/dist/` não permitiam escrita (`EACCES`), não por erro TypeScript; o próximo agente deve diagnosticar isso sem apagar arquivos amplamente.

## 9. Condição objetiva de conclusão

Só encerrar quando todos os itens forem verdadeiros:

- fluxo completo de cadastro, confirmação, login, recuperação/reset, sessões e convites funciona no banco de teste;
- Resend está configurado por env e todos os três e-mails são validados por mock e por teste manual seguro com domínio/remetente configurado;
- nenhum token, senha ou chave aparece em logs, respostas ou commits;
- regras de papel, e-mail verificado e origem do convite são validadas no backend, não apenas na UI;
- testes novos cobrem segurança e erros esperados;
- migration, lint e builds passam;
- telas são inspecionadas em navegador desktop/mobile, teclado e reduced motion;
- docs REST/domínio/produto refletem o contrato final;
- alterações paralelas de Google Drive/requisitos foram preservadas.

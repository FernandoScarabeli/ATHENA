# Integrações

## Google OAuth, Drive e Docs (ATH-019)

Somente `OWNER` pode iniciar ou operar o OAuth Google. `GET /workspaces/:workspaceId/integrations/google/oauth/start` cria um `state` aleatório, armazenado apenas como hash, associado ao usuário/workspace e com TTL de 10 minutos. `GET /integrations/google/oauth/callback?state=...&code=...` valida vínculo, expiração e uso único antes de trocar o código; tokens nunca são colocados na URL final, resposta, logs ou snapshots.

Os escopos são `drive` e `documents`, necessários para ler e escrever somente a raiz que o OWNER escolher sincronizar. O access token e eventual refresh token são cifrados pelo AES-256-GCM de ATH-017. Expiração tenta refresh automático; refresh revogado solicita reconexão.

`GET /workspaces/:workspaceId/integrations/google/files?pageToken=...` lista arquivos autorizados de forma paginada. `POST /workspaces/:workspaceId/integrations/google/import` recebe `{ "files": ["drive-file-id"] }` e lê somente IDs selecionados. Docs, texto, Markdown, CSV e JSON são aceitos; MIME types não suportados, arquivos inacessíveis e permissões revogadas retornam erros claros.

Importações explícitas legadas continuam gerando candidatos revisáveis. Pastas vinculadas usam `google:drive:<fileId>` como identidade estável para criar ou atualizar diretamente a US correspondente e mantêm `IntegrationCandidate` aceito apenas como trilha de auditoria. Testes usam HTTP mockável; validação com conta Google real permanece pendente.

Adaptadores recebem credenciais cifradas AES-256-GCM. A base segura de conexões já está implementada: cada workspace possui no máximo uma conexão por provider (`GITHUB` ou `GOOGLE`), com metadados separados dos segredos.

`INTEGRATION_ENCRYPTION_KEY` é obrigatório quando o módulo é carregado e deve ser base64 de exatamente 32 bytes. A chave deve vir de um secret manager em produção; não deve ser commitada, logada ou enviada ao cliente. Rotação exige uma janela operacional: descriptografar registros com a chave anterior, recifrar com a nova em job controlado e só então remover a anterior. Sem a chave, a API deve falhar ao iniciar, evitando operar com credenciais ilegíveis.

As rotas são:

- `GET /workspaces/:workspaceId/integrations`: qualquer membro vê somente id, provider, status, rótulo de conta e timestamps.
- `POST /workspaces/:workspaceId/integrations` com `{ kind, credentials, accountLabel? }`: somente `OWNER`; o corpo nunca é devolvido.
- `DELETE /workspaces/:workspaceId/integrations/:kind`: somente `OWNER`; marca a conexão como `DISCONNECTED` e zera a credencial cifrada. A linha lógica, fontes e candidatos históricos não são removidos.

O endpoint de conexão valida o formato mínimo do segredo (`token` para GitHub, `accessToken` para Google); a validação da conta externa pertence aos adaptadores ATH-018/ATH-019. Nenhuma credencial deve aparecer em logs, erros, snapshots ou respostas.

Adaptadores recebem credenciais cifradas AES-256-GCM. GitHub (PAT) e Google Drive/Docs (OAuth) devem validar a conta, registrar `SourceDocument` e `ExternalReference`, e criar candidatos revisáveis antes da canonização.

## GitHub PAT (ATH-018)

Depois de conectar `GITHUB`, somente `OWNER` pode usar os endpoints de importação. A credencial é obtida internamente por `activeCredentials`; nunca é aceita novamente nesses endpoints, retornada ou incluída em logs:

- `GET /workspaces/:workspaceId/integrations/github/account` valida o PAT e retorna apenas login/id da conta;
- `GET /workspaces/:workspaceId/integrations/github/repositories?page=1` lista repositórios autorizados e percorre as páginas da API;
- `POST /workspaces/:workspaceId/integrations/github/import` recebe `{ "sources": [{ "owner": "acme", "repository": "produto", "path": "docs/requisitos.md" }] }`.

A escolha de arquivos é explícita por workspace. Cada arquivo é identificado por `github:<owner>/<repository>:<path>` e gravado como `IntegrationSource` + `IntegrationCandidate` `PENDING`; nenhuma importação cria ou altera uma US canônica. Reimportações fazem upsert pela identidade externa e preservam o status de revisão. Arquivos removidos ou inacessíveis retornam em `failed` com `SOURCE_REMOVED_OR_INACCESSIBLE`; autenticação revogada e rate limit são respostas legíveis (401/429). A API usa cliente HTTP mockável e não realiza chamadas reais nos testes; validação com uma conta GitHub real fica pendente de credenciais de teste.
## Revisão de candidatos (ATH-020)

O sincronizador usa fingerprint por identidade externa, versão, título e conteúdo. Reimportações idênticas não criam revisão; mudanças geram snapshots imutáveis. A varredura marca fontes ausentes sem apagá-las, e uma fonte reaparecida restaura a identidade sem duplicar snapshot. A aprovação usa revisão otimista, converte o texto para TipTap válido e mantém `VIEWER` em modo somente leitura.

Para o procedimento completo de configuração, quality gates e validação real sem credenciais no repositório, consulte [INTEGRATION_VALIDATION.md](INTEGRATION_VALIDATION.md). Os adaptadores diferenciam rate limit (`429`) de permissão revogada (`403`), e os eventos operacionais registram somente metadados seguros.

## Espelhamento bidirecional de pasta Google Drive

Um vínculo de pasta agora escolhe também o projeto ATHENA de destino. A raiz e
suas subpastas são representadas como uma árvore de pastas no workspace; Docs,
TXT, Markdown, CSV e JSON suportados viram US automaticamente. A API percorre a
raiz a cada 10 minutos e o OWNER também pode usar **Sincronizar agora**.

Não existe fila de aprovação por arquivo: criação, edição, movimentação e
remoção do Drive são aplicadas à US vinculada com histórico de revisões. Uma US
criada, salva, movida ou arquivada dentro de uma pasta vinculada gera uma operação
durável de volta ao Drive; US arquivadas são movidas para `Arquivados`. Quando os
dois lados mudam antes da próxima leitura, a alteração mais recente prevalece.

O OAuth pede `drive` e `documents` para poder escrever. Conexões criadas com os
escopos antigos de somente leitura devem ser reconectadas pelo OWNER. A outbox e
os fingerprints impedem que uma escrita feita pelo ATHENA retorne como uma nova
alteração na varredura seguinte.

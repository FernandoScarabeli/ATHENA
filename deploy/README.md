# Operações ATHENA

Use sempre o ponto de entrada na raiz:

```bash
./deploy/deploy.sh
```

Se preferir usar o PNPM, o mesmo menu pode ser chamado com
`corepack pnpm run deploy` (e ações, por exemplo,
`corepack pnpm run deploy -- status`).

O menu reutiliza os Compose e scripts já existentes. `Docker dev` usa Vite HMR
e Nest watch; `Docker normal` usa a stack padrão; os comandos de demo chamam
os scripts Tailscale Funnel existentes. Todos os caminhos de subida do menu
sobem automaticamente API, PostgreSQL e Ollama juntos.

Backups ficam em `deploy/backups/`, ignorados pelo Git. Antes de qualquer reset do
banco, o menu exige um `pg_dump` com timestamp, a senha local cujo hash SHA-256
fica em `deploy/.reset-db.sha256`, e a confirmação literal `APAGAR BANCO`.
O reset remove exclusivamente o volume resolvido pelo Compose para
`postgres_data`; não usa `down -v`, glob, nem caminhos amplos.

Também é possível chamar ações não interativas:

```bash
./deploy/deploy.sh status
./deploy/deploy.sh demo-status
./deploy/deploy.sh backup
./deploy/deploy.sh logs
```

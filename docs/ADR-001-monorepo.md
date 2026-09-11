# ADR-001: PNPM e limites de responsabilidade

O produto usa um monorepo PNPM: `apps/web` contém somente UI e chamadas REST; `apps/api` contém regras e persistência; `packages/shared` contém contratos sem regras de negócio. Isto mantém autorização, versionamento e geração de códigos exclusivamente no servidor.

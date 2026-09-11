FROM node:20-alpine AS build
WORKDIR /app
COPY . .
RUN corepack enable && corepack pnpm install --frozen-lockfile=false && corepack pnpm --filter @athena/api exec prisma generate && corepack pnpm --filter @athena/api build
# Esta imagem mantém o workspace compilado: os links internos do PNPM continuam válidos.
CMD ["sh", "backend/api/scripts/bootstrap-db.sh"]

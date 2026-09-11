FROM node:20-alpine AS build
WORKDIR /app
COPY . .
RUN corepack enable && corepack pnpm install --frozen-lockfile=false && corepack pnpm --filter @athena/web build
FROM nginx:1.27-alpine
COPY --from=build /app/frontend/dist /usr/share/nginx/html
COPY frontend/nginx.conf /etc/nginx/conf.d/default.conf

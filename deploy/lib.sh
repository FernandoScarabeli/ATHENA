#!/usr/bin/env sh
# Shared, non-interactive helpers for deploy/deploy.sh. This file is sourced.
set -eu

DEPLOY_ROOT="${DEPLOY_ROOT:-$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)}"
DEPLOY_BACKUP_DIR="${DEPLOY_BACKUP_DIR:-$DEPLOY_ROOT/deploy/backups}"
DEPLOY_RESET_HASH_FILE="${DEPLOY_RESET_HASH_FILE:-$DEPLOY_ROOT/deploy/.reset-db.sha256}"

if [ -f "$DEPLOY_ROOT/deploy/.env.deploy" ]; then
  set -a
  # shellcheck disable=SC1091
  . "$DEPLOY_ROOT/deploy/.env.deploy"
  set +a
fi

deploy_compose() {
  docker compose -f "$DEPLOY_ROOT/docker-compose.yml" "$@"
}

deploy_compose_dev() {
  docker compose -f "$DEPLOY_ROOT/docker-compose.yml" -f "$DEPLOY_ROOT/docker-compose.dev.yml" "$@"
}

deploy_require() {
  command -v "$1" >/dev/null 2>&1 || { printf 'Dependência ausente: %s\n' "$1" >&2; return 1; }
}

deploy_timestamp() {
  date '+%Y%m%d-%H%M%S'
}

deploy_backup_database() {
  deploy_require docker
  mkdir -p "$DEPLOY_BACKUP_DIR"
  backup_file="$DEPLOY_BACKUP_DIR/athena-$(deploy_timestamp).sql"
  printf 'Criando backup obrigatório: %s\n' "$backup_file" >&2
  (
    cd "$DEPLOY_ROOT"
    sh scripts/backup.sh "$backup_file"
  )
  [ -s "$backup_file" ] || { printf 'Backup falhou ou ficou vazio; operação cancelada.\n' >&2; return 1; }
  printf '%s\n' "$backup_file"
}

deploy_sha256() {
  if command -v sha256sum >/dev/null 2>&1; then
    printf '%s' "$1" | sha256sum | awk '{print $1}'
  elif command -v shasum >/dev/null 2>&1; then
    printf '%s' "$1" | shasum -a 256 | awk '{print $1}'
  else
    printf 'sha256sum ou shasum é necessário para proteger o reset.\n' >&2
    return 1
  fi
}

deploy_postgres_volume() {
  deploy_require node
  deploy_compose config --format json | node -e '
    let raw = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", chunk => { raw += chunk; });
    process.stdin.on("end", () => {
      try {
        const config = JSON.parse(raw);
        const volume = config.volumes && config.volumes.postgres_data && config.volumes.postgres_data.name;
        if (!volume || !/postgres_data$/.test(volume)) process.exit(1);
        process.stdout.write(volume);
      } catch { process.exit(1); }
    });
  '
}

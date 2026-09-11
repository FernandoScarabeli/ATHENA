#!/usr/bin/env sh
set -eu
test -n "${1:-}" || { echo "Uso: $0 arquivo.sql"; exit 1; }
docker compose exec -T postgres psql -U athena -d athena < "$1"

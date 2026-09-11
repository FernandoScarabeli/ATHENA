#!/usr/bin/env sh
set -eu
docker compose exec -T postgres pg_dump -U athena athena > "${1:-athena-backup.sql}"

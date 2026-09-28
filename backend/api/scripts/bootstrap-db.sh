#!/bin/sh
set -eu

SCRIPT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
API_DIR="$(CDPATH= cd -- "$SCRIPT_DIR/.." && pwd)"
REPO_ROOT="$(CDPATH= cd -- "$API_DIR/../.." && pwd)"
cd "$REPO_ROOT"

# Keep the generated Prisma client aligned with the schema in bind-mounted dev
# runs, then apply forward-only migrations before starting the API.
"$API_DIR/node_modules/.bin/prisma" generate \
  --schema="$API_DIR/prisma/schema.prisma"

# ATHENA installs only on a fresh database. `migrate deploy` deliberately exits
# non-zero on any failed migration so the API container never starts with a
# partially reconciled schema.
"$API_DIR/node_modules/.bin/prisma" migrate deploy \
  --schema="$API_DIR/prisma/schema.prisma"

# The production image calls this script without arguments. Development Compose
# passes Nest's watch command after the script so both modes use the same safe
# database bridge.
if [ "$#" -eq 0 ]; then
  set -- node "$API_DIR/.athena-build/main"
fi

cd "$API_DIR"
exec "$@"

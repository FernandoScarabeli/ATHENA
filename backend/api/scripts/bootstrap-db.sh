#!/bin/sh
set -eu

# ATHENA installs only on a fresh database. `migrate deploy` deliberately exits
# non-zero on any failed migration so the API container never starts with a
# partially reconciled schema.
./backend/api/node_modules/.bin/prisma migrate deploy \
  --schema=backend/api/prisma/schema.prisma

# The production image calls this script without arguments. Development Compose
# passes Nest's watch command after the script so both modes use the same safe
# database bridge.
if [ "$#" -eq 0 ]; then
  set -- node backend/api/dist/main
fi

exec "$@"

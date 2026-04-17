#!/bin/sh
set -e
if [ -z "${DATABASE_URL}" ]; then
  echo "DATABASE_URL est requis."
  exit 1
fi
npx prisma migrate deploy
exec node server.js

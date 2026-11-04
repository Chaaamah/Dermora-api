#!/bin/sh
set -e
# Synchronise le schéma au démarrage si demandé (ajouts uniquement : refuse toute perte de données).
if [ "$DB_PUSH_ON_START" = "true" ]; then
  npx prisma db push --skip-generate
fi
exec node dist/main.js

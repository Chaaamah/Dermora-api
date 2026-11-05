#!/bin/sh
set -e
# Connexion directe (Supabase « Session pooler », port 5432) : nécessaire à prisma db push.
# Si DIRECT_URL n'est pas définie, on se rabat sur DATABASE_URL au lieu d'échouer.
if [ -z "$DIRECT_URL" ]; then
  echo "DIRECT_URL absente : utilisation de DATABASE_URL (ajoutez DIRECT_URL dans l'environnement Render)."
  export DIRECT_URL="$DATABASE_URL"
fi
# Synchronise le schéma au démarrage si demandé (ajouts uniquement : refuse toute perte de données).
# Un échec de synchronisation n'empêche pas l'API de démarrer.
if [ "$DB_PUSH_ON_START" = "true" ]; then
  npx prisma db push --skip-generate || echo "Synchronisation du schéma impossible : vérifiez DIRECT_URL (port 5432). L'API démarre quand même."
fi
exec node dist/main.js

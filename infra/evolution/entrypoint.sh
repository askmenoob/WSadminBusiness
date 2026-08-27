#!/bin/sh
set -eu
read_secret(){ name="$1"; file="$2"; [ -r "$file" ] || { echo "missing secret $name" >&2; exit 1; }; value="$(cat "$file")"; [ -n "$value" ] || { echo "empty secret $name" >&2; exit 1; }; printf '%s' "$value"; }
api_key="$(read_secret AUTHENTICATION_API_KEY_FILE "$AUTHENTICATION_API_KEY_FILE")"
db_password="$(read_secret EVOLUTION_POSTGRES_PASSWORD_FILE "$EVOLUTION_POSTGRES_PASSWORD_FILE")"
redis_password="$(read_secret EVOLUTION_REDIS_PASSWORD_FILE "$EVOLUTION_REDIS_PASSWORD_FILE")"
export AUTHENTICATION_API_KEY="$api_key"
export DATABASE_CONNECTION_URI="postgresql://evolution:${db_password}@evolution-postgres:5432/evolution?schema=evolution_api"
export CACHE_REDIS_URI="redis://:${redis_password}@evolution-redis:6379/0"
unset api_key db_password redis_password
exec /bin/bash -c '. ./Docker/scripts/deploy_database.sh && npm run start:prod'

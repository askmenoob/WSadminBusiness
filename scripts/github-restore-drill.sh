#!/usr/bin/env bash
set -euo pipefail
ROOT=$(pwd); set -a; source "$ROOT/.env"; set +a
TMP=$(mktemp -d /tmp/wsadmin-business-github-restore.XXXXXX); DB="wsb_github_restore_$(date +%s)_$$"
cleanup(){ cd "$ROOT"; docker compose exec -T db dropdb -U "$POSTGRES_USER" --if-exists "$DB" >/dev/null 2>&1 || true; rm -rf "$TMP"; }
trap cleanup EXIT
gh repo clone askmenoob/WSadminBusiness "$TMP/repo" -- --branch dev --single-branch >/dev/null
cd "$TMP/repo"
REMOTE=$(git ls-remote origin refs/heads/dev | cut -f1); LOCAL=$(git rev-parse HEAD); test "$LOCAL" = "$REMOTE"
npm ci --ignore-scripts --no-audit --no-fund >/dev/null
cd "$ROOT"; docker compose exec -T db createdb -U "$POSTGRES_USER" "$DB"; cd "$TMP/repo"
export DATABASE_URL="postgresql://${POSTGRES_USER}:${POSTGRES_PASSWORD}@127.0.0.1:55432/${DB}"
npm run db:migrate >/dev/null
npm run check >/dev/null
npm run build >/dev/null
cd "$ROOT"; COUNT=$(docker compose exec -T db psql -U "$POSTGRES_USER" -d "$DB" -Atc 'select count(*) from wsb_schema_migrations'); cd "$TMP/repo"
test "$COUNT" -ge 38
printf 'GITHUB_RESTORE_PASS sha=%s migrations=%s clean_checkout=%s\n' "$LOCAL" "$COUNT" "$(test -z "$(git status --porcelain)" && echo true || echo false)"

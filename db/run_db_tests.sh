#!/usr/bin/env bash
# Runs db/tests/*.sql against a throwaway schema in the DEVELOPMENT database.
# Never point this at production. Usage: npm run test:db  (calls this script)
set -euo pipefail
: "${DATABASE_URL:?DATABASE_URL not set}"
if [[ "${APP_ENV:-development}" == "production" ]]; then echo "Refusing to run DB tests in production"; exit 1; fi
DIR="$(cd "$(dirname "$0")" && pwd)"
SCHEMA="test_$(date +%s)_$RANDOM"
cleanup() { psql "$DATABASE_URL" -q -c "set client_min_messages to warning; drop schema if exists $SCHEMA cascade" >/dev/null; }
trap cleanup EXIT
psql "$DATABASE_URL" -q -v ON_ERROR_STOP=1 -c "create schema $SCHEMA"
export PGOPTIONS="-c search_path=$SCHEMA"
psql "$DATABASE_URL" -q -v ON_ERROR_STOP=1 -f "$DIR/schema.sql"
for f in "$DIR"/migrations/0*.sql; do
  [[ -e "$f" ]] || continue
  [[ "$(basename "$f")" == "0001_schema.sql" ]] && continue   # identical to schema.sql
  psql "$DATABASE_URL" -q -v ON_ERROR_STOP=1 -f "$f"
done
fail=0
for t in "$DIR"/tests/*.sql; do
  if out=$(psql "$DATABASE_URL" -q -v ON_ERROR_STOP=1 -f "$t" 2>&1); then
    echo "$out" | grep -o "[0-9a-z_]*: PASS" || echo "ok: $(basename "$t")"
  else
    echo "FAILED: $(basename "$t")"; echo "$out" | tail -5; fail=1
  fi
done
[[ $fail -eq 0 ]] && echo "DB tests: all files passed" || { echo "DB tests: FAILURES"; exit 1; }

#!/usr/bin/env bash
# Applies db/migrations/*.sql in filename order, once each.
# Applied files are recorded in the schema_migrations table, so the script can be
# run on every deploy.
#
#   DATABASE_URL=postgres://user:pass@host:5432/db bash scripts/migrate.sh
#
# SKIP_SEED=true   skips files with "seed" in the name (use this in production).
# MIGRATIONS_DIR   overrides the folder to read migrations from.
set -euo pipefail

: "${DATABASE_URL:?DATABASE_URL is required}"
MIGRATIONS_DIR="${MIGRATIONS_DIR:-$(cd "$(dirname "$0")/.." && pwd)/db/migrations}"
SKIP_SEED="${SKIP_SEED:-false}"

run_sql() {
  PGOPTIONS="--client-min-messages=warning" psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -q -X "$@"
}

run_sql -c "CREATE TABLE IF NOT EXISTS schema_migrations (
              filename    text PRIMARY KEY,
              applied_at  timestamptz NOT NULL DEFAULT now()
            )"

shopt -s nullglob
files=("$MIGRATIONS_DIR"/*.sql)
if [ ${#files[@]} -eq 0 ]; then
  echo "No migration files found in $MIGRATIONS_DIR" >&2
  exit 1
fi

for file in "${files[@]}"; do
  name="$(basename "$file")"

  if [[ "$SKIP_SEED" == "true" && "$name" == *seed* ]]; then
    echo "skip   $name (seed data, SKIP_SEED=true)"
    continue
  fi

  already="$(run_sql -At -v name="$name" <<'SQL'
SELECT 1 FROM schema_migrations WHERE filename = :'name';
SQL
)"
  if [[ "$already" == "1" ]]; then
    echo "ok     $name (already applied)"
    continue
  fi

  echo "apply  $name"
  run_sql -f "$file"
  run_sql -v name="$name" <<'SQL'
INSERT INTO schema_migrations (filename) VALUES (:'name');
SQL
done

echo "Migrations up to date."

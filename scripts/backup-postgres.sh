#!/usr/bin/env bash
# Daily compressed snapshot of the AKAZ Sports Hub database, with retention.
#
#   DATABASE_URL=postgres://user:pass@host:5432/db bash scripts/backup-postgres.sh
#
# Settings (all optional):
#   BACKUP_DIR      where snapshots are kept           (default /var/backups/akaz)
#   RETENTION_DAYS  snapshots older than this are deleted (default 14)
#   PG_DUMP         path to pg_dump                    (default: found on PATH)
#
# Snapshots are pg_dump's custom format (-Fc), which is compressed and restores
# selectively:
#
#   pg_restore --clean --if-exists -d "$DATABASE_URL" akaz-20261119T0200Z.dump
#
# Install as a daily cron job (02:00 host time), keeping a log:
#
#   0 2 * * * DATABASE_URL=postgres://... /opt/akaz/scripts/backup-postgres.sh \
#               >> /var/log/akaz-backup.log 2>&1
#
# The script exits non-zero on any failure, so cron reports it. Keep a copy of
# these snapshots off the host: a backup on the same disk as the database is not
# a backup.
set -euo pipefail

: "${DATABASE_URL:?DATABASE_URL is required}"
BACKUP_DIR="${BACKUP_DIR:-/var/backups/akaz}"
RETENTION_DAYS="${RETENTION_DAYS:-14}"
PG_DUMP="${PG_DUMP:-pg_dump}"

log() { printf '%s  %s\n' "$(date -u '+%Y-%m-%dT%H:%M:%SZ')" "$*"; }
die() { log "FAILED: $*" >&2; exit 1; }

command -v "$PG_DUMP" >/dev/null 2>&1 || die "$PG_DUMP not found. Install postgresql-client."
command -v pg_restore  >/dev/null 2>&1 || die "pg_restore not found. Install postgresql-client."

mkdir -p "$BACKUP_DIR"
chmod 700 "$BACKUP_DIR"   # dumps hold every booking and payment record

stamp="$(date -u '+%Y%m%dT%H%M%SZ')"
final="$BACKUP_DIR/akaz-$stamp.dump"
# Dump to a partial name first and rename only once the file is known good, so a
# dump cut short by a full disk or a restart can never be mistaken for a backup.
partial="$final.partial"
trap 'rm -f "$partial"' EXIT

log "dumping to $final"
"$PG_DUMP" "$DATABASE_URL" \
  --format=custom \
  --compress=9 \
  --no-owner \
  --no-privileges \
  --file="$partial" \
  || die "pg_dump exited non-zero"

# A dump that pg_restore cannot read is worthless; find that out now, not during
# an emergency.
pg_restore --list "$partial" >/dev/null 2>&1 || die "dump is unreadable by pg_restore"

size="$(du -h "$partial" | cut -f1)"
mv "$partial" "$final"
chmod 600 "$final"
trap - EXIT
log "wrote $final ($size)"

# Retention. -mtime +N is "older than N days"; with RETENTION_DAYS=14 the
# snapshot taken a fortnight ago is the last one kept.
removed=0
while IFS= read -r -d '' old; do
  rm -f "$old"
  log "removed $(basename "$old")"
  removed=$((removed + 1))
done < <(find "$BACKUP_DIR" -maxdepth 1 -name 'akaz-*.dump' -type f -mtime "+$RETENTION_DAYS" -print0)

# Clean up partials abandoned by an earlier crashed run.
find "$BACKUP_DIR" -maxdepth 1 -name 'akaz-*.dump.partial' -type f -mtime +1 -delete

kept="$(find "$BACKUP_DIR" -maxdepth 1 -name 'akaz-*.dump' -type f | wc -l | tr -d ' ')"
log "done — $kept snapshot(s) kept, $removed removed (retention ${RETENTION_DAYS}d)"

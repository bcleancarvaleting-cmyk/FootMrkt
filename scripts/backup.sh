#!/usr/bin/env bash
# Nightly database backup. Keeps 14 daily and 8 weekly (Sunday) copies.
#   DATABASE_URL=postgres://… BACKUP_DIR=/backups scripts/backup.sh
# Restore a copy:  pg_restore --clean --if-exists -d "$DATABASE_URL" /backups/daily/matchx-YYYY-MM-DD.dump
set -euo pipefail
: "${DATABASE_URL:?set DATABASE_URL}"
DIR="${BACKUP_DIR:-./backups}"
URL="${DATABASE_URL%%\?*}" # pg_dump doesn't understand Prisma's ?schema= parameter
mkdir -p "$DIR/daily" "$DIR/weekly"
STAMP=$(date -u +%F)
OUT="$DIR/daily/matchx-$STAMP.dump"
pg_dump --format=custom --no-owner --no-privileges "$URL" > "$OUT.tmp"
mv "$OUT.tmp" "$OUT"
# A backup that can't be read is no backup: list its contents to prove it opens.
pg_restore --list "$OUT" > /dev/null
if [ "$(date -u +%u)" = "7" ]; then cp "$OUT" "$DIR/weekly/"; fi
prune() { find "$1" -name '*.dump' -printf '%T@ %p\n' | sort -rn | tail -n +"$2" | cut -d' ' -f2- | xargs -r rm --; }
prune "$DIR/daily" 15
prune "$DIR/weekly" 9
echo "backup ok: $OUT ($(du -h "$OUT" | cut -f1))"
# Optional off-site copy, e.g.:  aws s3 cp "$OUT" "s3://your-bucket/matchx/"  or  rclone copy "$OUT" remote:matchx

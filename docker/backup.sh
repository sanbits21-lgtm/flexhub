#!/bin/bash
# Backs up the database and the member photos once a day, keeps the last N days, and tells you plainly when something fails.
#   backup.sh        runs forever: a backup at BACKUP_HOUR (server time) every day
#   backup.sh once   one backup right now, then exit (for testing, or before an upgrade)
# Files go to /backups (the BACKUP_DIR folder on the host). Copy that folder OFF this server too: a backup on the same disk
# does not survive the disk. See docs/VPS.md.
set -uo pipefail

KEEP_DAYS="${BACKUP_KEEP_DAYS:-14}"
HOUR="${BACKUP_HOUR:-2}"

run_backup() {
  local stamp; stamp="$(date +%Y-%m-%d_%H%M)"
  local db="/backups/db-${stamp}.gz" photos="/backups/photos-${stamp}.tgz"
  echo "[backup] $(date -Is) starting"

  if mongodump --uri="$MONGODB_URI" --gzip --archive="$db" --quiet && [ -s "$db" ]; then
    echo "[backup] database saved: $db ($(du -h "$db" | cut -f1))"
  else
    echo "[backup] FAILED: the database backup did not complete" >&2; rm -f "$db"; return 1
  fi

  if [ -d /data/uploads ] && tar -czf "$photos" -C /data uploads 2>/dev/null; then
    echo "[backup] photos saved: $photos ($(du -h "$photos" | cut -f1))"
  else
    echo "[backup] WARNING: the photos backup did not complete" >&2; rm -f "$photos"
  fi

  find /backups -maxdepth 1 \( -name 'db-*.gz' -o -name 'photos-*.tgz' \) -mtime +"$KEEP_DAYS" -print -delete | sed 's/^/[backup] removed old: /'
  date -Is > /backups/LAST_OK
  echo "[backup] done"
}

if [ "${1:-}" = "once" ]; then run_backup; exit $?; fi

while true; do
  now=$(date +%s)
  next=$(date -d "today ${HOUR}:00" +%s)
  [ "$next" -le "$now" ] && next=$(date -d "tomorrow ${HOUR}:00" +%s)
  echo "[backup] next backup at $(date -d "@$next" -Is)"
  sleep $((next - now))
  run_backup || echo "[backup] will try again tomorrow" >&2
done

#!/bin/sh
# Daily backup sidecar: dump the database + tar the uploaded files into /backups
# (mounted to your Desktop), then prune anything older than the retention window.
#
# Runs once at startup, then every 24h. Not anchored to a wall-clock hour — for a
# single clinic the exact minute doesn't matter; if a fixed quiet hour ever does,
# replace this with a cron/launchd timer on the host.
set -eu

BACKUP_DIR=/backups
MINIO_DIR=/minio-data
RET="${DB_BACKUP_RETENTION_PERIOD:-14}"
DB_HOST="${POSTGRES_HOST:-db}"
DB_PORT="${POSTGRES_PORT:-5432}"
DB_USER="${POSTGRES_USER:-postgres}"
DB_NAME="${POSTGRES_DB:-care}"
export PGPASSWORD="${POSTGRES_PASSWORD:-postgres}"

run_backup() {
	ts=$(date +%Y%m%d-%H%M%S)
	echo "[backup] $ts pg_dump $DB_NAME"
	pg_dump -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -Fc \
		-f "$BACKUP_DIR/care-$ts.dump"
	if [ -d "$MINIO_DIR" ]; then
		echo "[backup] $ts tar uploaded files"
		tar -czf "$BACKUP_DIR/files-$ts.tar.gz" -C "$MINIO_DIR" . 2>/dev/null || true
	fi
	find "$BACKUP_DIR" -name 'care-*.dump' -mtime +"$RET" -delete 2>/dev/null || true
	find "$BACKUP_DIR" -name 'files-*.tar.gz' -mtime +"$RET" -delete 2>/dev/null || true
	echo "[backup] done (kept ${RET} days)"
}

echo "[backup] sidecar started; backups → Desktop (retention ${RET}d)"
while true; do
	run_backup || echo "[backup] FAILED — will retry next cycle"
	sleep 86400
done

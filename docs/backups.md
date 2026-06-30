# Backups & restore

CARE Clinic backs up **automatically, every day**, with no setup. This page covers
where backups go, how to restore them, and how to keep them safe.

---

## What's backed up

A dedicated `backup` container runs continuously and, every 24 hours (and once at
startup), writes **two files** with a timestamp:

| File | Contents |
|---|---|
| `care-<timestamp>.dump` | the full PostgreSQL database (patient records, users, everything) — `pg_dump -Fc` |
| `files-<timestamp>.tar.gz` | the uploaded files from MinIO (X-rays, documents, logos) |

Both are needed for a full restore — the database alone won't bring back an X-ray.

> On-demand: click **Backup now** in the app, or run `care backup-now`. That writes
> an immediate `care-manual-<timestamp>.dump`.

---

## Where they go

- **Default:** `~/Desktop/care-db-backups/`
- **Chosen:** whatever folder you picked in the installer's "Backup location" step
  (or `BACKUP_DIR` for the CLI).

**Retention:** controlled by `DB_BACKUP_RETENTION_PERIOD` in `backend.env` (default
**14** days). Older `care-*.dump` and `files-*.tar.gz` are pruned automatically.

> ⚠️ **Put backups on a separate drive.** Point the backup folder at a **USB or
> external drive** (or copy it there regularly). If the server's disk dies, backups
> on that same disk die with it. The backup *and* the data being on one disk is not a
> backup — it's a single point of failure.

---

## Restore the database

Stop the app first so nothing is writing, then drop + recreate + restore:

```bash
care stop && docker compose -p care-clinic up -d db

docker compose -p care-clinic exec -T db psql -U postgres -c "DROP DATABASE IF EXISTS care;"
docker compose -p care-clinic exec -T db psql -U postgres -c "CREATE DATABASE care;"

cat ~/Desktop/care-db-backups/care-YYYYMMDD-HHMMSS.dump | \
  docker compose -p care-clinic exec -T db pg_restore -U postgres -d care

care start
```

Replace the dump filename with the one you want to restore.

---

## Restore uploaded files

The `files-<timestamp>.tar.gz` archive holds the MinIO data. Restore it into the
MinIO volume with a throwaway Alpine container (which has `tar`), while the stack is
stopped:

```bash
care stop
docker run --rm \
  -v care-clinic_minio-data:/data \
  -v ~/Desktop/care-db-backups:/backup \
  alpine sh -c 'cd /data && tar -xzf /backup/files-YYYYMMDD-HHMMSS.tar.gz'
care start
```

- `care-clinic_minio-data` is the Docker volume (project name `care-clinic` + volume `minio-data`).
- Point the second `-v` at your actual backup folder if it isn't the Desktop default.

> Match the **database** dump and the **files** archive from the **same timestamp**
> for a consistent restore.

---

## Moving the whole clinic to a new computer

1. On the old server: take a fresh backup (**Backup now**), copy the backup folder to a USB.
2. On the new server: install CARE Clinic (it builds a fresh, empty stack).
3. `care stop`, then restore the database and files as above from the USB.
4. `care start`.

Because patient data lives in the Docker **volumes** (captured by the backups), this
moves everything — records and files — to the new box.

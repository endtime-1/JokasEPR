# Jokas ERP — Backup & Recovery

This describes the actual backup and disaster-recovery setup running in production on Hostinger. For the full deployment architecture (Worker-thread process supervision, the deploy pipeline, migrations), see [docs/deployment/README.md](deployment/README.md) — this document only covers backup/restore.

**There is no cron on this Hostinger plan.** Everything below that looks cron-like is a script written to disk by the deploy pipeline and triggered by polling inside `start.js`, not by the system crontab. If you're used to a `systemctl`/`crontab -l`/S3 world, none of that applies here — read this document as-is rather than assuming standard-VPS conventions.

---

## What gets backed up, and how

### Database — daily, automatic

- **Script:** `~/jokas-db-backup.sh`, written on the server by `setup-backup-crons.sh` (run over SSH by the deploy pipeline's last step, `.github/workflows/deploy.yml`'s "Setup backup crons").
- **Trigger:** `start.js`'s `checkDailyBackup()` polls every 15 minutes and fires the script once per day, during the 02:00 hour, if that day's output file doesn't already exist. This makes it idempotent against `start.js` itself restarting near 2am, and requires no cron.
- **Method:** `mysqldump --single-transaction --routines <dbname>` to a temp file, then gzip **only if** the dump succeeded (`$?` checked) and the temp file is non-empty. This matters: an earlier version piped straight into gzip and reported success even when `mysqldump` silently produced nothing (hit live 2026-08-06 — the database name wasn't being read correctly from the credentials file, and the resulting empty gzip was treated as a valid backup with no error). Failures now land in `~/jokas-db-backups/backup-error.log` instead of vanishing.
- **Location:** `~/jokas-db-backups/db-YYYYMMDD.sql.gz`
- **Retention:** 7 days, pruned by the same script (`find ... -mtime +7 -delete`).

### Uploaded files — daily, automatic

- **Script:** `~/jokas-files-backup.sh`, also written by `setup-backup-crons.sh`.
- **Trigger:** `start.js`'s `checkDailyFilesBackup()`, same polling pattern as the DB backup.
- **What:** `apps/api/uploads/` — employee photos, HR documents, product images. This is the only production data that lives outside MySQL; a normal deploy never deletes it (extraction uses `tar -xzf ... -C <staging>` plus an explicit copy-forward into the new directory before the atomic swap — see the deployment guide), but a bad manual change or disk-level fault would previously have had zero recovery path.
- **Location:** `~/jokas-files-backups/files-YYYYMMDD.tar.gz`
- **Retention:** 7 days.

### Pre-deploy snapshot — every deploy, in addition to the daily backup

Independent of the two above: the "Run database migrations" step in the deploy pipeline takes its own `mysqldump` snapshot immediately before running any pending migration, and **aborts the deploy before touching the schema** if that snapshot itself fails. This is a short-lived, deploy-scoped safety net (5 most recent kept) distinct from the daily 7-day-retention backup — it exists specifically so that "the migration broke something" always has a snapshot taken *seconds* before the break, not up to 24 hours before it.

- **Location:** `~/jokas-db-backups/pre-deploy-<timestamp>.sql.gz`

---

## Verifying a backup actually restores

A backup that's never been restored is a guess, not a backup. `scripts/verify-backup-restore.sh` runs the real restore path without touching production data:

```bash
ssh -p 65002 user@host
cd ~/domains/jokasfarms.com/nodejs
./scripts/verify-backup-restore.sh                      # uses the most recent db-*.sql.gz
./scripts/verify-backup-restore.sh path/to/specific.sql.gz
```

What it does:
1. Verifies gzip integrity (`gzip -t`) and that the file isn't suspiciously small.
2. Creates a disposable scratch database (`<dbname>_restoretest`) on the **same** MySQL instance — same credentials, no new grants needed.
3. Restores the backup into the scratch database.
4. Compares row counts on a few core tables (`User`, `Employee`, `InventoryItem`, `SalesOrder`) between the scratch database and the live one. Restored counts trailing live counts by however old the backup is is expected; **zero everywhere** is the actual failure signal.
5. Drops the scratch database.
6. As a bonus check, verifies the latest uploaded-files backup is a valid tar archive (integrity check only — it deliberately does not untar into place, since that would risk clobbering live uploads).

Run this periodically (monthly is a reasonable cadence) — it is intentionally **not** wired into CI, since restoring a 30MB+ dump on every push isn't worth the CI time or host load.

**Known constraint on this hosting plan:** some Hostinger MySQL users are confined to specific pre-provisioned databases and lack `CREATE DATABASE` privilege outright. If step 2 fails with an access-denied error, the script says so explicitly and gives two options: create the scratch database once via hPanel's database manager and grant the app's DB user access to it, or ask Hostinger support to grant `CREATE DATABASE`.

---

## Restoring in a real incident

**Restoring the database (from either the daily backup or a pre-deploy snapshot):**

```bash
ssh -p 65002 user@host
gunzip -c ~/jokas-db-backups/db-YYYYMMDD.sql.gz | mysql --defaults-file=~/.jokas-backup.cnf <dbname>
```

`~/.jokas-backup.cnf` (written by `setup-backup-crons.sh`, `chmod 600`) already has the right host/user/password/database — the same file the backup and restore-drill scripts use, so there's no need to re-derive credentials from `DATABASE_URL` by hand.

**Restoring uploaded files:**

```bash
tar -xzf ~/jokas-files-backups/files-YYYYMMDD.tar.gz -C ~/domains/jokasfarms.com/nodejs/apps/api/uploads/
```

**Restoring the application code** (if a bad deploy needs manual recovery beyond what the pipeline's own auto-rollback handled):

```bash
rsync -a --delete ~/domains/jokasfarms.com/nodejs_prev/ ~/domains/jokasfarms.com/nodejs/
mkdir -p ~/domains/jokasfarms.com/nodejs/tmp
touch ~/domains/jokasfarms.com/nodejs/tmp/restart.txt
```

`nodejs_prev` is a hardlinked snapshot of the previous deploy, refreshed by the pipeline's "Backup current deploy" step immediately before every extraction — this is exactly what the pipeline's own automatic rollback does on a failed smoke test, and is safe to run by hand if a problem surfaces after the smoke test already passed.

**Important:** application-code rollback and database restore are two separate, independent operations. If a migration partially applied before failing (MySQL DDL auto-commits per statement, so this is possible), restoring old code against a schema that's moved forward can be just as broken as the original failure — check schema state before assuming a code-only rollback fixed things. The migration step's own failure output in the GitHub Actions log always names the exact pre-deploy snapshot to restore from if this happens.

---

## Recovery scenario checklist

| Scenario | Action |
|---|---|
| Bad deploy, smoke test failed | Pipeline auto-rolls-back code automatically (`nodejs_prev` → `nodejs`, 3 retries). No action needed unless the rollback itself failed — the job log says so explicitly if it did. |
| Bad deploy, smoke test passed but something's still wrong | Manual code rollback (above), then check whether a migration ran — if so, verify/restore schema state too. |
| Migration failed mid-deploy | Read the migration step's failure output for the exact pre-deploy snapshot filename. Restore it if the partially-applied schema is causing problems. |
| Data corruption / accidental deletion, no bad deploy involved | Restore from the most recent `db-*.sql.gz` (up to 24h old) or `files-*.tar.gz`, following the restore commands above. |
| Uploads directory lost/corrupted | Restore from the most recent `files-*.tar.gz`. |
| Want to confirm backups actually work before you need them | Run `scripts/verify-backup-restore.sh`. Do this periodically, not just once. |

---

## What this setup deliberately does not do

- **No off-site/S3 copy.** Backups live on the same Hostinger account as the data they're backing up — they protect against bad deploys, bad migrations, and accidental deletion, but not against total account loss. If that risk matters more than the setup cost, periodically `rsync`/`scp` `~/jokas-db-backups` and `~/jokas-files-backups` to somewhere off Hostinger.
- **No point-in-time recovery.** Backups are daily snapshots (plus per-deploy snapshots), not continuous binlog-based replication — recovery granularity is "as of the last snapshot," not "as of any given second."
- **No automated restore-drill in CI** — by design, see above.

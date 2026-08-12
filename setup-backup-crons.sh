#!/bin/bash
# Writes the daily DB + uploaded-files backup scripts. Run by the deploy
# workflow's "Setup backup crons" step over SSH (via `bash
# setup-backup-crons.sh`), with DATABASE_URL passed through as an env var.
#
# H27/H28/H29/H30 (2026-08-11): this used to be embedded directly in
# deploy.yml's ssh-action `script:` block. Three different rewrites there
# (an escaped-string one-liner, a heredoc, a single-quoted multi-line printf
# argument) all failed identically under appleboy/ssh-action's drone-ssh
# transport — dies silently right after the first echo, immediately before
# a multi-line if/else block, zero further output, regardless of exactly
# how the file-writing part was quoted. The Patch-DATABASE_URL and Run-
# migrations steps use comparable multi-line if/then constructs and always
# succeeded, so it wasn't purely "multi-line if breaks it" either — the
# exact transport quirk was never conclusively isolated. Moved the whole
# thing into a real file instead, shipped via the same rsync upload that
# reliably moves the ~850MB deploy tarball — the ssh-action step now just
# runs `bash setup-backup-crons.sh`, a single trivial line, sidestepping
# whatever drone-ssh does with longer/more complex inline scripts entirely.
#
# This host has no cron/scheduled-tasks feature at all (see
# feedback_no_cron_on_host memory) — the scripts this writes run via
# start.js's checkDailyBackup()/checkDailyFilesBackup() polling, not cron.
set -u

# H-INFRA-7: umask restricts every file this script creates (the credentials
# file below, and the generated backup scripts) to owner-only from the moment
# of creation, closing the write-then-chmod race window a `chmod` call after
# the fact leaves open. The explicit `chmod 600`/`chmod +x` calls below still
# run too — this makes them redundant rather than load-bearing, not wrong.
umask 077

echo "=== DB backup cron ==="
if [ -z "${DATABASE_URL:-}" ]; then
  echo "WARNING: DATABASE_URL not set — skipping DB backup setup"
else
  _u="${DATABASE_URL#mysql://}"
  DB_USER="${_u%%:*}"
  _ap="${_u#*:}"
  DB_PASS="${_ap%@*}"
  _hp="${_ap##*@}"
  DB_HOST="${_hp%%[:/*]*}"
  _ah="${_hp#"$DB_HOST"}"
  case "$_ah" in :*) DB_PORT="${_ah#:}"; DB_PORT="${DB_PORT%%/*}" ;; *) DB_PORT="3306" ;; esac
  DB_NAME="${_hp#*/}"; DB_NAME="${DB_NAME%%[?#]*}"

  # Write a persistent credentials file for the backup cron
  printf '[client]\nhost=%s\nport=%s\nuser=%s\npassword=%s\ndatabase=%s\n' \
    "$DB_HOST" "$DB_PORT" "$DB_USER" "$DB_PASS" "$DB_NAME" > "$HOME/.jokas-backup.cnf"
  chmod 600 "$HOME/.jokas-backup.cnf"
  mkdir -p "$HOME/jokas-db-backups"

  # Daily backup at 2:00 AM, keep last 7 dumps (~30 MB each gzipped).
  # IMPORTANT: mysqldump does NOT read `database=` from a [client]
  # option-file the way the `mysql` CLI does — it treats the option name
  # as an ambiguous prefix of `--databases` and ignores it with just a
  # warning. Confirmed live 2026-08-06: without the db name passed as a
  # plain argument, mysqldump silently dumped nothing, and because the
  # old version piped straight into gzip with `2>/dev/null` and no
  # pipefail, the pipeline still reported success — a ~20-byte (empty)
  # gzip file was silently treated as a valid daily backup for who knows
  # how long. Fixed by (1) passing $DB_NAME explicitly, and (2) dumping
  # to a temp file first so mysqldump's own exit code and a non-empty-
  # file check gate whether gzip/rotation run at all — failures now land
  # in backup-error.log instead of vanishing.
  printf '%s\n' '#!/bin/bash
mysqldump --defaults-file=$HOME/.jokas-backup.cnf --single-transaction --routines __DB_NAME__ > $HOME/jokas-db-backups/.tmp-dump.sql 2>$HOME/jokas-db-backups/backup-error.log
if [ $? -eq 0 ] && [ -s $HOME/jokas-db-backups/.tmp-dump.sql ]; then
  gzip -c $HOME/jokas-db-backups/.tmp-dump.sql > $HOME/jokas-db-backups/db-$(date +%Y%m%d).sql.gz
  rm -f $HOME/jokas-db-backups/.tmp-dump.sql $HOME/jokas-db-backups/backup-error.log
  find $HOME/jokas-db-backups -name "db-*.sql.gz" -mtime +7 -delete
else
  echo "$(date): mysqldump failed or produced empty output" >> $HOME/jokas-db-backups/backup-error.log
fi' > "$HOME/jokas-db-backup.sh"
  # H-INFRA-5 (2026-08-11): a DB name containing "/" breaks this sed command's
  # own delimiter outright (non-zero exit, caught below); one containing "&"
  # is silently treated as "insert the matched text" in sed's replacement
  # syntax, producing a corrupted-but-successful (exit 0) substitution — sed's
  # own exit code alone can't catch that case. Explicitly verify the
  # placeholder is actually gone afterward. On either failure, remove the
  # broken script rather than leaving it in place: start.js's
  # checkDailyBackup() only fires if the file exists, so deleting it means
  # tonight's backup silently no-ops instead of running a corrupted dump
  # command — and this error is visible right here in the deploy log instead
  # of only discoverable at 2am in a backup-error.log nobody is watching.
  if ! sed -i "s/__DB_NAME__/$DB_NAME/" "$HOME/jokas-db-backup.sh" || grep -q "__DB_NAME__" "$HOME/jokas-db-backup.sh"; then
    echo "ERROR: failed to substitute DB name into jokas-db-backup.sh (DB_NAME='$DB_NAME') — removing the broken script so it doesn't run tonight. Investigate the database name for unusual characters and re-run this step."
    rm -f "$HOME/jokas-db-backup.sh"
  else
    chmod +x "$HOME/jokas-db-backup.sh"
    echo "Database backup script written (runs daily ~02:00 via start.js's checkDailyBackup())."
  fi
fi

echo "=== Uploaded-files backup cron ==="
# C8: apps/api/main.ts creates its upload dir at process.cwd()/uploads —
# the API runs as a Worker thread inside start.js (api-worker-wrapper.js
# overrides process.cwd() to apps/api, since Worker threads have no
# spawn-style cwd option), so the real, always-used path in production is
# $APP_DIR/apps/api/uploads (employee photos, HR documents, product
# images). It happens to survive normal deploys today only because
# "Extract files to APP_DIR" uses `tar -xzf ... -C "$APP_DIR"`
# (extraction never deletes files absent from the archive, unlike rsync
# --delete) — but there was zero backup of it, so disk corruption or an
# accidental delete would lose it permanently with no recovery path,
# unlike the database which has a daily dump.
mkdir -p "$HOME/jokas-files-backups"
printf '%s\n' '#!/bin/bash
UPLOADS_DIR=$HOME/domains/jokasfarms.com/nodejs/apps/api/uploads
if [ -d "$UPLOADS_DIR" ] && [ -n "$(ls -A "$UPLOADS_DIR" 2>/dev/null)" ]; then
  tar -czf $HOME/jokas-files-backups/.tmp-files.tar.gz -C "$UPLOADS_DIR" . 2>$HOME/jokas-files-backups/backup-error.log
  mv $HOME/jokas-files-backups/.tmp-files.tar.gz $HOME/jokas-files-backups/files-$(date +%Y%m%d).tar.gz
  find $HOME/jokas-files-backups -name "files-*.tar.gz" -mtime +7 -delete
else
  echo "$(date): uploads dir missing or empty, nothing to back up" >> $HOME/jokas-files-backups/backup-error.log
fi' > "$HOME/jokas-files-backup.sh"
chmod +x "$HOME/jokas-files-backup.sh"
echo "Uploaded-files backup script written (runs daily ~02:00 via start.js's checkDailyFilesBackup())."

# Jokas ERP — Production Deployment Guide

Jokas ERP runs in production on **Hostinger shared hosting** (Node.js via Passenger), with **MySQL** as the database. There is no Docker, no VPS, no AWS, and no cron in production — this guide describes what's actually running, not a hypothetical alternative stack.

(`infra/docker/`, `infra/nginx/`, `infra/postgres/`, and `docker-compose.prod.yml` are leftovers from an earlier deployment path that was designed but never used in production. Ignore them for anything below.)

---

## Architecture

```
GitHub Actions (on push to main)
  ├─ Job 1 "build" (ubuntu-latest): lint, typecheck, unit tests, API e2e tests,
  │    build API/Web/Storefront, bundle into deploy.tar.gz, upload as an artifact
  └─ Job 2 "deploy" (ubuntu-latest, orchestrates over SSH — NOT a self-hosted
       runner): rsync the tarball to Hostinger, back up the current deploy,
       atomically swap in the new one, run migrations, restart, smoke-test,
       auto-rollback on failure

Hostinger (jokasfarms.com)
  Passenger supervises a single Node.js entry point: start.js
    ├─ Web        (Next.js)        — Worker thread, wrapped by web-worker-wrapper.js
    ├─ Storefront (Next.js)        — Worker thread, wrapped by storefront-worker-wrapper.js
    └─ API        (NestJS)         — Worker thread, wrapped by api-worker-wrapper.js
  start.js also runs:
    - a self-ping loop (prevents Hostinger from hibernating an idle app)
    - checkDailyBackup() / checkDailyFilesBackup() (poll-based backup trigger — see "Backups")
    - checkCiRunner() (keeps the self-hosted CI runner process alive, if configured)
    - the /__status diagnostic endpoint

MySQL — Hostinger-managed, same account as the app, no separate host to provision
```

### Why Worker threads, not child processes

Hostinger kills any process spawned via `child_process.spawn()` after roughly 30 seconds, regardless of memory usage — confirmed by direct observation in production. Worker threads share the parent process's PID and are exempt from this. `start.js` runs Web, Storefront, and API each as a Worker thread rather than a spawned child process specifically to avoid this kill. Each has a thin wrapper file (`web-worker-wrapper.js`, `storefront-worker-wrapper.js`, `api-worker-wrapper.js`) that:
- intercepts `process.exit()` and converts it to a `postMessage` back to the parent instead of tearing down the whole `start.js` process,
- forwards `stdout`/`stderr` to the parent via `parentPort` so they show up in the `/__status` diagnostic buffers,
- for the API specifically, overrides `process.cwd()` to `apps/api` — several controllers resolve their uploads directory from `process.cwd()`, and Worker threads have no spawn-style `cwd` option to set this natively.

If you're debugging a process that keeps dying every ~30s in production, this is almost certainly the cause — check whether it's still being `spawn()`-ed somewhere instead of run as a Worker thread.

### The `/__status` diagnostic endpoint

`https://jokasfarms.com/__status` — always available, even while the app is still starting up. Returns JSON:

```json
{
  "webReady": true,
  "webRestarts": 0,
  "apiScriptExists": true,
  "lastStartLines": ["..."],
  "lastWebLines": ["..."],
  "lastApiLines": ["..."],
  "memoryMB": { "rss": 210, "heapUsed": 90, "heapTotal": 140 },
  "pid": 12345,
  "uptime": 3600
}
```

This is the primary diagnostic tool for this deployment — there is no SSH-free way to tail logs otherwise, and interactive SSH access is often slow/unavailable when something's actively broken. `lastStartLines`/`lastWebLines`/`lastApiLines` are rolling buffers of each component's recent stdout/stderr. The deploy pipeline's smoke test polls this exact endpoint to confirm the app came back up after a restart.

---

## Prerequisites (local dev only — production needs nothing installed locally)

| Tool | Version |
|------|---------|
| Node.js | 22+ |
| pnpm | 9+ (`npm i -g pnpm`) |
| Docker | for local MySQL only (`docker compose up -d mysql`) — not used in production |

---

## One-time Hostinger setup

1. **Node.js app** — hPanel → Advanced → Node.js: create an app pointed at `~/domains/jokasfarms.com/nodejs`, entry point `start.js`, Node 22.
2. **MySQL database** — hPanel → Databases → MySQL Databases: create a database and user, note the credentials for `DATABASE_URL`.
3. **`.env`** — copy `.env.production.example` to `.env` in the app directory on the server and fill in every value (DB credentials, JWT secrets via `openssl rand -hex 64`, `SITE_URL`, `SETUP_SECRET_TOKEN`, etc.). The deploy pipeline never writes this file from scratch — it only reads and patches `DATABASE_URL`'s connection-pool params on each deploy — so it must already exist before the first deploy.
4. **SSH access on port 65002** — Hostinger shared hosting uses a non-standard SSH port. Generate a deploy key pair and add the public key via hPanel → Advanced → SSH Access.
5. **GitHub Actions secrets** (repo Settings → Secrets and variables → Actions): `HOSTINGER_SSH_KEY` (private key), `HOSTINGER_SSH_KNOWN_HOST`, `HOSTINGER_USER`, `HOSTINGER_HOST`, `DATABASE_URL`.

There is no SSL step to run manually — Hostinger issues and renews the certificate for the domain automatically.

---

## The deploy pipeline (`.github/workflows/deploy.yml`)

Triggered on push to `main`. Two jobs:

### Job 1 — build (`ubuntu-latest`)

Lint & typecheck → API unit tests → **API e2e tests** (part of the quality gate; a deploy does not proceed if these fail) → build API/Web/Storefront → bundle everything into `deploy.tar.gz` → upload as a GitHub Actions artifact.

### Job 2 — deploy (`ubuntu-latest`, orchestrates over SSH)

This job does **not** run on a Hostinger-hosted self-hosted runner — it's a normal GitHub-hosted runner that reaches Hostinger over SSH (port 65002) using `appleboy/ssh-action` for multi-line remote scripts and raw `ssh`/`rsync` calls for simpler steps or where retry logic is needed. In order:

1. **Download the build artifact**, **set up the SSH key**.
2. **Upload the tarball via `rsync`** — wrapped in a 3-attempt retry loop (transient SSH/network failures on shared hosting are common enough to plan for).
3. **Back up the current deploy** — hardlinks (`cp -al`, near-zero cost) the live `nodejs` directory to `nodejs_prev`, used later for auto-rollback.
4. **Extract to a staging directory and atomically swap it in** — extracts the tarball into `nodejs.new`, copies over `apps/api/uploads/` and `.env` (neither ships in the tarball — uploads accumulate live on the server, `.env` is server-specific), then swaps `nodejs.new` into place via two `mv` operations rather than extracting directly over the live, currently-serving directory. This shrinks the live-corruption window from "the whole extraction" to two near-instant renames.
5. **Patch `DATABASE_URL`** with a connection-pool limit appropriate for shared hosting.
6. **Run database migrations** — see below.
7. **Restart the application** — touches `tmp/restart.txt`, which signals Passenger to tear down and relaunch the whole `start.js` process (there's no per-worker-thread restart; Web/Storefront/API all go down and come back together).
8. **Smoke test** — polls `https://jokasfarms.com/__status` for up to 180s waiting for HTTP 200.
9. **On smoke-test failure: roll back** — `rsync -a --delete`s `nodejs_prev` back over the live directory, wrapped in a 3-attempt retry loop, then verifies the rollback itself came back online. If this also fails, the job ends with an explicit error pointing at the manual recovery steps (rsync `nodejs_prev` back into place, touch `restart.txt`) rather than a bare red X.
10. **Set up backup scripts** — runs `bash setup-backup-crons.sh` on the server (see "Backups" below; despite the filename, this does not touch a real crontab).

### Database migrations in production

**Production does not use `prisma migrate deploy`.** It was tried and hangs indefinitely on this host — `diagnoseMigrationHistory` ships the full SQL text of every migration to a schema-engine subprocess over stdio, and that deadlocks (reproduced with a clean reinstall, so it isn't a corrupted-install issue; root cause not otherwise isolated). The pipeline instead uses a **hand-rolled migration runner** embedded directly in the "Run database migrations" step:

1. Takes a fresh `mysqldump` snapshot immediately before touching the schema, aborting loudly (before running anything) if the snapshot itself fails. Snapshots land in `~/jokas-db-backups/pre-deploy-<timestamp>.sql.gz`, retaining the 5 most recent.
2. Ensures a `_prisma_migrations` tracking table exists (Prisma's own schema for it, created by hand since `prisma migrate deploy` is never invoked to do it).
3. Walks `packages/db/prisma/migrations/*/migration.sql` in order, skips anything already recorded as applied or explicitly rolled-back, and runs each pending one via the plain `mysql` CLI.
4. **Stops at the first failure** rather than continuing to later migrations — MySQL DDL auto-commits per statement, so a failed multi-statement file may have partially applied itself, and later migrations may assume schema changes that never landed. The error message on failure explicitly says the auto-rollback below only restores application *code*, never the database, and points at the just-taken snapshot for manual recovery.

If you add a new migration: develop and commit it normally (`pnpm db:migrate`), commit the migration file, and it will be picked up automatically by this runner on the next deploy. If migration history ever needs manual reconciliation (e.g. a migration recorded against the wrong DB state), see `scripts/reconcile-migration-history.sh` and the two explicit `INSERT`/rolled-back overrides already present in the migration step for a past incident (`20260801030000_hr_d_disciplinary_grievance`, superseded by a recovery migration).

---

## Backups

**This Hostinger plan has no cron / scheduled-tasks feature at all.** Anything that looks like "cron" in this repo (`setup-backup-crons.sh`, the `jokas-db-backups` naming) is a script written to disk by the deploy pipeline and actually *triggered* by `start.js`'s own polling loop, not by the system crontab.

- `setup-backup-crons.sh` (repo root, shipped via `rsync` and run over SSH by the deploy pipeline's last step) writes two executable scripts on the server:
  - `~/jokas-db-backup.sh` — `mysqldump` (with `--single-transaction --routines`) to a temp file, gzip only if the dump succeeded and is non-empty, 7-day retention. Failures land in `~/jokas-db-backups/backup-error.log` instead of silently producing an empty/broken archive.
  - `~/jokas-files-backup.sh` — tars `apps/api/uploads/` (employee photos, HR documents, product images — the only production data that isn't in MySQL) into `~/jokas-files-backups/`, same 7-day retention.
- `start.js`'s `checkDailyBackup()` / `checkDailyFilesBackup()` run every 15 minutes, fire the corresponding script once per day during the 02:00 hour (checked by looking for that day's expected output file — idempotent even if `start.js` itself restarted right around 2am), and no-op the rest of the day.
- Separately, every deploy takes its own pre-migration `mysqldump` snapshot (see above) — a short-lived, 5-snapshot safety net for that specific deploy, distinct from the daily backup's 7-day retention.

### Verifying a backup restores cleanly

`scripts/verify-backup-restore.sh` — run manually over SSH on the production host (not wired into CI; restoring a 30MB+ dump isn't worth doing on every push). Non-destructive: restores the latest `db-*.sql.gz` into a disposable `<dbname>_restoretest` scratch database on the same MySQL instance, sanity-checks row counts on a few core tables against the live database, then drops the scratch database. Also does a lightweight tar-integrity check on the latest uploaded-files backup. Run it periodically (monthly is reasonable):

```bash
ssh -p 65002 user@host
cd ~/domains/jokasfarms.com/nodejs
./scripts/verify-backup-restore.sh
```

Note: if the DB user lacks `CREATE DATABASE` privilege on this hosting plan, the script fails with an actionable message rather than a raw MySQL error — see its own comments for the two ways around that.

---

## Creating the First Admin User

```bash
pnpm db:seed
```

creates all permissions, default roles, a demo company, and:

```
Email:    admin@jokas.local
Password: Admin@12345
```

**Change this password immediately after first login**, then create real user accounts under Identity → Users and disable/delete the default admin account.

---

## Viewing Logs / Diagnosing Issues

There's no `docker compose logs` equivalent. In order of usefulness:

1. **`https://jokasfarms.com/__status`** — always try this first. `lastStartLines`/`lastWebLines`/`lastApiLines` usually show exactly what's wrong (a stack trace, a crash-loop pattern, a failed DB connection) without needing SSH at all.
2. **Passenger's own log**, via SSH: `tail -100 ~/domains/jokasfarms.com/nodejs/log/passenger.log` — the smoke-test step in the deploy pipeline also dumps the last 20 lines of this automatically on failure.
3. **Audit logs** are in MySQL (`AuditLog` table) and queryable from the Audit module in the ERP UI, or directly:
   ```sql
   SELECT userId, action, resource, createdAt FROM AuditLog ORDER BY createdAt DESC LIMIT 20;
   ```

## Restarting

The only supported restart mechanism is:

```bash
mkdir -p ~/domains/jokasfarms.com/nodejs/tmp
touch ~/domains/jokasfarms.com/nodejs/tmp/restart.txt
```

Passenger watches for this file and tears down/relaunches the whole `start.js` process — Web, Storefront, and API all restart together (there's no independent per-component restart, since all three run as Worker threads inside one process).

---

## Troubleshooting

### App won't come up / smoke test fails on deploy

Check `/__status` first — `lastStartLines` will usually show the actual startup error. Common causes: `.env` missing/corrupted on the server (the deploy pipeline never writes this file, only patches `DATABASE_URL`), a migration left the schema out of sync with the deployed code (see the migration step's own failure messaging), or a process that's being `spawn()`-ed instead of run as a Worker thread and hitting Hostinger's ~30s kill.

### A component keeps crash-looping every ~30 seconds

This is Hostinger's `child_process.spawn()` kill. Confirm via `/__status`'s `lastStartLines`, then make sure that component is launched as a Worker thread (see "Why Worker threads" above), not `spawn()`.

### Migration failed mid-deploy

The migration step's own error output tells you exactly which file failed and points at the pre-migration snapshot it took immediately before running anything (`~/jokas-db-backups/pre-deploy-<timestamp>.sql.gz`). The auto-rollback that follows only restores application code via rsync — **it never touches the database** — so do not assume the app is fully healthy just because the rollback step reported success if a migration had already partially applied. Verify schema state manually; restore from the snapshot if needed.

### Backup script produced an empty/broken archive

Check `~/jokas-db-backups/backup-error.log` or `~/jokas-files-backups/backup-error.log`. The DB backup script explicitly checks `mysqldump`'s exit code and that the dump is non-empty before gzipping — a real failure lands in this log rather than silently producing a tiny valid-looking gzip of nothing.

### Out of disk space

```bash
du -sh ~/domains/jokasfarms.com/nodejs
du -sh ~/jokas-db-backups ~/jokas-files-backups
find ~/jokas-db-backups -name "db-*.sql.gz" -mtime +7 -delete      # normally automatic, 7-day retention
find ~/jokas-files-backups -name "files-*.tar.gz" -mtime +7 -delete
```

---

## Security Checklist

- [ ] `JWT_ACCESS_SECRET` and `JWT_REFRESH_SECRET` are both 64+ char random hex strings (`openssl rand -hex 64`)
- [ ] `.env` on the server is not committed to git and not world-readable
- [ ] `DATABASE_URL` password is strong and not the example value
- [ ] Default `admin@jokas.local` password changed after first login
- [ ] SSH access uses key-based auth on port 65002 (Hostinger doesn't offer a UFW-style firewall on shared hosting — rely on key-only SSH and Hostinger's own account security)
- [ ] Daily DB and uploaded-files backups are landing (`ls -lt ~/jokas-db-backups ~/jokas-files-backups`)
- [ ] A restore drill (`scripts/verify-backup-restore.sh`) has been run recently and passed
- [ ] Anthropic (`AI_API_KEY`) and any third-party (QuickBooks, Twilio) keys are rotated if ever exposed
- [ ] `debug: true` is not left enabled on any `appleboy/ssh-action` step in `deploy.yml` longer than needed for active troubleshooting — it prints the full remote script and every forwarded env var (GitHub masks known secrets, but it's still unnecessary exposure)

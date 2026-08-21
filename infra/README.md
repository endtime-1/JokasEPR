# `infra/` — NOT USED IN PRODUCTION

**H19 (production-readiness audit):** everything in this directory targets a
Docker + PostgreSQL deployment that was never actually shipped. Production
runs bare-metal on Hostinger, under Passenger, on MySQL — with no Docker
anywhere in the path. This whole directory is historical/reference material
from before that decision, kept in case a future migration to
Docker/Postgres happens, not because any of it currently runs.

**If you're here during an incident** trying to figure out how to deploy,
back up, restore, or debug production, none of this will help — follow
these instead:

| Need | Real mechanism |
|---|---|
| Deploy pipeline | [`.github/workflows/deploy.yml`](../.github/workflows/deploy.yml) |
| Process management / startup | [`start.js`](../start.js) |
| Remote diagnostics | `https://jokasfarms.com/__status` (the `dump-logs.yml` self-hosted-runner workflow that used to wrap this was removed 2026-08-21 — the self-hosted runner it depended on could never actually stay alive on Hostinger's `child_process.spawn()`-killing plan) |
| Database backup (daily, automatic) | written by `deploy.yml`'s "Setup database backup cron" step; runs via `start.js`'s `checkDailyBackup()` since this Hostinger plan's `crontab` is a read-only stub |
| Database restore (emergency) | [`scripts/backup/restore-db.sh`](../scripts/backup/restore-db.sh) |
| Database restore drill (non-destructive, periodic) | [`scripts/verify-backup-restore.sh`](../scripts/verify-backup-restore.sh) |
| Uploaded-files backup | written by `deploy.yml`'s "Setup uploaded-files backup cron" step |

## What's in here

- `docker/` — Dockerfiles for api/web/storefront. Never built or pushed anywhere in CI.
- `nginx/` — an nginx config. Production uses Hostinger's own OpenLiteSpeed + Passenger, not nginx.
- `postgres/` — PostgreSQL tuning config. Production is MySQL.
- `scripts/` — deploy/backup/restore/migrate/seed scripts written against the Docker/Postgres stack above. None of them will work against the real production environment.

Nothing here is wired into CI, referenced by `start.js`, or reachable from
any GitHub Actions workflow — confirmed by grepping for `infra/` across the
repo's workflows and entry points.

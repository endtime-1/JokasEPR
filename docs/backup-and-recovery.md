# Jokas ERP — Backup, Recovery & Data Protection

This document covers every aspect of protecting Jokas ERP data: how backups run,
where they are stored, how to restore, how to test, and what to do when a
production server fails.

---

## Table of Contents

1. [Overview](#overview)
2. [What Is Backed Up](#what-is-backed-up)
3. [Backup Schedule](#backup-schedule)
4. [Retention Policy](#retention-policy)
5. [Secure Backup Storage](#secure-backup-storage)
6. [First-Time Setup](#first-time-setup)
7. [Running a Manual Backup](#running-a-manual-backup)
8. [Automated Backups (Cron)](#automated-backups-cron)
9. [File Upload Backup](#file-upload-backup)
10. [How to Restore the Database](#how-to-restore-the-database)
11. [How to Test a Backup](#how-to-test-a-backup)
12. [Disaster Recovery](#disaster-recovery)
13. [What to Do If the Production Server Fails](#what-to-do-if-the-production-server-fails)

---

## Overview

Jokas ERP stores all operational data in PostgreSQL and user-uploaded files on the
local filesystem. Both must be backed up. The backup system is composed of shell
scripts (`scripts/backup/`) that can be run manually or via cron on any Linux
deployment server.

**Key design decisions:**

- Backups use `pg_dump --format=custom` (compressed, object-level restore)
- Local copies **plus** an encrypted S3 upload (recommended)
- Three tiers: daily · weekly · monthly, each with independent retention
- Every backup produces a `manifest.json` and a timestamped log
- `verify-backup.sh` performs a full dry-run restore to a temporary database

---

## What Is Backed Up

| Component | Tool | Output |
|---|---|---|
| PostgreSQL database | `pg_dump --format=custom` | `database.dump` (~compressed) |
| Uploaded files | `tar --gzip` | `uploads.tar.gz` |
| Backup manifest | shell | `manifest.json` |

**Not backed up by these scripts (manage separately):**
- `.env` files (store in a password manager or secrets vault)
- Source code (Git repository is the source of truth)
- Prisma migration history (tracked in Git)

---

## Backup Schedule

| Tier | When | Cron expression |
|---|---|---|
| **Daily** | Every day at 02:00 AM | `0 2 * * *` |
| **Weekly** | Every Sunday at 03:00 AM | `0 3 * * 0` |
| **Monthly** | 1st of month at 04:00 AM | `0 4 1 * *` |

**Recommendation:** The daily backup is the primary safety net.
Weekly and monthly backups exist for long-range point-in-time recovery
(e.g., discovering data corruption that went unnoticed for several days).

For production systems processing more than 500 records per day, consider
additionally enabling **PostgreSQL WAL archiving** (continuous archiving)
for point-in-time recovery (PITR) with sub-minute granularity.

---

## Retention Policy

| Tier | Retain for | Rationale |
|---|---|---|
| Daily | **7 days** | Recover from yesterday's bad import |
| Weekly | **30 days** | Recover from last month's corruption |
| Monthly | **365 days** | Compliance, audit, long-range recovery |

These are the defaults in `backup.env.example`. Adjust `RETAIN_DAILY`,
`RETAIN_WEEKLY`, and `RETAIN_MONTHLY` for your business requirements.

The `apply-retention.sh` script is called automatically at the end of every
backup run to prune expired backups from the local filesystem.

**Cloud retention:** Set S3 lifecycle rules independently to match (or extend)
these periods. The scripts upload but do not delete from S3.

---

## Secure Backup Storage

### Minimum: Local + Off-site copy

Store backups in two physically separate locations:

1. **Local disk** — fast recovery, but lost if the server is destroyed
2. **S3-compatible object storage** — off-site, survives server failure

   Recommended providers:
   - AWS S3 (enable versioning + MFA delete)
   - Backblaze B2 (lower cost, S3-compatible)
   - DigitalOcean Spaces
   - Cloudflare R2

### Hardening checklist

- [ ] Enable **server-side encryption** (SSE-AES256) — the scripts pass `--sse AES256`
- [ ] Restrict the S3 IAM role to `PutObject` only — backups should never be deletable by the app
- [ ] Enable **S3 versioning** and **MFA delete** on the backup bucket
- [ ] Store `backup.env` (with credentials) in a secrets manager, not on disk in plaintext
- [ ] Rotate `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` quarterly
- [ ] Test restores monthly (see [How to Test a Backup](#how-to-test-a-backup))

### Backup directory layout

```
/opt/jokas/backups/
  daily/
    jokas_daily_20260616_020001/
      database.dump
      uploads.tar.gz
      manifest.json
  weekly/
    jokas_weekly_20260614_030001/
      ...
  monthly/
    jokas_monthly_20260601_040001/
      ...
  logs/
    backup_20260616_020001.log
    cron.log
```

---

## First-Time Setup

```bash
# 1. Copy config template
cp scripts/backup/backup.env.example scripts/backup/backup.env

# 2. Edit with your database URL and paths
nano scripts/backup/backup.env

# 3. Make scripts executable
chmod +x scripts/backup/*.sh

# 4. Create backup root directory
mkdir -p /opt/jokas/backups

# 5. Run a test backup
scripts/backup/backup.sh daily

# 6. Verify the backup
scripts/backup/verify-backup.sh /opt/jokas/backups/daily/$(ls /opt/jokas/backups/daily | tail -1)
```

---

## Running a Manual Backup

```bash
# Full backup (database + files)
scripts/backup/backup.sh daily

# Weekly backup
scripts/backup/backup.sh weekly

# Database only (useful for pre-deployment snapshots)
source scripts/backup/backup.env
scripts/backup/backup-db.sh /tmp/pre-deploy-$(date +%Y%m%d).dump

# File uploads only
scripts/backup/backup-files.sh /opt/jokas/uploads /tmp/uploads-$(date +%Y%m%d).tar.gz
```

---

## Automated Backups (Cron)

```bash
# Install cron jobs (daily + weekly + monthly)
scripts/backup/setup-cron.sh

# Verify installation
crontab -l

# Remove cron jobs
scripts/backup/setup-cron.sh --remove
```

Monitor the cron log:

```bash
tail -f /opt/jokas/backups/logs/cron.log
```

Set up `SLACK_WEBHOOK_URL` in `backup.env` to receive success/failure
notifications in Slack.

---

## File Upload Backup

The API stores user-uploaded files at the path configured in `APP_UPLOAD_DIR`
(default: `/opt/jokas/uploads`). This directory contains:

- Documents attached to procurement orders
- Quality control reports
- Any other file uploads managed through the system

The `backup.sh` script automatically backs up this directory if `APP_UPLOAD_DIR`
is set and the directory exists. The output is a `.tar.gz` archive included in
every backup.

**To restore file uploads:**

```bash
# Extract uploads archive to restore path
mkdir -p /opt/jokas/uploads-restored
tar -xzf /path/to/backup/uploads.tar.gz -C /opt/jokas/uploads-restored

# Or restore directly (overwrites current uploads)
tar -xzf /path/to/backup/uploads.tar.gz -C /opt/jokas
```

---

## How to Restore the Database

> **This operation is destructive.** It drops and recreates the database.
> Ensure all users are logged out and the API is stopped first.

### Step-by-step restore

```bash
# 1. Stop the API
systemctl stop jokas-api    # or however your process manager runs it

# 2. Choose which backup to restore
ls /opt/jokas/backups/daily/

# 3. Run restore script
scripts/backup/restore-db.sh \
  /opt/jokas/backups/daily/jokas_daily_20260616_020001/database.dump

# 4. The script will:
#    - Show you what it will do
#    - Ask you to type 'yes-restore' to confirm
#    - Verify the backup file
#    - Terminate active connections
#    - DROP the existing database
#    - CREATE a fresh database
#    - pg_restore the dump
#    - Report completion

# 5. Run Prisma migrations to ensure schema is current
cd packages/db
node_modules/.bin/prisma migrate deploy

# 6. Restart the API
systemctl start jokas-api

# 7. Verify the application works
curl http://localhost:4001/api/v1/auth/me
```

### Restore from S3

```bash
# Download from S3 first
aws s3 cp s3://your-bucket/jokas-erp-backups/jokas_daily_20260616_020001/ \
  /tmp/jokas-restore/ --recursive

# Then restore as above
scripts/backup/restore-db.sh /tmp/jokas-restore/database.dump
```

---

## How to Test a Backup

Test backups **monthly** to confirm they are actually restorable before
you need them in an emergency.

```bash
# Quick integrity check (no data written to production DB)
scripts/backup/verify-backup.sh \
  /opt/jokas/backups/daily/jokas_daily_20260616_020001

# What verify-backup.sh checks:
#  1. manifest.json is present and parseable
#  2. pg_restore --list succeeds (dump is readable)
#  3. uploads.tar.gz is readable (if present)
#  4. Full dry-run restore to a temporary database
#  5. Counts tables in the temp database
#  6. Drops the temp database
```

A fully passing output looks like:

```
── Manifest ──
  ✓ manifest.json present
  ✓ Type: daily  Timestamp: 2026-06-16T02:00:01Z

── Database Dump ──
  ✓ database.dump present (142M)
  ✓ pg_restore can read dump: 3847 objects listed

── File Archive ──
  ✓ uploads.tar.gz present (28M)
  ✓ Archive is readable: 312 entries

── Dry-Run Restore (temp database) ──
  ✓ Dry-run restore succeeded: 87 tables in temp database

======================================================================
 Verification complete: 6 passed, 0 failed
 ✓  Backup is valid and restorable.
```

---

## Disaster Recovery

### Scenarios and actions

| Scenario | Action |
|---|---|
| Single record accidentally deleted | Restore to temp DB, export the row, insert into production |
| Bad bulk import corrupted data | Stop API → restore last clean daily backup → restart |
| Database server disk full | Free space or expand → resume API → verify integrity |
| Database server crashed (hardware) | Provision new server → restore from S3 backup (see below) |
| Production server completely destroyed | Full recovery procedure (see next section) |
| S3 backup bucket accidentally deleted | Restore from local copies on server; enable S3 versioning to prevent this |

### Surgical record recovery (no full restore)

When only specific records are corrupted:

```bash
# Restore to a temp DB (verify-backup.sh does this, or run restore-db.sh
# against a different DB name)
DATABASE_URL="postgresql://jokas_user:pass@localhost:5432/jokas_temp" \
  scripts/backup/restore-db.sh /path/to/database.dump

# Connect and export specific rows
psql "postgresql://jokas_user:pass@localhost:5432/jokas_temp" \
  -c "COPY (SELECT * FROM \"FlockBatch\" WHERE id = 'abc...') TO STDOUT"

# Insert into production (use Prisma Studio or psql directly)
```

---

## What to Do If the Production Server Fails

Follow this checklist in order. Estimated recovery time: **2–4 hours**.

### Phase 1 — Assess (0–15 min)

- [ ] Confirm the server is unreachable (ping, SSH)
- [ ] Check cloud provider dashboard for infrastructure incidents
- [ ] Identify the most recent successful backup (check S3 or local snapshots)
- [ ] Notify stakeholders of estimated downtime

### Phase 2 — Provision new server (15–60 min)

```bash
# On a new Ubuntu 22.04 / Debian 12 server:

# Install Node.js 20+
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt-get install -y nodejs

# Install pnpm
npm install -g pnpm

# Install PostgreSQL 15+
apt-get install -y postgresql-15 postgresql-client-15

# Install AWS CLI (for S3 download)
snap install aws-cli --classic
```

### Phase 3 — Restore database (30–60 min)

```bash
# Create the database user and empty database
sudo -u postgres psql -c "CREATE USER jokas_user WITH PASSWORD 'your-password';"
sudo -u postgres psql -c "CREATE DATABASE jokas_erp OWNER jokas_user;"

# Download latest backup from S3
aws s3 cp s3://your-bucket/jokas-erp-backups/ /opt/jokas-restore/ \
  --recursive \
  --exclude '*' \
  --include 'jokas_daily_*/database.dump' \
  --exclude '*/*/'   # only the most recent

# Find and restore
LATEST=$(ls -t /opt/jokas-restore/ | head -1)
DATABASE_URL="postgresql://jokas_user:pass@localhost:5432/jokas_erp" \
  scripts/backup/restore-db.sh "/opt/jokas-restore/${LATEST}/database.dump"
```

### Phase 4 — Deploy application (30–60 min)

```bash
# Clone repository
git clone https://github.com/your-org/jokas.git /opt/jokas/app
cd /opt/jokas/app

# Install dependencies
pnpm install

# Copy environment files (from password manager / secrets vault)
cp .env.production apps/api/.env
cp .env.production apps/web/.env

# Run pending migrations
packages/db/node_modules/.bin/prisma migrate deploy

# Build
pnpm --filter @jokas/api build
pnpm --filter @jokas/web build

# Start (use PM2 or systemd)
pm2 start ecosystem.config.js
```

### Phase 5 — Restore uploaded files (15–30 min)

```bash
aws s3 cp s3://your-bucket/jokas-erp-backups/${LATEST}/uploads.tar.gz /tmp/

mkdir -p /opt/jokas/uploads
tar -xzf /tmp/uploads.tar.gz -C /opt/jokas
```

### Phase 6 — Verify and go live (15–30 min)

- [ ] `curl http://localhost:4001/api/v1/auth/me` → returns `401` (not 500)
- [ ] Log in to the web UI
- [ ] Check dashboard data matches expected figures
- [ ] Review the most recent audit log entries
- [ ] Check notifications are delivering
- [ ] Run `scripts/backup/verify-backup.sh` against the restored backup
- [ ] Update DNS / load balancer to point to new server
- [ ] Confirm external access works
- [ ] Enable automated backups: `scripts/backup/setup-cron.sh`
- [ ] Send all-clear notification to stakeholders

---

## Quick Reference

```bash
# Manual full backup
scripts/backup/backup.sh daily

# Manual DB-only backup (pre-deployment snapshot)
source scripts/backup/backup.env
scripts/backup/backup-db.sh /tmp/pre-deploy.dump

# Restore database
scripts/backup/restore-db.sh /path/to/database.dump

# Verify a backup
scripts/backup/verify-backup.sh /path/to/backup-directory

# Install cron schedule
scripts/backup/setup-cron.sh

# View backup logs
tail -100 /opt/jokas/backups/logs/cron.log
```

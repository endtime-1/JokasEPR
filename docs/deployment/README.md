# Jokas ERP — Production Deployment Guide

Complete guide for deploying Jokas ERP to production. Three paths are covered:

- **[Option A — VPS / DigitalOcean](#option-a--vpsdroplet-digitalocean-linodelinode-hetzner)** — Docker Compose on a Linux server (recommended for full control)
- **[Option B — Render or Railway](#option-b--render-or-railway)** — Platform-as-a-Service (fastest to deploy, lowest ops burden)
- **[Option C — AWS](#option-c--aws)** — ECS + RDS (enterprise-grade, most flexible)

---

## Prerequisites

| Tool | Version | Install |
|------|---------|---------|
| Docker | 24+ | https://docs.docker.com/get-docker/ |
| Docker Compose | v2 | Included with Docker Desktop |
| Node.js | 22+ | https://nodejs.org (local dev only) |
| pnpm | 9+ | `npm i -g pnpm` (local dev only) |

---

## Before You Deploy — Checklist

```bash
# 1. Generate secure JWT secrets (do this now, save them somewhere safe)
openssl rand -hex 64   # run twice: one for ACCESS, one for REFRESH

# 2. Choose a strong database password (no special shell chars like $, @, #)
# Example: use a 32-char alphanumeric string

# 3. Have your domain name ready (e.g. erp.youragribusiness.com)
# 4. Have your Anthropic API key ready (for AI features)
```

---

## Option A — VPS/Droplet (DigitalOcean, Linode, Hetzner)

### Recommended server size

| Workload | RAM | CPU | Disk |
|----------|-----|-----|------|
| Up to 20 users | 2 GB | 2 vCPU | 50 GB SSD |
| Up to 100 users | 4 GB | 2 vCPU | 100 GB SSD |
| 100+ users | 8 GB | 4 vCPU | 200 GB SSD |

**Recommended:** DigitalOcean Basic Droplet — $18/month (4 GB / 2 vCPU / 80 GB SSD)

---

### Step 1 — Provision and secure the server

```bash
# On your LOCAL machine: create and upload SSH key
ssh-keygen -t ed25519 -C "jokas-erp-server"
# Add the public key to DigitalOcean when creating the Droplet

# Connect to your new server
ssh root@YOUR_SERVER_IP

# Create a deploy user (never run production apps as root)
adduser jokas
usermod -aG sudo jokas
usermod -aG docker jokas

# Copy your SSH key to the new user
rsync --archive --chown=jokas:jokas ~/.ssh /home/jokas

# Lock down SSH
sed -i 's/^#\?PermitRootLogin.*/PermitRootLogin no/' /etc/ssh/sshd_config
sed -i 's/^#\?PasswordAuthentication.*/PasswordAuthentication no/' /etc/ssh/sshd_config
systemctl restart sshd

# Basic firewall
ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw enable
```

### Step 2 — Install Docker

```bash
# Log in as the deploy user
ssh jokas@YOUR_SERVER_IP

# Install Docker
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER
# Log out and back in for group to take effect
exit
ssh jokas@YOUR_SERVER_IP
docker --version   # should print Docker version
```

### Step 3 — Clone and configure

```bash
cd ~
git clone https://github.com/YOUR_ORG/jokas-erp.git jokas
cd jokas

# Copy and fill in the production env file
cp .env.production.example .env.production
nano .env.production
```

**Required values to change in `.env.production`:**

```bash
# Generate with: openssl rand -hex 64
JWT_ACCESS_SECRET="your-64-char-hex-string-here"
JWT_REFRESH_SECRET="another-64-char-hex-string-here"

# Your real domain
WEB_ORIGIN="https://erp.yourdomain.com"
NEXT_PUBLIC_API_URL="https://erp.yourdomain.com/api/v1"

# Strong database password
POSTGRES_PASSWORD="StrongPasswordHere123"
DATABASE_URL="postgresql://jokas_prod:StrongPasswordHere123@postgres:5432/jokas_erp?schema=public"

# Anthropic API key
AI_API_KEY="sk-ant-YOUR_KEY_HERE"
```

### Step 4 — Configure Nginx domain

```bash
# Edit the nginx config and replace the placeholder domain
nano infra/nginx/nginx.conf

# Change both occurrences of:
#   erp.yourdomain.com
# to your real domain.
```

### Step 5 — Obtain SSL certificate

```bash
# First: point your domain's A record to YOUR_SERVER_IP
# Wait for DNS to propagate (use: dig erp.yourdomain.com)

# Start nginx in HTTP-only mode for the ACME challenge
# (temporarily comment out the 443 server block in nginx.conf)
docker compose -f docker-compose.prod.yml --env-file .env.production up -d nginx

# Obtain the certificate
docker compose -f docker-compose.prod.yml --env-file .env.production \
  run --rm certbot certonly \
    --webroot \
    --webroot-path=/var/www/certbot \
    -d erp.yourdomain.com \
    --email admin@yourdomain.com \
    --agree-tos \
    --non-interactive

# Restore the full nginx.conf (re-enable the 443 block)
# Then restart nginx
./infra/scripts/restart.sh nginx
```

### Step 6 — Build and deploy

```bash
# Make scripts executable
chmod +x infra/scripts/*.sh

# Full deployment: build → start postgres → migrate → start all
./infra/scripts/deploy.sh --no-backup   # first deploy has no DB to back up
```

### Step 7 — Seed the database

```bash
./infra/scripts/seed-admin.sh
```

This creates:
- All 34 permissions
- 16 default roles (Super Admin, CEO, Farm Manager, etc.)
- A demo company, branches, farms, and warehouses
- **First admin user: `admin@jokas.local` / `Admin@12345`**

**Change the password immediately after first login.**

### Step 8 — Verify

```bash
# Check all services are running
docker compose -f docker-compose.prod.yml --env-file .env.production ps

# Open in browser
open https://erp.yourdomain.com
```

---

### Set up automatic SSL renewal

```bash
# Add a cron job on the host to renew every 12 hours
crontab -e
# Add this line:
0 */12 * * * cd /home/jokas/jokas && docker compose -f docker-compose.prod.yml --profile certbot --env-file .env.production run --rm certbot renew --quiet && docker compose -f docker-compose.prod.yml --env-file .env.production exec nginx nginx -s reload
```

### Set up automatic database backups

```bash
# Daily backup at 3 AM, keep 30 days
crontab -e
# Add:
0 3 * * * cd /home/jokas/jokas && ./infra/scripts/backup.sh --prune 30 >> /home/jokas/logs/backup.log 2>&1
mkdir -p /home/jokas/logs
```

---

## Option B — Render or Railway

Both platforms support Docker-based deployments from a GitHub repository. No server management required.

### Render

**Architecture:** Deploy API and Web as separate Web Services; use Render PostgreSQL.

#### 1. Create a PostgreSQL database

1. Render Dashboard → New → PostgreSQL
2. Name: `jokas-erp-db`, Plan: Starter ($7/mo) or Standard
3. Copy the **Internal Database URL** (use this as `DATABASE_URL`)

#### 2. Deploy the API

1. New → Web Service → Connect your GitHub repo
2. Settings:
   - **Name:** `jokas-api`
   - **Dockerfile Path:** `infra/docker/api.prod.Dockerfile`
   - **Docker Context:** `.` (repo root)
   - **Port:** `4001`
   - **Plan:** Starter ($7/mo) or Standard ($25/mo)
3. Environment Variables:
   ```
   NODE_ENV            production
   DATABASE_URL        (paste Internal DB URL from step 1)
   JWT_ACCESS_SECRET   (openssl rand -hex 64)
   JWT_REFRESH_SECRET  (openssl rand -hex 64)
   JWT_ACCESS_TTL      15m
   JWT_REFRESH_TTL_DAYS 30
   WEB_ORIGIN          https://jokas-web.onrender.com  (set after web deploy)
   AI_API_KEY          sk-ant-...
   ```

#### 3. Deploy the Frontend

1. New → Web Service → same repo
2. Settings:
   - **Name:** `jokas-web`
   - **Dockerfile Path:** `infra/docker/web.prod.Dockerfile`
   - **Docker Context:** `.`
   - **Port:** `3000`
3. Environment Variables:
   ```
   NEXT_PUBLIC_API_URL   https://jokas-api.onrender.com/api/v1
   NODE_ENV              production
   ```
4. Build Argument:
   ```
   NEXT_PUBLIC_API_URL   https://jokas-api.onrender.com/api/v1
   ```

#### 4. Run migrations on Render

After first deploy, use Render's Shell (Dashboard → Service → Shell):
```bash
pnpm --filter @jokas/db exec prisma migrate deploy \
  --schema=packages/db/prisma/schema.prisma
```

Then seed:
```bash
pnpm --filter @jokas/db prisma:seed
```

#### 5. Custom domain on Render

Dashboard → Web Service → Settings → Custom Domains → Add domain.
Point your domain's CNAME to `jokas-web.onrender.com`. Render issues the SSL certificate automatically.

---

### Railway

Similar to Render. Railway supports monorepos natively.

1. railway.app → New Project → Deploy from GitHub repo
2. Add PostgreSQL plugin: `+ New` → Database → PostgreSQL
3. Create two services: **api** and **web**
4. For each service, set:
   - Start Command: from the Dockerfile CMD
   - Root Directory: `.` (uses Dockerfile with build context)
5. Set environment variables (same as Render above)
6. Railway generates domains automatically; bind your custom domain in Settings → Domains

Run migrations via Railway CLI:
```bash
railway run pnpm --filter @jokas/db exec prisma migrate deploy \
  --schema=packages/db/prisma/schema.prisma
```

---

## Option C — AWS

### Architecture

```
Route 53 (DNS)
    └── ACM (SSL)
         └── Application Load Balancer (port 443)
              ├── /api/*  → ECS Task: jokas-api  (Fargate, port 4001)
              └── /*      → ECS Task: jokas-web   (Fargate, port 3000)

RDS PostgreSQL 16 (db.t3.medium, Multi-AZ for production)
ECR (Docker image registry)
EFS or S3 (file uploads)
CloudWatch (logs)
```

### Step 1 — Push images to ECR

```bash
# Create ECR repositories
aws ecr create-repository --repository-name jokas/api --region YOUR_REGION
aws ecr create-repository --repository-name jokas/web --region YOUR_REGION

# Authenticate Docker with ECR
aws ecr get-login-password --region YOUR_REGION | \
  docker login --username AWS --password-stdin YOUR_ACCOUNT_ID.dkr.ecr.YOUR_REGION.amazonaws.com

# Build and push API image
docker build -f infra/docker/api.prod.Dockerfile -t jokas/api .
docker tag jokas/api:latest YOUR_ACCOUNT_ID.dkr.ecr.YOUR_REGION.amazonaws.com/jokas/api:latest
docker push YOUR_ACCOUNT_ID.dkr.ecr.YOUR_REGION.amazonaws.com/jokas/api:latest

# Build and push Web image
docker build -f infra/docker/web.prod.Dockerfile \
  --build-arg NEXT_PUBLIC_API_URL=https://erp.yourdomain.com/api/v1 \
  -t jokas/web .
docker tag jokas/web:latest YOUR_ACCOUNT_ID.dkr.ecr.YOUR_REGION.amazonaws.com/jokas/web:latest
docker push YOUR_ACCOUNT_ID.dkr.ecr.YOUR_REGION.amazonaws.com/jokas/web:latest
```

### Step 2 — RDS PostgreSQL

```bash
# Via AWS Console or CLI:
aws rds create-db-instance \
  --db-instance-identifier jokas-erp-prod \
  --db-instance-class db.t3.micro \
  --engine postgres \
  --engine-version 16 \
  --master-username jokas_prod \
  --master-user-password "StrongPassword123" \
  --allocated-storage 20 \
  --storage-type gp3 \
  --db-name jokas_erp \
  --backup-retention-period 7 \
  --multi-az \
  --no-publicly-accessible
```

### Step 3 — ECS Fargate Task Definitions

Create task definitions via AWS Console (ECS → Task Definitions → Create):

**API Task:**
- Container image: `YOUR_ECR_URI/jokas/api:latest`
- Port: 4001
- CPU: 512, Memory: 1024
- Environment variables: all from `.env.production.example`
- Log configuration: `awslogs`, group `/jokas/api`

**Web Task:**
- Container image: `YOUR_ECR_URI/jokas/web:latest`
- Port: 3000
- CPU: 256, Memory: 512
- Env: `NEXT_PUBLIC_API_URL`, `NODE_ENV=production`
- Log configuration: `awslogs`, group `/jokas/web`

### Step 4 — Application Load Balancer

1. Create ALB with HTTPS listener (port 443) using ACM certificate
2. Add listener rules:
   - `/api/*` → forward to `jokas-api` Target Group
   - `/*` (default) → forward to `jokas-web` Target Group

### Step 5 — Run migrations

```bash
# Run a one-off ECS task for migrations
aws ecs run-task \
  --cluster jokas-prod \
  --task-definition jokas-api-migrate \
  --launch-type FARGATE \
  --network-configuration "awsvpcConfiguration={subnets=[SUBNET_ID],securityGroups=[SG_ID]}" \
  --overrides '{"containerOverrides":[{"name":"api","command":["pnpm","--filter","@jokas/db","exec","prisma","migrate","deploy","--schema=packages/db/prisma/schema.prisma"]}]}'
```

### Step 6 — Seed

```bash
# Similar to migrations — run as one-off ECS task with seed command:
# command: ["pnpm", "--filter", "@jokas/db", "prisma:seed"]
```

---

## Domain Setup

### DNS Records

Point your domain to the server (replace `203.0.113.42` with your IP or ALB DNS):

| Type | Name | Value | TTL |
|------|------|-------|-----|
| A | `erp` | `203.0.113.42` | 300 |
| A | `@` | `203.0.113.42` | 300 (if apex domain) |

```bash
# Verify DNS has propagated
dig erp.yourdomain.com +short
# Should return your server IP
```

### SSL Certificate (VPS — Let's Encrypt)

```bash
# Initial issuance
docker compose -f docker-compose.prod.yml --env-file .env.production \
  run --rm certbot certonly \
    --webroot -w /var/www/certbot \
    -d erp.yourdomain.com \
    --email admin@yourdomain.com \
    --agree-tos --non-interactive

# Test renewal (dry run)
docker compose -f docker-compose.prod.yml --profile certbot --env-file .env.production \
  run --rm certbot renew --dry-run

# Check certificate expiry
docker compose -f docker-compose.prod.yml --env-file .env.production \
  run --rm certbot certificates
```

---

## Database Operations

### Run migrations

```bash
./infra/scripts/migrate.sh           # apply pending
./infra/scripts/migrate.sh --status  # show history
```

Migration files are in `packages/db/prisma/migrations/`. Each migration is timestamped and irreversible. `prisma migrate deploy` only applies forward — it never rolls back.

**Safe workflow for schema changes:**
1. Develop migration locally: `pnpm --filter @jokas/db prisma:migrate`
2. Commit the new migration file to git
3. Deploy code, then run `./infra/scripts/migrate.sh`

### Backup

```bash
./infra/scripts/backup.sh                # DB only (to ./backups/)
./infra/scripts/backup.sh --with-uploads # DB + file uploads
./infra/scripts/backup.sh --prune 30    # delete backups > 30 days

# List backups
ls -lh backups/
```

### Restore

```bash
# Always backup first before restoring
./infra/scripts/backup.sh
./infra/scripts/restore.sh ./backups/jokas_erp_20260616_030000.sql.gz
```

### Direct database access

```bash
# Open a psql session inside the postgres container
docker compose -f docker-compose.prod.yml --env-file .env.production \
  exec postgres psql -U jokas_prod jokas_erp

# Run a single query
docker compose -f docker-compose.prod.yml --env-file .env.production \
  exec postgres psql -U jokas_prod jokas_erp -c "SELECT COUNT(*) FROM \"User\";"
```

---

## Creating the First Admin User

The seed script (`./infra/scripts/seed-admin.sh`) creates the default admin:

```
Email:    admin@jokas.local
Password: Admin@12345
Role:     Super Admin (all permissions)
```

**After first login:**
1. Go to **Profile** → Change Password
2. Set a strong password (minimum 12 characters, mix of upper/lower/number/symbol)
3. Go to **Identity → Users** → create real user accounts for staff
4. Assign appropriate roles (Farm Manager, Accountant, etc.)
5. Delete or disable the default `admin@jokas.local` account once you have your own admin

**To create additional admin users via the API:**
```bash
# POST to the API (use Bearer token from login)
curl -X POST https://erp.yourdomain.com/api/v1/identity/users \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "ceo@yourcompany.com",
    "fullName": "Company Owner",
    "roleIds": ["super-admin-role-id"],
    "password": "SecurePassword123!"
  }'
```

---

## Viewing Logs

```bash
# All services (live tail)
./infra/scripts/logs.sh

# API logs only
./infra/scripts/logs.sh api

# Last 200 lines of API
./infra/scripts/logs.sh api -n 200

# Nginx access log
./infra/scripts/logs.sh nginx

# Filter for errors
./infra/scripts/logs.sh api 2>&1 | grep -i error

# Audit logs are in the database
docker compose -f docker-compose.prod.yml --env-file .env.production \
  exec postgres psql -U jokas_prod jokas_erp \
  -c "SELECT \"userId\", action, resource, \"createdAt\" FROM \"AuditLog\" ORDER BY \"createdAt\" DESC LIMIT 20;"
```

---

## Restarting Services

```bash
./infra/scripts/restart.sh            # restart everything
./infra/scripts/restart.sh api        # API only (≈5s downtime)
./infra/scripts/restart.sh web        # frontend only (≈3s downtime)
./infra/scripts/restart.sh nginx      # reload nginx config — NO downtime
./infra/scripts/restart.sh postgres   # DANGEROUS — causes DB downtime
```

**Zero-downtime API restart (if you scale to 2+ replicas):**
```bash
docker compose -f docker-compose.prod.yml --env-file .env.production \
  up -d --no-deps --scale api=2 api    # spin up second instance
# wait 30s for it to become healthy
docker compose -f docker-compose.prod.yml --env-file .env.production \
  up -d --no-deps --scale api=1 api    # drop old instance
```

---

## Logging Setup

The system has three layers of logging:

### 1. Application logs (NestJS)

`RequestLoggingInterceptor` logs every HTTP request:
- Method, path, status code, duration
- Written to stdout → captured by Docker's json-file driver
- Rotated automatically: max 10 MB, 5 files (configured in `docker-compose.prod.yml`)

View: `./infra/scripts/logs.sh api`

### 2. Nginx access logs

All HTTP/HTTPS requests logged with timing:
- Format: `IP - [time] "method path" status bytes`
- Stored in Docker volume `nginx_logs`

View: `./infra/scripts/logs.sh nginx`

### 3. Audit logs (PostgreSQL)

Every sensitive API action (create/update/delete) writes an `AuditLog` record with:
- `userId`, `action`, `resource`, `resourceId`, `metadata`, `createdAt`

These are queryable from the **Audit** module in the ERP UI, or via direct SQL.

### Centralized logging (optional)

For long-term log retention, ship logs to an external service:

**Option A — Logtail (BetterStack):**
```bash
# Install vector on the server
curl --proto '=https' --tlsv1.2 -sSf https://sh.vector.dev | sh

# Configure /etc/vector/vector.toml to read Docker logs and send to Logtail
```

**Option B — AWS CloudWatch:**
Change the Docker log driver in `docker-compose.prod.yml`:
```yaml
logging:
  driver: awslogs
  options:
    awslogs-group: /jokas/api
    awslogs-region: us-east-1
```

---

## Error Monitoring (Placeholder)

The codebase has a placeholder for error monitoring. To activate Sentry:

### 1. API (NestJS)

```bash
pnpm --filter @jokas/api add @sentry/node @sentry/nestjs
```

In `apps/api/src/main.ts`, before `bootstrap()`:
```typescript
import * as Sentry from "@sentry/node";
Sentry.init({
  dsn: process.env.SENTRY_DSN,
  environment: process.env.NODE_ENV,
  tracesSampleRate: 0.1,
});
```

### 2. Frontend (Next.js)

```bash
pnpm --filter @jokas/web add @sentry/nextjs
npx --filter @jokas/web @sentry/wizard@latest -i nextjs
```

### 3. Add to environment

```bash
# In .env.production
SENTRY_DSN="https://YOUR_KEY@sentry.io/PROJECT_ID"
```

**Free alternatives:** Glitchtip (self-hosted Sentry), Highlight.io, Axiom.

---

## File Storage Setup

### Default: local volume

By default, uploaded files (QR assets, reports, documents) are stored in a Docker volume:
```yaml
volumes:
  - uploads:/app/uploads   # in docker-compose.prod.yml
```

This is fine for a single-server VPS deployment. Include the uploads volume in your backup:
```bash
./infra/scripts/backup.sh --with-uploads
```

### Upgrade to S3 (for multi-server or CDN)

When you need files accessible from multiple servers or want CDN delivery:

1. Create an S3 bucket: `jokas-erp-uploads`
2. Create an IAM user with `s3:PutObject`, `s3:GetObject` on the bucket
3. Install AWS SDK in the API:
   ```bash
   pnpm --filter @jokas/api add @aws-sdk/client-s3
   ```
4. Update the upload service to use `S3Client` instead of `fs`
5. Add to `.env.production`:
   ```
   AWS_REGION=us-east-1
   AWS_ACCESS_KEY_ID=AKIA...
   AWS_SECRET_ACCESS_KEY=...
   S3_BUCKET=jokas-erp-uploads
   ```

---

## Updating / Redeploying

```bash
# On the server
cd ~/jokas
git pull origin main

# Rebuild and deploy (auto-backs-up DB before rebuild)
./infra/scripts/deploy.sh

# If only env vars changed (no code change)
./infra/scripts/restart.sh
```

---

## Troubleshooting

### Containers won't start

```bash
# Check status
docker compose -f docker-compose.prod.yml --env-file .env.production ps

# Detailed logs
docker compose -f docker-compose.prod.yml --env-file .env.production logs --tail=50 api

# Common cause: DATABASE_URL wrong or postgres not healthy
docker compose -f docker-compose.prod.yml --env-file .env.production \
  exec postgres pg_isready
```

### SSL certificate error

```bash
# Check cert exists
docker compose -f docker-compose.prod.yml --env-file .env.production \
  exec nginx ls /etc/letsencrypt/live/

# If cert missing: re-run certbot step from Step 5
# If cert exists but nginx errors: check domain name in nginx.conf matches cert
```

### "Invalid JWT secret" on API startup

```bash
# JWT secrets must be at least 32 characters
# Verify in .env.production
grep JWT_ACCESS_SECRET .env.production | wc -c   # should be > 40
```

### Database migration failed

```bash
# Check what failed
./infra/scripts/migrate.sh --status

# If stuck: connect and check
docker compose -f docker-compose.prod.yml --env-file .env.production \
  exec postgres psql -U jokas_prod jokas_erp \
  -c "SELECT * FROM \"_prisma_migrations\" ORDER BY finished_at DESC LIMIT 5;"
```

### Out of disk space

```bash
# Check disk usage
df -h

# Clean unused Docker resources (safe to run anytime)
docker system prune -f

# Clean old backups
./infra/scripts/backup.sh --prune 7   # keep only 7 days

# Check volume sizes
docker system df -v
```

---

## Security Checklist

- [ ] `JWT_ACCESS_SECRET` and `JWT_REFRESH_SECRET` are both 64+ char random hex strings
- [ ] `POSTGRES_PASSWORD` is strong and not the example value
- [ ] `.env.production` is NOT committed to git (check `.gitignore`)
- [ ] SSH root login is disabled
- [ ] UFW firewall allows only 22, 80, 443
- [ ] PostgreSQL port (5432) is NOT exposed externally
- [ ] Default `admin@jokas.local` password changed after first login
- [ ] SSL certificate is valid and auto-renewing
- [ ] Daily automated backups are running (`crontab -l | grep backup`)
- [ ] Anthropic API key is rotated if exposed

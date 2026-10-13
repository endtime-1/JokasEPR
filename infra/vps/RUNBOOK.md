# Jokas ERP — Hostinger shared hosting → VPS migration runbook

Moves the app off Passenger/shared hosting (where it hibernates and restarts)
onto a plain Ubuntu VPS running PM2 + nginx + MySQL. **No application code
changes.** MySQL stays MySQL. The mobile APK keeps working unchanged (same
domain).

```
Internet ──443──> nginx ──> 127.0.0.1:3000  jokas-web        (Next.js dashboard)
                       ├──> 127.0.0.1:3002  jokas-storefront (Next.js /shop)
                       └──> 127.0.0.1:4001  jokas-api        (NestJS) ──> MySQL (localhost)
                            all three supervised by PM2, restart on boot
```

Estimated hands-on time: **2–4 hours**. Downtime: **~10 min** (DNS cutover only).
Rollback at any point: the old Hostinger site is untouched — point DNS back.

---

## Before you start — gather these

| # | Value | Where from |
|---|---|---|
| 1 | VPS IP address | Hostinger hPanel → VPS |
| 2 | Your SSH **public** key | `~/.ssh/id_ed25519.pub` on your laptop (`ssh-keygen -t ed25519` if none) |
| 3 | Current prod `DATABASE_URL` | Hostinger hPanel → the Node app's env vars, or `~/domains/jokasfarms.com/nodejs/.env` |
| 4 | Current prod `.env` (all secrets) | same file — you'll copy JWT secrets, SMTP, AI key, etc. into the new `.env` |
| 5 | Where `jokasfarms.com` DNS is managed | Hostinger hPanel → Domains → DNS, or Cloudflare |

---

## Step 1 — Provision the VPS

1. hPanel → **VPS → Ubuntu 24.04 LTS** (no control panel template).
2. Add your SSH public key during setup.
3. Note the IP. Confirm you can log in:
   ```bash
   ssh root@YOUR_VPS_IP
   ```

## Step 2 — Bootstrap (as root, ~10 min)

On your laptop, from the repo root:
```bash
scp infra/vps/setup.sh root@YOUR_VPS_IP:/root/
```
Then on the VPS:
```bash
nano /root/setup.sh          # edit DB_NAME / DB_USER / DB_PASS at the top
bash /root/setup.sh
```
This installs Node 22, pnpm, PM2, MySQL 8, nginx, certbot; creates a 2 GB
swap file, the `deploy` user, `/opt/jokas/`, the database, a firewall, and
hardens SSH.

Give the `deploy` user your key:
```bash
mkdir -p /home/deploy/.ssh && cp /root/.ssh/authorized_keys /home/deploy/.ssh/
chown -R deploy:deploy /home/deploy/.ssh && chmod 700 /home/deploy/.ssh
```

## Step 3 — Get the code + env onto the VPS

```bash
ssh deploy@YOUR_VPS_IP
git clone https://github.com/qelaxa/<repo>.git /opt/jokas/app   # or your remote
cd /opt/jokas/app
git checkout main

cp infra/vps/.env.production.template .env
nano .env
```
Fill in `.env`:
- `DATABASE_URL` — user/password/name you set in `setup.sh` (keep the
  `?connection_limit=15&pool_timeout=30` suffix)
- `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET` — **copy the existing values from
  the current prod `.env`** (changing them logs everyone out; fine, but not required)
- `SETUP_SECRET_TOKEN`, `SMTP_*`, `AI_API_KEY`, any integration keys — copy from current prod `.env`

## Step 4 — Migrate the database + uploaded files

**4a. Dump the live database** (from your laptop):
```bash
ssh -p 65002 u136486538@<hostinger-host> \
  'mysqldump --single-transaction --routines --triggers -u DBUSER -pDBPASS DBNAME' \
  | gzip > jokas-prod-$(date +%F).sql.gz
```
(Get `DBUSER`/`DBPASS`/`DBNAME` from the current `DATABASE_URL`.)

**4b. Copy dump + uploads to the VPS**:
```bash
scp jokas-prod-*.sql.gz deploy@YOUR_VPS_IP:/opt/jokas/backups/

rsync -avz -e "ssh -p 65002" \
  u136486538@<hostinger-host>:'~/domains/jokasfarms.com/nodejs/apps/api/uploads/' \
  ./uploads-from-prod/
rsync -avz ./uploads-from-prod/ deploy@YOUR_VPS_IP:/opt/jokas/shared/uploads/
```

**4c. Import into the VPS database** (on the VPS):
```bash
cd /opt/jokas/app
gunzip -c /opt/jokas/backups/jokas-prod-*.sql.gz | mysql -u jokas -p jokas_erp
```

**4d. Reconcile Prisma migration history** (one time — the old pipeline left
placeholder checksums that `prisma migrate deploy` would reject):
```bash
pnpm install --frozen-lockfile
pnpm --filter @jokas/db prisma:generate
bash infra/vps/reconcile-migrations.sh
```
Expect it to end with `Database schema is up to date!` (or list a few genuinely
pending migrations — that's fine, deploy.sh applies them next).

## Step 5 — First deploy

```bash
cd /opt/jokas/app
bash infra/vps/deploy.sh
```
Builds everything, applies migrations, starts the 3 PM2 processes. It ends by
printing `pm2 status` and local health checks — all three should respond
(api `OK`, web `HTTP 200`, shop `HTTP 200`).

If a build runs out of memory on a 4 GB (KVM 1) box: the swap file covers it,
but it will be slow. KVM 2 (8 GB) builds comfortably.

## Step 6 — nginx + HTTPS

```bash
sudo cp infra/vps/nginx.conf /etc/nginx/sites-available/jokas
sudo ln -sf /etc/nginx/sites-available/jokas /etc/nginx/sites-enabled/jokas
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t && sudo systemctl reload nginx
```
Test over plain HTTP against the IP first (Host header spoof):
```bash
curl -s -H 'Host: jokasfarms.com' http://YOUR_VPS_IP/api/v1/health   # -> ok
```
Then issue the certificate (this only works **after** DNS points at the VPS —
do it in Step 7, or now if you add a temporary `/etc/hosts` entry).

## Step 7 — DNS cutover (the ~10 min of downtime)

1. **A day before:** lower the TTL on the `jokasfarms.com` A record to `300`.
2. **Cutover:**
   - Re-dump the live DB (Step 4a) and re-import (Step 4c) to catch changes
     since your first import. `rsync` the uploads again (incremental, fast).
   - Point DNS at the VPS:
     - `jokasfarms.com`  →  **A**  →  `YOUR_VPS_IP`
     - `www`             →  **A**  →  `YOUR_VPS_IP`
   - No Cloudflare needed — a VPS has a static IP, so a plain A record works.
3. Wait for propagation (`dig jokasfarms.com` shows the new IP), then:
   ```bash
   sudo certbot --nginx -d jokasfarms.com -d www.jokasfarms.com
   ```
4. Verify: log in, open a few module pages, open the mobile app, open `/shop`.

Keep the Hostinger app running for ~3 days. If anything is wrong, set the A
record back to the old Hostinger IP.

## Step 8 — Backups + cron

```bash
crontab -e     # as deploy
```
Add:
```
15 2 * * *  /opt/jokas/app/infra/vps/backup.sh >> /opt/jokas/backups/backup.log 2>&1
```
(Optional off-site: `rclone config` a Backblaze B2 / R2 remote, then uncomment
the `rclone copy` lines in `backup.sh`.)

## Step 9 — Later: wire CI

Once stable, replace `.github/workflows/deploy.yml` with a job that SSHes to
the VPS and runs `cd /opt/jokas/app && git pull && bash infra/vps/deploy.sh`.
The old file's ~400 lines of Prisma-restore + hand-rolled migration runner are
no longer needed. (Ask me to write this when you're ready.)

---

## What is now obsolete (delete after cutover is confirmed)

- `start.js`, `web-worker-wrapper.js`, `api-worker-wrapper.js` — Passenger workarounds
- `setup-backup-crons.sh` — replaced by real cron (Step 8)
- The Prisma-client-restore + hand-rolled migration steps in `deploy.yml`
- `SITE_URL` self-ping, the internal keep-alive intervals — no hibernation to fight

## Operating the VPS

| Task | Command (as `deploy`) |
|---|---|
| Status | `pm2 status` |
| Logs (live) | `pm2 logs jokas-api` |
| Restart one service | `pm2 restart jokas-web` |
| Deploy new code | `cd /opt/jokas/app && git pull && bash infra/vps/deploy.sh` |
| DB console | `mysql -u jokas -p jokas_erp` |
| Restore a backup | `gunzip -c /opt/jokas/backups/db-STAMP.sql.gz | mysql -u jokas -p jokas_erp` |

---

## Adding akokofeeds.com (public marketing + sales site)

`akokofeeds.com` serves the same `jokas-storefront` process (:3002) from the
**root** of the domain. `jokasfarms.com/shop` 301-redirects to it. The ERP,
login and every admin API stay on `jokasfarms.com` only — the new domain's
nginx forwards just `/api/v1/public/*` (minus `/public/admin`) and product /
logo images to the API.

**1. DNS** (where akokofeeds.com is managed — safe to do first, it just
propagates):

| Type | Name | Value |
|---|---|---|
| A | `@` | the VPS IP |
| A | `www` | the VPS IP |
| AAAA | `@`, `www` | only if the VPS has an IPv6 address you use for jokasfarms.com |

Check from the VPS: `dig +short akokofeeds.com` returns the VPS IP.

**2. nginx + TLS** (as root — a *separate* site file; do not overwrite the
live jokasfarms file, certbot has rewritten it):
```bash
cd /opt/jokas/app && git pull origin vps-migration
cp infra/vps/nginx-akokofeeds.conf /etc/nginx/sites-available/akokofeeds
ln -sf /etc/nginx/sites-available/akokofeeds /etc/nginx/sites-enabled/akokofeeds
nginx -t && systemctl reload nginx
certbot --nginx -d akokofeeds.com -d www.akokofeeds.com
```
After certbot, confirm the `www -> apex` redirect exists in the :443 block of
`/etc/nginx/sites-available/akokofeeds`.

**3. Deploy** (as `deploy`, never root): `bash infra/vps/deploy.sh` — this
rebuilds the storefront at the domain root and restarts it with
`SITE_URL=https://akokofeeds.com`. From this moment `jokasfarms.com/shop`
stops working until step 4, so do step 4 straight away.

**4. Redirect the old /shop path** — edit the live file (as root):
`nano /etc/nginx/sites-available/jokas`, replace the block
`location /shop { proxy_pass http://jokas_storefront; }` (in **both** the :80 and
:443 server blocks, if certbot duplicated it) with:
```nginx
location ~ ^/shop(/.*)?$ {
    return 301 https://akokofeeds.com$1$is_args$args;
}
```
then `nginx -t && systemctl reload nginx`.

**5. Verify**
- `https://akokofeeds.com` loads; `https://www.akokofeeds.com` redirects to it.
- Products show with prices and images; an order can be placed and tracked.
- `https://jokasfarms.com/shop/products` redirects to `https://akokofeeds.com/products`.
- `curl -i https://akokofeeds.com/api/v1/auth/login` returns **404** (the ERP API is not exposed on this domain).
- `https://akokofeeds.com/sitemap.xml` and `/robots.txt` list `akokofeeds.com` URLs.

**Rollback:** put `location /shop { proxy_pass http://jokas_storefront; }` back in
the jokasfarms nginx file and redeploy the previous commit (the storefront then
serves under `/shop` again).


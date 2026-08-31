#!/usr/bin/env bash
# ============================================================================
# Jokas ERP — one-time VPS bootstrap  (Ubuntu 24.04 LTS, fresh box)
# ----------------------------------------------------------------------------
# Run ONCE, as root, on a brand-new Hostinger VPS:
#
#     scp infra/vps/setup.sh root@YOUR_VPS_IP:/root/
#     ssh root@YOUR_VPS_IP
#     bash /root/setup.sh
#
# Idempotent: safe to re-run. It installs the whole stack, creates the
# `deploy` user, the app directory, the MySQL database, a swap file, and a
# firewall. It does NOT deploy the app (that's deploy.sh, run as `deploy`).
# ============================================================================
set -euo pipefail

# ─── EDIT THESE 3 VALUES BEFORE RUNNING ─────────────────────────────────────
DB_NAME="jokas_erp"
DB_USER="jokas"
DB_PASS="CHANGE_ME_strong_db_password"          # used in DATABASE_URL later
# ───────────────────────────────────────────────────────────────────────────

APP_USER="deploy"
APP_DIR="/opt/jokas"
NODE_MAJOR="22"

log() { echo -e "\n\033[1;32m==>\033[0m $*"; }

[ "$(id -u)" -eq 0 ] || { echo "Run as root."; exit 1; }

# ─── 1. Base system ────────────────────────────────────────────────────────
log "System update"
export DEBIAN_FRONTEND=noninteractive
apt-get update -y
apt-get upgrade -y
apt-get install -y curl ca-certificates gnupg git rsync ufw fail2ban \
  build-essential pkg-config unattended-upgrades

log "Enable automatic security updates"
dpkg-reconfigure -f noninteractive unattended-upgrades || true

# ─── 2. Swap — 4 GB. On KVM 1 (4 GB RAM) the Next.js builds genuinely need
#        this headroom; on 8 GB it's cheap insurance. ────────────────────────
if ! swapon --show | grep -q '/swapfile'; then
  log "Creating 4 GB swap file"
  fallocate -l 4G /swapfile
  chmod 600 /swapfile
  mkswap /swapfile
  swapon /swapfile
  echo '/swapfile none swap sw 0 0' >> /etc/fstab
  sysctl -w vm.swappiness=10
  echo 'vm.swappiness=10' > /etc/sysctl.d/99-swappiness.conf
else
  log "Swap already present — skipping"
fi

# ─── 3. Node.js 22 + pnpm + pm2 ───────────────────────────────────────────
if ! command -v node >/dev/null || [ "$(node -v | cut -c2- | cut -d. -f1)" != "$NODE_MAJOR" ]; then
  log "Installing Node.js ${NODE_MAJOR}"
  curl -fsSL "https://deb.nodesource.com/setup_${NODE_MAJOR}.x" | bash -
  apt-get install -y nodejs
fi
log "Node: $(node -v)  npm: $(npm -v)"

corepack enable
corepack prepare pnpm@11.9.0 --activate
npm install -g pm2@latest
log "pnpm: $(pnpm -v)  pm2: $(pm2 -v)"

# ─── 4. MariaDB ───────────────────────────────────────────────────────────
# MariaDB, NOT MySQL 8: the app's schema + every migration was built and run
# against Hostinger's MariaDB. MySQL 8 rejects some of that schema on import
# ("key too long", stricter defaults). Prisma's `mysql` provider drives both.
if ! command -v mariadbd >/dev/null && ! dpkg -l | grep -q mariadb-server; then
  log "Installing MariaDB server"
  apt-get install -y mariadb-server
fi
systemctl enable --now mariadb

log "Creating database '${DB_NAME}' and user '${DB_USER}'"
mariadb --protocol=socket <<SQL
CREATE DATABASE IF NOT EXISTS \`${DB_NAME}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER IF NOT EXISTS '${DB_USER}'@'localhost' IDENTIFIED BY '${DB_PASS}';
ALTER USER '${DB_USER}'@'localhost' IDENTIFIED BY '${DB_PASS}';
GRANT ALL PRIVILEGES ON \`${DB_NAME}\`.* TO '${DB_USER}'@'localhost';
FLUSH PRIVILEGES;
SQL

# Sane defaults for a single-app box: bind to localhost only, bigger packet
# for dump/import, connection ceiling well above Prisma's pool.
# innodb_buffer_pool_size kept modest so MariaDB + 3 Node processes + builds
# all fit in 4 GB (KVM 1). Bump to 1G–2G if you move to KVM 2 (8 GB).
mkdir -p /etc/mysql/mariadb.conf.d
# sql_mode: the app was built + run for months against Hostinger's lenient
# MariaDB. Modern MariaDB defaults to STRICT_TRANS_TABLES, which turns silent
# truncations / out-of-range enum values into hard errors (1265) — several
# columns in the imported schema are undersized (AI chat content, some
# notification enums) and every write to them 500'd on the VPS. Match the
# environment the app expects; widen the genuinely-oversized columns via
# proper migrations separately.
cat > /etc/mysql/mariadb.conf.d/99-jokas.cnf <<'CNF'
[mysqld]
bind-address            = 127.0.0.1
max_connections         = 150
max_allowed_packet      = 256M
innodb_buffer_pool_size = 512M
wait_timeout            = 28800
sql_mode                = "NO_ENGINE_SUBSTITUTION"
CNF
systemctl restart mariadb

# ─── 5. nginx + certbot ───────────────────────────────────────────────────
log "Installing nginx + certbot"
apt-get install -y nginx certbot python3-certbot-nginx
systemctl enable --now nginx

# ─── 6. App user + directory ──────────────────────────────────────────────
if ! id "$APP_USER" >/dev/null 2>&1; then
  log "Creating '$APP_USER' user"
  adduser --disabled-password --gecos "" "$APP_USER"
fi
mkdir -p "$APP_DIR" "$APP_DIR/shared/uploads" "$APP_DIR/backups"
# Repo lives in $APP_DIR/app ; uploads + backups live OUTSIDE it so deploys
# (which wipe/replace the repo) never touch them.
chown -R "$APP_USER:$APP_USER" "$APP_DIR"

# Let the deploy user reload nginx and its own pm2 without a password prompt.
cat > /etc/sudoers.d/jokas-deploy <<EOF
${APP_USER} ALL=(root) NOPASSWD: /usr/sbin/nginx -t, /bin/systemctl reload nginx, /usr/bin/certbot
EOF
chmod 440 /etc/sudoers.d/jokas-deploy

# ─── 7. Firewall + SSH hardening ─────────────────────────────────────────
log "Configuring firewall"
ufw --force reset
ufw default deny incoming
ufw default allow outgoing
ufw allow OpenSSH
ufw allow 'Nginx Full'
ufw --force enable

log "Hardening SSH (key-only, no root password login)"
sed -i 's/^#\?PermitRootLogin.*/PermitRootLogin prohibit-password/' /etc/ssh/sshd_config
sed -i 's/^#\?PasswordAuthentication.*/PasswordAuthentication no/'   /etc/ssh/sshd_config
systemctl restart ssh || systemctl restart sshd || true

# ─── 8. pm2 startup on boot (for the deploy user) ────────────────────────
log "Enabling pm2 on boot for '$APP_USER'"
env PATH="$PATH:/usr/bin" pm2 startup systemd -u "$APP_USER" --hp "/home/$APP_USER" | tail -1 | bash || true

cat <<DONE

============================================================================
 BOOTSTRAP COMPLETE
============================================================================
 App user .......... ${APP_USER}
 App directory ..... ${APP_DIR}/app        (repo goes here)
 Uploads ........... ${APP_DIR}/shared/uploads
 Backups ........... ${APP_DIR}/backups
 Database .......... mysql://${DB_USER}:<password>@localhost:3306/${DB_NAME}

 NEXT STEPS (see infra/vps/RUNBOOK.md):
   1. Copy your SSH public key to /home/${APP_USER}/.ssh/authorized_keys
   2. su - ${APP_USER}
   3. git clone <repo> ${APP_DIR}/app  &&  cd ${APP_DIR}/app
   4. cp infra/vps/.env.production.template .env   &&  edit it
   5. Import the database dump (RUNBOOK step 4)
   6. bash infra/vps/deploy.sh
   7. Install nginx site + run certbot (RUNBOOK step 6)
============================================================================
DONE

// ============================================================================
// Jokas ERP — PM2 process definitions for the VPS
// ----------------------------------------------------------------------------
// Used by infra/vps/deploy.sh:  pm2 startOrReload infra/vps/ecosystem.config.js
//
// Three long-running Node processes, each supervised + auto-restarted by PM2:
//   jokas-api        NestJS      127.0.0.1:4001
//   jokas-web        Next.js     127.0.0.1:3000   (admin dashboard)
//   jokas-storefront Next.js     127.0.0.1:3002   (customer shop, /shop)
//
// nginx terminates TLS on 443 and reverse-proxies to these three.
// The API reads the rest of its config (DATABASE_URL, JWT secrets, SMTP, …)
// from  <repo>/.env  via @nestjs/config, so it is NOT duplicated here.
// ============================================================================
const path = require("path");
const root = path.join(__dirname, "..", ".."); // <repo> root

const common = {
  instances: 1,
  exec_mode: "fork",
  autorestart: true,
  watch: false,
  max_restarts: 20,
  restart_delay: 3000,
  kill_timeout: 10000,
  time: true,
};

module.exports = {
  apps: [
    {
      ...common,
      name: "jokas-api",
      cwd: root,
      script: "apps/api/dist/main.js",
      // Ceilings sized for KVM 1 (4 GB): api+web+storefront ≈ 1.4 GB max,
      // leaving room for MySQL (~600 MB) + OS. Raise on KVM 2.
      max_memory_restart: "550M",
      env: {
        NODE_ENV: "production",
        API_PORT: "4001",
      },
    },
    {
      ...common,
      name: "jokas-web",
      cwd: root,
      script: "apps/web/.next/standalone/apps/web/server.js",
      max_memory_restart: "500M",
      env: {
        NODE_ENV: "production",
        PORT: "3000",
        HOSTNAME: "127.0.0.1",
      },
    },
    {
      ...common,
      name: "jokas-storefront",
      cwd: root,
      script: "apps/storefront/.next/standalone/apps/storefront/server.js",
      max_memory_restart: "350M",
      env: {
        NODE_ENV: "production",
        PORT: "3002",
        HOSTNAME: "127.0.0.1",
      },
    },
  ],
};

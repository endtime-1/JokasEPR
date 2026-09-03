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
  // Audit M5: 20 was low enough that a crash-loop (bad deploy, DB down on
  // boot) exhausted it in ~60s and the process then stayed dead with no
  // alert. Keep trying, but with exponential backoff so a genuinely broken
  // build doesn't thrash the box.
  max_restarts: 100,
  min_uptime: 20000,
  exp_backoff_restart_delay: 200,
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
      // Ceilings for KVM 1 (4 GB): api 900 + web 700 + storefront 400 ≈ 2 GB,
      // leaving ~2 GB for MariaDB + OS. Audit M5: the old 550 MB API ceiling
      // could kill the process mid-request during a large report / PDF build
      // (legitimate transient allocation), producing an intermittent 502.
      max_memory_restart: "900M",
      env: {
        NODE_ENV: "production",
        API_PORT: "4001",
      },
    },
    {
      ...common,
      name: "jokas-web",
      // Serve from the stable release dir, NOT apps/web/.next — `next build`
      // wipes .next for 10-15 min every deploy, which used to 400 the whole
      // site. deploy.sh rsyncs the verified build into /opt/jokas/live/web
      // only at the very end. (Run `pm2 delete jokas-web` once when adopting.)
      cwd: "/opt/jokas/live/web/apps/web",
      script: "/opt/jokas/live/web/apps/web/server.js",
      max_memory_restart: "700M",
      env: {
        NODE_ENV: "production",
        PORT: "3000",
        HOSTNAME: "127.0.0.1",
        // The /api/auth/* and /api/setup* route handlers proxy to NestJS.
        // Point them straight at the local API instead of round-tripping
        // out through the public HTTPS URL.
        API_INTERNAL_URL: "http://127.0.0.1:4001/api/v1",
        API_PORT: "4001",
      },
    },
    {
      ...common,
      name: "jokas-storefront",
      cwd: "/opt/jokas/live/storefront/apps/storefront",
      script: "/opt/jokas/live/storefront/apps/storefront/server.js",
      max_memory_restart: "400M",
      env: {
        NODE_ENV: "production",
        PORT: "3002",
        HOSTNAME: "127.0.0.1",
      },
    },
  ],
};

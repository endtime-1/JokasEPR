const path = require("path");
const root = __dirname;

// NOTE: Jokas ERP runs under Hostinger Passenger (start.js) in production.
// This PM2 config is a fallback for local development or VPS deployments.
// API_PORT must match start.js (default 4001). Web runs on 3000, storefront on 3002.

module.exports = {
  apps: [
    {
      name: "jokas-api",
      script: path.join(root, "apps/api/dist/main.js"),
      instances: 1,
      autorestart: true,
      watch: false,
      env: {
        NODE_ENV: "production",
        PORT: "4001",
        API_PORT: "4001",
      },
    },
    {
      name: "jokas-web",
      cwd: path.join(root, "apps/web/.next/standalone"),
      script: "server.js",
      instances: 1,
      autorestart: true,
      watch: false,
      env: {
        NODE_ENV: "production",
        PORT: "3000",
        HOSTNAME: "0.0.0.0",
      },
    },
    {
      name: "jokas-storefront",
      cwd: path.join(root, "apps/storefront/.next/standalone"),
      script: "server.js",
      instances: 1,
      autorestart: true,
      watch: false,
      env: {
        NODE_ENV: "production",
        PORT: "3002",
        HOSTNAME: "0.0.0.0",
      },
    },
  ],
};

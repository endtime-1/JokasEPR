const path = require("path");
const root = __dirname;

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
        PORT: "3001",
      },
    },
    {
      name: "jokas-web",
      // Next.js standalone output: run server.js from within the standalone dir
      cwd: path.join(root, "apps/web/.next/standalone"),
      script: "apps/web/server.js",
      instances: 1,
      autorestart: true,
      watch: false,
      env: {
        NODE_ENV: "production",
        PORT: "3000",
        HOSTNAME: "0.0.0.0",
      },
    },
  ],
};

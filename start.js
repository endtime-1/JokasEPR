#!/usr/bin/env node
"use strict";
const { spawn } = require("child_process");
const path = require("path");

const root = __dirname;

function launch(name, script, cwd, env) {
  console.log(`[start] launching ${name} (${script})`);
  const proc = spawn("node", [script], {
    cwd,
    stdio: "inherit",
    env: { ...process.env, ...env },
  });
  proc.on("error", (err) => {
    console.error(`[start] ${name} error:`, err.message);
    process.exit(1);
  });
  proc.on("close", (code) => {
    console.error(`[start] ${name} exited with code ${code}`);
    process.exit(code ?? 1);
  });
  return proc;
}

const API_PORT = process.env.API_PORT || "3001";
const WEB_PORT = process.env.PORT || "3000";

const api = launch(
  "jokas-api",
  path.join(root, "apps/api/dist/main.js"),
  path.join(root, "apps/api"),
  { NODE_ENV: "production", PORT: API_PORT }
);

const web = launch(
  "jokas-web",
  "apps/web/server.js",
  path.join(root, "apps/web/.next/standalone"),
  { NODE_ENV: "production", PORT: WEB_PORT, HOSTNAME: "0.0.0.0" }
);

["SIGTERM", "SIGINT"].forEach((sig) => {
  process.on(sig, () => {
    api.kill(sig);
    web.kill(sig);
  });
});

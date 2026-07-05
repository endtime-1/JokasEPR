#!/usr/bin/env node
"use strict";
const { spawn } = require("child_process");
const net = require("net");
const path = require("path");

const root = __dirname;
const PORT = parseInt(process.env.PORT || "3000", 10);
const API_PORT = parseInt(process.env.API_PORT || "4001", 10);
const WEB_INTERNAL_PORT = 3001;

const standaloneDir = path.join(root, "apps/web/.next/standalone");
const serverScript = path.join(standaloneDir, "apps/web", "server.js");
const apiScript = path.join(root, "apps/api/dist/main.js");

// Print env state so runtime logs show whether Hostinger injected the vars.
console.log("[start] env check — DATABASE_URL:", process.env.DATABASE_URL ? "SET" : "MISSING",
  "| JWT_ACCESS_SECRET:", process.env.JWT_ACCESS_SECRET ? "SET" : "MISSING",
  "| PORT:", process.env.PORT, "| API_PORT:", process.env.API_PORT);

function launch(name, script, cwd, env) {
  console.log(`[start] launching ${name}`);
  const proc = spawn(process.execPath, [script], {
    cwd,
    // Route child stderr → parent stdout so all output appears in runtime logs.
    stdio: ["inherit", "inherit", process.stdout],
    env: { ...process.env, ...env, NODE_ENV: "production" },
  });
  proc.on("error", (err) => console.error(`[start] ${name} spawn error:`, err.message));
  proc.on("close", (code) => {
    console.log(`[start] ${name} exited with code ${code}`);
    if (name === "jokas-api") {
      // API crash: keep the web running, restart API after 3 s.
      console.log("[start] API crashed — restarting in 3 s");
      setTimeout(() => { api = launch("jokas-api", apiScript, path.join(root, "apps/api"), { PORT: String(API_PORT) }); }, 3000);
    } else {
      web.kill();
      api.kill();
      bridge.close();
      process.exit(code ?? 1);
    }
  });
  return proc;
}

let web = launch("jokas-web", serverScript, standaloneDir, {
  PORT: String(WEB_INTERNAL_PORT),
  HOSTNAME: "0.0.0.0",
});

let api = launch("jokas-api", apiScript, path.join(root, "apps/api"), {
  PORT: String(API_PORT),
});

const bridge = net.createServer((socket) => {
  const upstream = net.connect(WEB_INTERNAL_PORT, "127.0.0.1");
  socket.pipe(upstream);
  upstream.pipe(socket);
  upstream.on("error", () => socket.destroy());
  socket.on("error", () => upstream.destroy());
});

bridge.listen(PORT, "0.0.0.0", () => {
  console.log(`[start] bridge listening on port ${PORT} → Next.js :${WEB_INTERNAL_PORT}`);
});

["SIGTERM", "SIGINT"].forEach((sig) => {
  process.on(sig, () => {
    web.kill(sig);
    api.kill(sig);
    bridge.close();
    process.exit(0);
  });
});

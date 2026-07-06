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

console.log("[start] env — DATABASE_URL:", process.env.DATABASE_URL ? "SET" : "MISSING",
  "| JWT:", process.env.JWT_ACCESS_SECRET ? "SET" : "MISSING",
  "| PORT:", process.env.PORT, "| API_PORT:", process.env.API_PORT);

// Track all child processes so we can kill them before this process exits.
// Without this, orphaned children hold ports and the next restart gets EADDRINUSE.
const children = [];

function killAll(sig) {
  for (const c of children) {
    try { c.kill(sig || "SIGTERM"); } catch {}
  }
}

// Kill children synchronously on any exit so ports are released immediately.
process.on("exit", () => killAll("SIGTERM"));

["SIGTERM", "SIGINT"].forEach((sig) => {
  process.on(sig, () => { killAll(sig); bridge.close(); process.exit(0); });
});

function launch(name, script, cwd, env) {
  console.log(`[start] launching ${name}`);
  const proc = spawn(process.execPath, [script], {
    cwd,
    stdio: "inherit",
    env: { ...process.env, ...env, NODE_ENV: "production" },
  });
  children.push(proc);
  proc.on("error", (err) => console.error(`[start] ${name} error:`, err.message));
  return proc;
}

// TCP bridge — bind PORT immediately, pipe all sockets to Next.js on WEB_INTERNAL_PORT.
const bridge = net.createServer((socket) => {
  const upstream = net.connect(WEB_INTERNAL_PORT, "127.0.0.1");
  socket.pipe(upstream);
  upstream.pipe(socket);
  upstream.on("error", () => socket.destroy());
  socket.on("error", () => upstream.destroy());
});

bridge.listen(PORT, "0.0.0.0", () => {
  console.log(`[start] bridge listening on port ${PORT} → Next.js :${WEB_INTERNAL_PORT}`);
  // Some process managers (PM2, Hostinger) require this signal to mark the app ready.
  if (process.send) process.send("ready");
});

// Next.js web server on internal port.
const web = launch("jokas-web", serverScript, standaloneDir, {
  PORT: String(WEB_INTERNAL_PORT),
  HOSTNAME: "0.0.0.0",
});
web.on("close", (code) => {
  console.log(`[start] web exited (${code}) — shutting down`);
  bridge.close();
  process.exit(code ?? 1);
});

// NestJS API — auto-restarts on crash so web keeps serving.
// stderr is piped to stdout so errors appear in Hostinger's runtime logs.
let apiRestarts = 0;
function startApi() {
  console.log("[start] launching jokas-api");
  const proc = spawn(process.execPath, [apiScript], {
    cwd: path.join(root, "apps/api"),
    stdio: ["inherit", "inherit", "pipe"],
    env: { ...process.env, PORT: String(API_PORT), NODE_ENV: "production" },
  });
  children.push(proc);
  proc.on("error", (err) => console.error("[start] jokas-api error:", err.message));
  // Forward API stderr → stdout so it shows in Hostinger runtime logs.
  proc.stderr.on("data", (chunk) => process.stdout.write(`[api-err] ${chunk}`));
  proc.on("close", (code) => {
    apiRestarts++;
    const delay = Math.min(3000 * apiRestarts, 30000);
    console.log(`[start] API exited (${code}) — restart #${apiRestarts} in ${delay}ms`);
    setTimeout(startApi, delay);
  });
}
startApi();

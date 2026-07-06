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

const children = [];

function killAll(sig) {
  for (const c of children) {
    try { c.kill(sig || "SIGTERM"); } catch {}
  }
}

process.on("exit", () => killAll("SIGTERM"));

["SIGTERM", "SIGINT"].forEach((sig) => {
  process.on(sig, () => { killAll(sig); bridge.close(); process.exit(0); });
});

// Pipe child stdout+stderr through start.js stdout so Hostinger captures all output.
function launch(name, script, cwd, env) {
  console.log(`[start] launching ${name}`);
  const proc = spawn(process.execPath, [script], {
    cwd,
    stdio: ["inherit", "pipe", "pipe"],
    env: { ...process.env, ...env, NODE_ENV: "production" },
  });
  children.push(proc);
  proc.stdout.on("data", (d) => process.stdout.write(`[${name}] ` + d));
  proc.stderr.on("data", (d) => process.stdout.write(`[${name}-ERR] ` + d));
  proc.on("error", (err) => console.error(`[start] ${name} spawn error:`, err.message));
  return proc;
}

const bridge = net.createServer((socket) => {
  const upstream = net.connect(WEB_INTERNAL_PORT, "127.0.0.1");
  socket.pipe(upstream);
  upstream.pipe(socket);
  upstream.on("error", () => socket.destroy());
  socket.on("error", () => upstream.destroy());
});

bridge.listen(PORT, "0.0.0.0", () => {
  console.log(`[start] bridge listening on port ${PORT} → Next.js :${WEB_INTERNAL_PORT}`);
  if (process.send) process.send("ready");
});

bridge.on("error", (err) => {
  console.error("[start] bridge error:", err.message);
});

const web = launch("jokas-web", serverScript, standaloneDir, {
  PORT: String(WEB_INTERNAL_PORT),
  HOSTNAME: "0.0.0.0",
});
web.on("close", (code) => {
  console.log(`[start] web exited (${code}) — shutting down`);
  bridge.close();
  process.exit(code ?? 1);
});

let apiRestarts = 0;
function startApi() {
  const proc = launch("jokas-api", apiScript, path.join(root, "apps/api"), {
    PORT: String(API_PORT),
  });
  proc.on("close", (code) => {
    apiRestarts++;
    const delay = Math.min(3000 * apiRestarts, 30000);
    console.log(`[start] API exited (${code}) — restart #${apiRestarts} in ${delay}ms`);
    setTimeout(startApi, delay);
  });
}
startApi();

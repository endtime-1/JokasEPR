#!/usr/bin/env node
"use strict";
// Hostinger requires the entry-file process to call listen() within 3 seconds.
// When we require() Next.js server.js from here, require.main.filename points
// to start.js so Next.js can't resolve its own compiled files and crashes
// before calling listen(). Solution: run both servers as child processes and
// listen() here immediately via a TCP bridge that forwards to Next.js.
const { spawn } = require("child_process");
const net = require("net");
const path = require("path");

const root = __dirname;
const PORT = parseInt(process.env.PORT || "3000", 10);
const API_PORT = parseInt(process.env.API_PORT || "4001", 10);
const WEB_INTERNAL_PORT = 3001; // Next.js binds here; bridge forwards $PORT → 3001

const standaloneDir = path.join(root, "apps/web/.next/standalone");
const serverScript = path.join(standaloneDir, "apps/web", "server.js");
const apiScript = path.join(root, "apps/api/dist/main.js");

function launch(name, script, cwd, env) {
  console.log(`[start] launching ${name}`);
  const proc = spawn(process.execPath, [script], {
    cwd,
    stdio: "inherit",
    env: { ...process.env, ...env, NODE_ENV: "production" },
  });
  proc.on("error", (err) => {
    console.error(`[start] ${name} error:`, err.message);
  });
  proc.on("close", (code) => {
    console.error(`[start] ${name} exited with code ${code} — shutting down`);
    web.kill();
    api.kill();
    process.exit(code ?? 1);
  });
  return proc;
}

const web = launch("jokas-web", serverScript, standaloneDir, {
  PORT: String(WEB_INTERNAL_PORT),
  HOSTNAME: "0.0.0.0",
});

const api = launch("jokas-api", apiScript, path.join(root, "apps/api"), {
  PORT: String(API_PORT),
});

// TCP bridge: bind $PORT immediately so Hostinger detects listen() within 3s,
// then pipe every socket through to the Next.js process on WEB_INTERNAL_PORT.
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

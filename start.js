#!/usr/bin/env node
"use strict";
const { spawn, execSync } = require("child_process");
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

// Kill zombie processes from a previous deployment that hold our ports.
function freePort(port) {
  try {
    execSync(`fuser -k ${port}/tcp 2>/dev/null`, { timeout: 2000 });
    console.log(`[start] freed port ${port}`);
  } catch { /* fuser exits 1 if nothing found — that is fine */ }
}
freePort(PORT);
freePort(WEB_INTERNAL_PORT);

const children = [];
// Flipped to true when Next.js logs "Ready". Until then the bridge
// returns a quick HTTP 200 so Hostinger's 3-second health check passes.
let webReady = false;

function killAll(sig) {
  for (const c of children) { try { c.kill(sig || "SIGTERM"); } catch {} }
}
process.on("exit", () => killAll("SIGTERM"));

// Pipe both stdout and stderr from children through start.js so
// Hostinger's runtime log viewer captures them.
function launch(name, script, cwd, env) {
  console.log(`[start] launching ${name}`);
  const proc = spawn(process.execPath, [script], {
    cwd,
    stdio: ["inherit", "pipe", "pipe"],
    env: { ...process.env, ...env, NODE_ENV: "production" },
  });
  children.push(proc);
  proc.stdout.on("data", (d) => {
    const s = d.toString();
    process.stdout.write(`[${name}] ` + s);
    // Next.js standalone prints "✓ Ready in Xs" when the server is
    // fully initialised and ready to handle requests.
    if (name === "jokas-web" && s.includes("Ready")) {
      webReady = true;
      console.log("[start] Next.js is ready — forwarding live traffic");
    }
  });
  proc.stderr.on("data", (d) => process.stdout.write(`[${name}-ERR] ` + d));
  proc.on("error", (err) => console.error(`[start] ${name} spawn error:`, err.message));
  return proc;
}

// Bridge socket handler.
// While Next.js is initialising (webReady=false) return an instant HTTP 200
// so Hostinger's health check doesn't time out. Once webReady, pipe traffic
// bidirectionally to Next.js on WEB_INTERNAL_PORT.
function handleSocket(socket) {
  if (!webReady) {
    const body = "Starting up. Please refresh in a few seconds.";
    socket.end(
      "HTTP/1.1 200 OK\r\n" +
      "Content-Type: text/html; charset=utf-8\r\n" +
      `Content-Length: ${Buffer.byteLength(body)}\r\n` +
      "Connection: close\r\n\r\n" + body
    );
    return;
  }
  const upstream = net.connect(WEB_INTERNAL_PORT, "127.0.0.1");
  socket.pipe(upstream);
  upstream.pipe(socket);
  upstream.on("error", () => socket.destroy());
  socket.on("error", () => upstream.destroy());
}

// Start bridge, retrying on EADDRINUSE so a slow-dying zombie doesn't
// block us permanently. 6 retries × 500 ms = 3 s — still within the
// window before Next.js would be ready anyway.
let bridge;
let bridgeAttempts = 0;

function onBridgeError(err) {
  if (err.code === "EADDRINUSE" && bridgeAttempts < 6) {
    bridgeAttempts++;
    console.log(`[start] port ${PORT} busy, retry #${bridgeAttempts} in 500ms`);
    setTimeout(startBridge, 500);
  } else {
    console.error("[start] bridge fatal:", err.message);
  }
}

function startBridge() {
  bridge = net.createServer(handleSocket);
  bridge.once("error", onBridgeError);
  bridge.listen(PORT, "0.0.0.0", () => {
    console.log(`[start] bridge listening on port ${PORT} → Next.js :${WEB_INTERNAL_PORT}`);
    if (process.send) process.send("ready");
  });
}

startBridge();

["SIGTERM", "SIGINT"].forEach((sig) => {
  process.on(sig, () => {
    killAll(sig);
    if (bridge) bridge.close();
    process.exit(0);
  });
});

const web = launch("jokas-web", serverScript, standaloneDir, {
  PORT: String(WEB_INTERNAL_PORT),
  HOSTNAME: "0.0.0.0",
});
web.on("close", (code) => {
  console.log(`[start] web exited (${code}) — shutting down`);
  if (bridge) bridge.close();
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

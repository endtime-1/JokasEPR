#!/usr/bin/env node
"use strict";
const { spawn, execSync } = require("child_process");
const http = require("http");
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

// Free zombie processes from a previous deployment that may hold our ports.
function freePort(port) {
  try {
    execSync(`fuser -k ${port}/tcp 2>/dev/null`, { timeout: 2000 });
    console.log(`[start] freed port ${port}`);
  } catch { /* fuser exits 1 when nothing found — fine */ }
}
freePort(PORT);
freePort(WEB_INTERNAL_PORT);
freePort(API_PORT);

const children = [];
// Set true when Next.js reports "Ready". Before that, the proxy returns an
// instant HTTP 200 so Hostinger's 3-second health check passes even though
// Next.js is still initialising.
let webReady = false;

function killAll(sig) {
  for (const c of children) { try { c.kill(sig || "SIGTERM"); } catch {} }
}
process.on("exit", () => killAll("SIGTERM"));

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
    if (name === "jokas-web" && s.includes("Ready")) {
      webReady = true;
      console.log("[start] Next.js ready — live traffic forwarding enabled");
    }
  });
  proc.stderr.on("data", (d) => process.stdout.write(`[${name}-ERR] ` + d));
  proc.on("error", (err) => console.error(`[start] ${name} spawn error:`, err.message));
  return proc;
}

// HTTP request handler — forwards to Next.js once it is ready; returns an
// instant 200 "Starting up" page while it is still initialising.
// Using http.createServer (not net.createServer) so Hostinger's patched
// http.Server.prototype.listen is triggered and satisfies the 3-second check.
function handleRequest(req, res) {
  if (!webReady) {
    res.writeHead(200, {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
    });
    res.end(
      "<!doctype html><html><head>" +
      "<meta http-equiv='refresh' content='2'>" +
      "</head><body>Starting up. Refreshing automatically…</body></html>"
    );
    return;
  }
  const upstream = http.request(
    {
      hostname: "127.0.0.1",
      port: WEB_INTERNAL_PORT,
      path: req.url,
      method: req.method,
      headers: req.headers,
    },
    (proxyRes) => {
      res.writeHead(proxyRes.statusCode, proxyRes.headers);
      proxyRes.pipe(res);
    }
  );
  upstream.on("error", () => {
    if (!res.headersSent) { res.writeHead(502); res.end("Bad Gateway"); }
  });
  req.pipe(upstream);
}

// WebSocket upgrade — pipe raw TCP once the upgrade handshake is forwarded.
function handleUpgrade(req, clientSocket, head) {
  const up = net.connect(WEB_INTERNAL_PORT, "127.0.0.1", () => {
    let headers = `${req.method} ${req.url} HTTP/1.1\r\n`;
    for (const [k, v] of Object.entries(req.headers)) headers += `${k}: ${v}\r\n`;
    up.write(headers + "\r\n");
    if (head && head.length) up.write(head);
    clientSocket.pipe(up);
    up.pipe(clientSocket);
  });
  up.on("error", () => clientSocket.destroy());
  clientSocket.on("error", () => up.destroy());
}

// Start the HTTP proxy, retrying on EADDRINUSE so a slow-dying zombie
// does not permanently block us.  6 × 500 ms = 3 s max wait.
let proxy;
let proxyAttempt = 0;

function startProxy(attempt) {
  const p = http.createServer(handleRequest);
  proxy = p;
  p.on("upgrade", handleUpgrade);
  p.once("error", (err) => {
    if (err.code === "EADDRINUSE" && attempt < 6) {
      console.log(`[start] port ${PORT} busy, retry #${attempt + 1} in 500ms`);
      setTimeout(() => startProxy(attempt + 1), 500);
    } else {
      console.error("[start] proxy fatal:", err.message);
    }
  });
  p.listen(PORT, "0.0.0.0", () => {
    console.log(`[start] HTTP proxy listening on port ${PORT} → Next.js :${WEB_INTERNAL_PORT}`);
    if (process.send) process.send("ready");
  });
}

startProxy(0);

["SIGTERM", "SIGINT"].forEach((sig) => {
  process.on(sig, () => {
    killAll(sig);
    if (proxy) proxy.close();
    process.exit(0);
  });
});

const web = launch("jokas-web", serverScript, standaloneDir, {
  PORT: String(WEB_INTERNAL_PORT),
  HOSTNAME: "0.0.0.0",
});
web.on("close", (code) => {
  console.log(`[start] web exited (${code}) — shutting down`);
  if (proxy) proxy.close();
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

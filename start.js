#!/usr/bin/env node
"use strict";
const { spawn, execSync } = require("child_process");
const fs = require("fs");
const http = require("http");
const net = require("net");
const path = require("path");

const root = __dirname;

// Write a rich health file immediately. This is overwritten every time
// start.js runs, so the timestamp tells us exactly when it last ran.
// Includes runtime package.json info so we know what pnpm install saw.
try {
  let pkgDeps = "unreadable";
  let lockfileType = "unreadable";
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
    pkgDeps = String(Object.keys(pkg.dependencies || {}).length);
  } catch {}
  try {
    const lock = fs.readFileSync(path.join(root, "pnpm-lock.yaml"), "utf8");
    lockfileType = lock.length < 600 ? "MINIMAL(ok)" : "FULL(" + lock.length + "bytes — PROBLEM)";
  } catch { lockfileType = "missing(ok)"; }
  fs.writeFileSync(
    path.join(root, "../public_html/health.txt"),
    [
      "start.js running",
      "pid=" + process.pid,
      "node=" + process.version,
      "port=" + (process.env.PORT || "?"),
      "time=" + new Date().toISOString(),
      "pkg_deps=" + pkgDeps + " (should be 0)",
      "lockfile=" + lockfileType,
      "root=" + root,
    ].join("\n") + "\n"
  );
} catch (_) {}

const PORT = parseInt(process.env.PORT || "3000", 10);
const API_PORT = parseInt(process.env.API_PORT || "4001", 10);
const WEB_INTERNAL_PORT = 3001;

const standaloneDir = path.join(root, "apps/web/.next/standalone");
const serverScript = path.join(standaloneDir, "apps/web", "server.js");
// Prefer the esbuild bundle (self-contained, no node_modules needed).
// Fall back to tsc output if bundle wasn't created.
const apiBundle = path.join(root, "apps/api/dist/bundle.js");
const apiScript = fs.existsSync(apiBundle)
  ? apiBundle
  : path.join(root, "apps/api/dist/main.js");

// ---------------------------------------------------------------------------
// Kill any process listening on a given port.
// Tries four methods so we don't depend on a single tool being available.
// ---------------------------------------------------------------------------
function killPortOwner(port) {
  // 1. fuser with -k (kill) flag — -signal alone is silently ignored without -k
  for (const sig of ["-9", "-KILL"]) {
    try {
      execSync(`fuser -k ${sig} ${port}/tcp 2>/dev/null`, { timeout: 3000 });
      console.log(`[start] killed port ${port} owner via fuser -k ${sig}`);
      return;
    } catch {}
  }

  // 2. lsof
  try {
    const pids = execSync(`lsof -ti :${port} 2>/dev/null`, {
      timeout: 3000, encoding: "utf8",
    }).trim();
    if (pids) {
      for (const pid of pids.split("\n")) {
        try { process.kill(parseInt(pid), "SIGKILL"); } catch {}
      }
      console.log(`[start] killed port ${port} owner(s) via lsof: ${pids.replace(/\n/g, ",")}`);
      return;
    }
  } catch {}

  // 3. Parse /proc/net/tcp[6] — pure Node.js, always works on Linux.
  //    Finds the socket inode for the port, then walks /proc/PID/fd to
  //    identify which process owns it.
  const hexPort = port.toString(16).toUpperCase().padStart(4, "0");
  let inode = null;

  for (const file of ["/proc/net/tcp", "/proc/net/tcp6"]) {
    if (inode) break;
    try {
      const lines = fs.readFileSync(file, "utf8").split("\n").slice(1);
      for (const line of lines) {
        const cols = line.trim().split(/\s+/);
        if (cols.length < 10) continue;
        const localPort = cols[1]?.split(":")[1]?.toUpperCase();
        const state = cols[3];
        if (localPort === hexPort && state === "0A") { // 0A = TCP_LISTEN
          inode = cols[9];
          break;
        }
      }
    } catch {}
  }

  if (inode) {
    try {
      for (const pid of fs.readdirSync("/proc").filter(d => /^\d+$/.test(d))) {
        try {
          for (const fd of fs.readdirSync(`/proc/${pid}/fd`)) {
            try {
              if (fs.readlinkSync(`/proc/${pid}/fd/${fd}`).includes(`socket:[${inode}]`)) {
                process.kill(parseInt(pid), "SIGKILL");
                console.log(`[start] killed PID ${pid} (held port ${port}, socket inode ${inode})`);
                return;
              }
            } catch {}
          }
        } catch {}
      }
    } catch {}
  }

  console.log(`[start] could not identify owner of port ${port} — will wait`);
}

// ---------------------------------------------------------------------------
// Orphan cleanup via PID file
// Hostinger may SIGKILL start.js (uncatchable); children are then orphaned
// and keep holding ports. On next boot we read the PID file and kill them.
// ---------------------------------------------------------------------------
const PID_FILE = path.join("/tmp", "jokas-child-pids.json");

function killOrphans() {
  try {
    const pids = JSON.parse(fs.readFileSync(PID_FILE, "utf8"));
    let n = 0;
    for (const pid of pids) {
      try { process.kill(pid, "SIGKILL"); n++; } catch {}
    }
    if (n) console.log(`[start] SIGKILLed ${n} orphaned child(ren) from previous run`);
    fs.unlinkSync(PID_FILE);
  } catch {}
}

// Surface any crash that would otherwise kill the process silently.
process.on("uncaughtException", (e) => {
  console.error("[start] uncaughtException:", e?.stack || e);
});
process.on("unhandledRejection", (reason) => {
  console.error("[start] unhandledRejection:", reason?.stack || reason);
});
process.on("exit", (code) => {
  process.stdout.write(`[start] process.exit code=${code}\n`);
});

// ---------------------------------------------------------------------------
// Child tracking
// ---------------------------------------------------------------------------
let webProc = null;
let apiProc = null;
let proxy;
let webReady = false;   // proxy switch — true only when BOTH next.js and api are up
let _nextjsUp = false;  // next.js has bound its port
let _apiUp = false;     // nestjs has bound its port
let webRestarts = 0;
let lastWebLines = [];  // last 20 lines of web stdout/stderr for diagnostics

function checkBothReady() {
  if (_nextjsUp && _apiUp && !webReady) {
    webReady = true;
    console.log("[start] Next.js + API both ready — enabling live traffic");
  }
}

function killAll() {
  if (webProc) { try { webProc.kill("SIGKILL"); } catch {} }
  if (apiProc) { try { apiProc.kill("SIGKILL"); } catch {} }
}

function savePids() {
  const pids = [];
  if (webProc?.pid) pids.push(webProc.pid);
  if (apiProc?.pid) pids.push(apiProc.pid);
  try { fs.writeFileSync(PID_FILE, JSON.stringify(pids)); } catch {}
}

process.on("exit", killAll);
["SIGTERM", "SIGINT"].forEach((sig) => {
  process.on(sig, () => {
    console.log(`[start] received ${sig} — shutting down`);
    killAll();
    if (proxy) proxy.close();
    process.exit(0);
  });
});

// ---------------------------------------------------------------------------
// Port availability probe — waits until nothing listens on the port
// ---------------------------------------------------------------------------
function waitForPortFree(port, maxWaitMs = 4000) {
  return new Promise((resolve) => {
    const deadline = Date.now() + maxWaitMs;
    function check() {
      const probe = net.createServer();
      probe.listen(port, "127.0.0.1", () => {
        probe.close(() => resolve());
      });
      probe.on("error", () => {
        if (Date.now() < deadline) {
          setTimeout(check, 100);
        } else {
          console.warn(`[start] port ${port} still busy after ${maxWaitMs}ms — launching anyway`);
          resolve();
        }
      });
    }
    check();
  });
}

// ---------------------------------------------------------------------------
// Child launcher
// ---------------------------------------------------------------------------
function launch(name, script, cwd, env) {
  if (!fs.existsSync(script)) {
    console.error(`[start] MISSING script for ${name}: ${script}`);
    return null;
  }
  console.log(`[start] launching ${name} — ${script}`);
  const proc = spawn(process.execPath, [script], {
    cwd,
    stdio: ["inherit", "pipe", "pipe"],
    env: { ...process.env, ...env, NODE_ENV: "production" },
  });
  proc.on("spawn", () => console.log(`[start] ${name} spawned PID=${proc.pid}`));
  proc.stdout.on("data", (d) => {
    const s = d.toString();
    process.stdout.write(`[${name}] ` + s);
    if (name === "jokas-web") {
      lastWebLines.push(...s.split("\n").filter(Boolean));
      if (lastWebLines.length > 20) lastWebLines = lastWebLines.slice(-20);
      if (!_nextjsUp && /\bready\b/i.test(s)) {
        _nextjsUp = true;
        console.log("[start] Next.js ready (stdout)");
        checkBothReady();
      }
    }
  });
  proc.stderr.on("data", (d) => {
    process.stdout.write(`[${name}-ERR] ` + d);
    if (name === "jokas-web") {
      lastWebLines.push(...("[ERR] " + d.toString()).split("\n").filter(Boolean));
      if (lastWebLines.length > 20) lastWebLines = lastWebLines.slice(-20);
    }
  });
  proc.on("error", (err) => console.error(`[start] ${name} spawn error:`, err.message));
  return proc;
}

// ---------------------------------------------------------------------------
// HTTP proxy (starts immediately — Hostinger requires listen() within 3s)
// ---------------------------------------------------------------------------
function handleRequest(req, res) {
  // Diagnostic endpoint — available even while webReady is false.
  if (req.url === "/__status") {
    const status = {
      webReady,
      webRestarts,
      serverScriptExists: fs.existsSync(serverScript),
      serverScript,
      apiScriptExists: fs.existsSync(apiScript),
      lastWebLines,
      pid: process.pid,
      uptime: Math.round(process.uptime()) + "s",
      time: new Date().toISOString(),
    };
    res.writeHead(200, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
    res.end(JSON.stringify(status, null, 2));
    return;
  }
  if (!webReady) {
    // 503 (not 200): fetch() callers check r.ok / status — a 200 fools them into thinking
    // the request succeeded when it actually hit the startup page. refreshSession() returned
    // "ok", apiFetch skipped its TRANSIENT_STATUSES retry, and auth-context skipped its
    // !res.ok retry — all because the status code was 200. Browsers render HTML on 503 just
    // fine and the meta-refresh still fires, so the user experience is identical.
    res.writeHead(503, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store", "retry-after": "2" });
    res.end("<!doctype html><html><head><meta http-equiv='refresh' content='2'></head>" +
      "<body>Starting up. Refreshing automatically…</body></html>");
    return;
  }
  const up = http.request(
    { hostname: "127.0.0.1", port: WEB_INTERNAL_PORT, path: req.url, method: req.method, headers: req.headers },
    (pRes) => { res.writeHead(pRes.statusCode, pRes.headers); pRes.pipe(res); }
  );
  up.on("error", () => { if (!res.headersSent) { res.writeHead(502); res.end("Bad Gateway"); } });
  req.pipe(up);
}

function handleUpgrade(req, clientSocket, head) {
  const up = net.connect(WEB_INTERNAL_PORT, "127.0.0.1", () => {
    let hdrs = `${req.method} ${req.url} HTTP/1.1\r\n`;
    for (const [k, v] of Object.entries(req.headers)) hdrs += `${k}: ${v}\r\n`;
    up.write(hdrs + "\r\n");
    if (head && head.length) up.write(head);
    clientSocket.pipe(up); up.pipe(clientSocket);
  });
  up.on("error", () => clientSocket.destroy());
  clientSocket.on("error", () => up.destroy());
}

function startProxy(attempt) {
  const p = http.createServer(handleRequest);
  proxy = p;
  p.on("upgrade", handleUpgrade);
  p.once("error", (err) => {
    if (err.code === "EADDRINUSE" && attempt < 8) {
      console.log(`[start] port ${PORT} busy, retry #${attempt + 1} in 500ms`);
      setTimeout(() => startProxy(attempt + 1), 500);
    } else {
      console.error("[start] proxy fatal:", err.message);
    }
  });
  p.listen(PORT, "0.0.0.0", () => {
    console.log(`[start] HTTP proxy listening on ${PORT} → Next.js :${WEB_INTERNAL_PORT}`);
    // Write proof that port 3000 was successfully bound.
    // If health.txt exists but proxy-bound.txt does NOT, port 3000 was in use.
    try {
      fs.writeFileSync(
        path.join(root, "../public_html/proxy-bound.txt"),
        "proxy listening on port " + PORT + "\ntime=" + new Date().toISOString() + "\n"
      );
    } catch {}
    if (process.send) process.send("ready");
  });
}

// ---------------------------------------------------------------------------
// Bind proxy port FIRST — before any slow sync operations.
// Hostinger/Passenger requires listen() within seconds of start.
// Kill any leftover process holding PORT before we try to listen.
// NOTE: do NOT write .htaccess here. post-build.js writes it at build time
// and Hostinger appends PassengerStartupFile directives afterward. If start.js
// overwrites .htaccess it removes those directives, OpenLiteSpeed reloads,
// Passenger kills this process, and port 3000 goes dark → persistent 503.
// ---------------------------------------------------------------------------
killPortOwner(PORT);
startProxy(0);

// ---------------------------------------------------------------------------
// All post-startup work is async — fs.promises.cp/rm never block the event
// loop, so the proxy answers LiteSpeed's health check immediately on every
// request throughout the startup sequence (no 503 from backend timeout).
// ---------------------------------------------------------------------------
(async () => {
  console.log("[start] env — DATABASE_URL:", process.env.DATABASE_URL ? "SET" : "MISSING",
    "| JWT:", process.env.JWT_ACCESS_SECRET ? "SET" : "MISSING",
    "| PORT:", process.env.PORT, "| API_PORT:", process.env.API_PORT);

  killOrphans();

  // ── Async Prisma restore ─────────────────────────────────────────────────
  const clientDir     = path.join(root, "node_modules/@prisma/client");
  const prismaDir     = path.join(root, "node_modules/.prisma/client");
  const clientBackup  = path.join(root, "apps/api/dist/prisma-client");
  const runtimeBackup = path.join(root, "apps/api/dist/prisma-runtime");

  console.log("[start] backup paths — client:", clientBackup, "| runtime:", runtimeBackup);

  if (fs.existsSync(clientBackup)) {
    try {
      await fs.promises.rm(clientDir, { recursive: true, force: true });
      await fs.promises.mkdir(path.dirname(clientDir), { recursive: true });
      await fs.promises.cp(clientBackup, clientDir, { recursive: true });
      console.log("[start] @prisma/client overwritten with generated backup");
    } catch (e) {
      console.error("[start] @prisma/client restore failed:", e.message);
    }
  } else {
    console.warn("[start] @prisma/client backup not found — API will likely fail");
  }

  if (!fs.existsSync(path.join(prismaDir, "default.js"))) {
    if (fs.existsSync(runtimeBackup)) {
      try {
        await fs.promises.rm(prismaDir, { recursive: true, force: true });
        await fs.promises.mkdir(path.dirname(prismaDir), { recursive: true });
        await fs.promises.cp(runtimeBackup, prismaDir, { recursive: true });
        console.log("[start] .prisma/client/ restored from backup");
        const engines = fs.readdirSync(prismaDir)
          .filter(f => f.includes("query_engine") || f.includes("libquery") || f.endsWith(".so.node"));
        console.log("[start] Prisma engine:", engines.length ? engines.join(", ") : "NONE FOUND");
      } catch (e) {
        console.error("[start] .prisma/client restore failed:", e.message);
      }
    } else {
      console.error("[start] prisma-runtime/ backup not found — API will fail");
    }
  } else {
    console.log("[start] .prisma/client/default.js present — OK");
  }

  // ── Kill any stale processes on child ports, then wait for them to free ──
  console.log(`[start] clearing ports ${WEB_INTERNAL_PORT} and ${API_PORT}…`);
  killPortOwner(WEB_INTERNAL_PORT);
  killPortOwner(API_PORT);
  await Promise.all([
    waitForPortFree(WEB_INTERNAL_PORT, 8000),
    waitForPortFree(API_PORT, 8000),
  ]);
  console.log("[start] ports clear");

  let dbUrl = process.env.DATABASE_URL || "";
  if (dbUrl.startsWith("mysql://")) {
    dbUrl = dbUrl.replace("@localhost:", "@127.0.0.1:");
    if (!dbUrl.includes("connect_timeout")) {
      dbUrl += (dbUrl.includes("?") ? "&" : "?") + "connect_timeout=10";
    }
    if (dbUrl !== process.env.DATABASE_URL) {
      console.log("[start] DATABASE_URL patched: localhost→127.0.0.1 + connect_timeout=10");
    }
  }

  // Poll WEB_INTERNAL_PORT via TCP every second until it accepts connections.
  // Fallback for when the "Ready" stdout string is missed.
  function pollWebPort(proc) {
    let stopped = false;
    proc.once("close", () => { stopped = true; });
    function probe() {
      if (stopped || _nextjsUp) return;
      const sock = net.createConnection(WEB_INTERNAL_PORT, "127.0.0.1");
      sock.setTimeout(1000);
      sock.once("connect", () => {
        sock.destroy();
        if (!_nextjsUp && !stopped) {
          _nextjsUp = true;
          console.log("[start] Next.js ready (TCP probe)");
          checkBothReady();
        }
      });
      sock.once("error", () => { sock.destroy(); if (!stopped && !_nextjsUp) setTimeout(probe, 1000); });
      sock.once("timeout", () => { sock.destroy(); if (!stopped && !_nextjsUp) setTimeout(probe, 1000); });
    }
    setTimeout(probe, 3000); // give the process 3s before polling
  }

  // Poll API_PORT via TCP until NestJS accepts connections.
  function pollApiPort(proc) {
    let stopped = false;
    proc.once("close", () => { stopped = true; });
    function probe() {
      if (stopped || _apiUp) return;
      const sock = net.createConnection(API_PORT, "127.0.0.1");
      sock.setTimeout(1000);
      sock.once("connect", () => {
        sock.destroy();
        if (!_apiUp && !stopped) {
          _apiUp = true;
          console.log("[start] NestJS API ready (TCP probe)");
          checkBothReady();
        }
      });
      sock.once("error", () => { sock.destroy(); if (!stopped && !_apiUp) setTimeout(probe, 1000); });
      sock.once("timeout", () => { sock.destroy(); if (!stopped && !_apiUp) setTimeout(probe, 1000); });
    }
    setTimeout(probe, 2000); // give the API 2s before polling
  }

  function startWeb() {
    if (!fs.existsSync(serverScript)) {
      console.error(`[start] web server.js missing at ${serverScript} — will retry in 30s`);
      setTimeout(startWeb, 30000);
      return;
    }
    webProc = launch("jokas-web", serverScript, standaloneDir, {
      PORT: String(WEB_INTERNAL_PORT),
      HOSTNAME: "0.0.0.0",
    });
    if (!webProc) {
      setTimeout(startWeb, 30000);
      return;
    }
    pollWebPort(webProc);
    webProc.on("close", (code, signal) => {
      webProc = null;
      webReady = false;
      _nextjsUp = false;
      webRestarts++;
      const delay = Math.min(3000 * webRestarts, 30000);
      console.log(`[start] web exited code=${code} signal=${signal} — restart #${webRestarts} in ${delay}ms`);
      setTimeout(startWeb, delay);
    });
  }
  startWeb();

  let apiRestarts = 0;
  function startApi() {
    apiProc = launch("jokas-api", apiScript, path.join(root, "apps/api"), {
      PORT: String(API_PORT),
      DATABASE_URL: dbUrl,
    });
    if (!apiProc) { console.error("[start] API script missing — not starting API"); return; }
    savePids();
    pollApiPort(apiProc);
    apiProc.on("close", (code, signal) => {
      apiProc = null;
      _apiUp = false;
      apiRestarts++;
      const delay = Math.min(3000 * apiRestarts, 30000);
      console.log(`[start] API exited code=${code} signal=${signal} — restart #${apiRestarts} in ${delay}ms`);
      setTimeout(startApi, delay);
    });
  }

  savePids();
  startApi();
})().catch((e) => {
  console.error("[start] FATAL — main startup threw:", e?.stack || e);
});

#!/usr/bin/env node
"use strict";
const { spawn, execSync } = require("child_process");
const fs = require("fs");
const http = require("http");
const https = require("https");
const net = require("net");
const os = require("os");
const path = require("path");
const { Worker } = require("worker_threads");

const root = __dirname;

const PORT = parseInt(process.env.PORT || "3000", 10);
const API_PORT = parseInt(process.env.API_PORT || "4001", 10);
const WEB_INTERNAL_PORT = 3001;
const STOREFRONT_PORT = 3002;

const standaloneDir = path.join(root, "apps/web/.next/standalone");
const serverScript = path.join(standaloneDir, "apps/web", "server.js");
const storefrontServerScript = path.join(root, "apps/storefront/.next/standalone/apps/storefront", "server.js");
// Prefer the esbuild bundle (self-contained, no node_modules needed).
// Fall back to tsc output if bundle wasn't created.
const apiBundle = path.join(root, "apps/api/dist/bundle.js");
const apiScript = fs.existsSync(apiBundle)
  ? apiBundle
  : path.join(root, "apps/api/dist/main.js");
const workerWrapper = path.join(root, "web-worker-wrapper.js");

// ---------------------------------------------------------------------------
// Kill any process listening on a given port.
// Tries four methods so we don't depend on a single tool being available.
// ---------------------------------------------------------------------------
function killPortOwner(port) {
  // 0. ss -K — kernel-level socket teardown. Releases the port immediately even
  //    if the owning process is in uninterruptible (D) sleep or ignores signals.
  try {
    execSync(`ss -K 'sport = :${port}' 2>/dev/null`, { timeout: 3000 });
    console.log(`[start] ss -K released socket on port ${port}`);
  } catch {}

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
let webWorker = null; // the Worker thread running Next.js (shares start.js's PID)
let apiProc = null;
let proxy;
let webReady = false;   // proxy switch — true only when BOTH next.js and api are up
let _nextjsUp = false;  // next.js has bound its port
let _apiUp = false;     // nestjs has bound its port
let webRestarts = 0;
let lastWebLines = [];  // last 20 lines of web stdout/stderr for diagnostics
let lastStartLines = []; // last 30 lines of start.js own log for diagnostics
let storefrontWorker = null;
let _storefrontUp = false;
let storefrontRestarts = 0;

const _origLog = console.log.bind(console);
const _origErr = console.error.bind(console);
const _origWarn = console.warn.bind(console);
function captureStartLine(prefix, args) {
  const line = prefix + args.map(a => (typeof a === "object" ? JSON.stringify(a) : String(a))).join(" ");
  lastStartLines.push(line);
  if (lastStartLines.length > 30) lastStartLines = lastStartLines.slice(-30);
}
console.log  = (...a) => { captureStartLine("", a);       _origLog(...a);  };
console.error = (...a) => { captureStartLine("[ERR] ", a); _origErr(...a); };
console.warn  = (...a) => { captureStartLine("[WARN] ", a); _origWarn(...a); };

function checkBothReady() {
  // Open to traffic as soon as Next.js is up, even if the API is still starting.
  // The React app handles "API not ready" through its own loading states and the
  // amber banner, which is far better UX than sitting on the raw 503 startup page
  // for the full 30-90s NestJS cold-start time on Hostinger.
  if (_nextjsUp && !webReady) {
    webReady = true;
    const apiMsg = _apiUp ? "API also ready" : "API still starting — React app will handle it";
    console.log(`[start] Next.js ready — opening to traffic (${apiMsg})`);
  }
}

function killAll() {
  if (webProc) { try { webProc.kill("SIGKILL"); } catch {} }
  if (apiProc) { try { apiProc.kill("SIGKILL"); } catch {} }
  if (storefrontWorker) { try { storefrontWorker.terminate(); } catch {} }
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
function readProcRssMB(pid) {
  try {
    const s = fs.readFileSync(`/proc/${pid}/status`, "utf8");
    const m = s.match(/VmRSS:\s*(\d+)/);
    return m ? Math.round(+m[1] / 1024) : null;
  } catch { return null; }
}

function readCgroupMB(v1limitFile, v1usageFile) {
  function tryFile(f) {
    try {
      const v = fs.readFileSync(f, "utf8").trim();
      if (v === "max") return "unlimited";
      const n = parseInt(v, 10);
      return (Number.isNaN(n) || n > 9e15) ? "unlimited" : Math.round(n / 1024 / 1024);
    } catch { return null; }
  }
  return {
    limit: tryFile(v1limitFile) ?? tryFile("/sys/fs/cgroup/memory.max"),
    usage: tryFile(v1usageFile) ?? tryFile("/sys/fs/cgroup/memory.current"),
  };
}

// MIME types for direct static file serving.
const MIME_MAP = {
  ".js":   "application/javascript; charset=utf-8",
  ".mjs":  "application/javascript; charset=utf-8",
  ".css":  "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png":  "image/png",
  ".jpg":  "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif":  "image/gif",
  ".webp": "image/webp",
  ".svg":  "image/svg+xml; charset=utf-8",
  ".ico":  "image/x-icon",
  ".woff": "font/woff",
  ".woff2":"font/woff2",
  ".ttf":  "font/ttf",
  ".eot":  "application/vnd.ms-fontobject",
  ".map":  "application/json; charset=utf-8",
  ".txt":  "text/plain; charset=utf-8",
  ".html": "text/html; charset=utf-8",
};

// Helper: proxy a request to the Next.js worker on WEB_INTERNAL_PORT.
function proxyToWeb(req, res) {
  const up = http.request(
    { hostname: "127.0.0.1", port: WEB_INTERNAL_PORT, path: req.url, method: req.method, headers: req.headers },
    (pRes) => { res.writeHead(pRes.statusCode, pRes.headers); pRes.pipe(res); }
  );
  up.on("error", () => { if (!res.headersSent) { res.writeHead(502); res.end("Bad Gateway"); } });
  req.pipe(up);
}

function handleRequest(req, res) {
  // Diagnostic endpoint — available even while webReady is false.
  if (req.url === "/__status") {
    const mem = process.memoryUsage();
    const cgroup = readCgroupMB(
      "/sys/fs/cgroup/memory/memory.limit_in_bytes",
      "/sys/fs/cgroup/memory/memory.usage_in_bytes"
    );
    const status = {
      webReady,
      webRestarts,
      serverScriptExists: fs.existsSync(serverScript),
      serverScript,
      apiScriptExists: fs.existsSync(apiScript),
      lastWebLines,
      lastStartLines,
      memoryMB: {
        rss: Math.round(mem.rss / 1024 / 1024),
        heapUsed: Math.round(mem.heapUsed / 1024 / 1024),
        heapTotal: Math.round(mem.heapTotal / 1024 / 1024),
      },
      childMemoryMB: {
        web: webProc?.pid ? readProcRssMB(webProc.pid) : null,
        api: apiProc?.pid ? readProcRssMB(apiProc.pid) : null,
      },
      cgroupMemLimitMB: cgroup.limit,
      cgroupMemUsageMB: cgroup.usage,
      pid: process.pid,
      uptime: Math.round(process.uptime()) + "s",
      time: new Date().toISOString(),
    };
    res.writeHead(200, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
    res.end(JSON.stringify(status, null, 2));
    return;
  }
  // Route customer storefront: /shop and /shop/*
  if (req.url === "/shop" || req.url === "/shop/" || (req.url || "").startsWith("/shop/")) {
    if (!_storefrontUp) {
      res.writeHead(503, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store", "retry-after": "5" });
      res.end(
        "<!doctype html><html><head><meta http-equiv='refresh' content='5'>" +
        "<style>body{margin:0;font-family:system-ui,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;background:#faf8f4}</style></head>" +
        "<body><p style='color:#78716c;font-size:0.9rem'>Shop is starting up&hellip; refreshing in 5 s.</p></body></html>"
      );
      return;
    }
    const up = http.request(
      { hostname: "127.0.0.1", port: STOREFRONT_PORT, path: req.url, method: req.method, headers: req.headers },
      (pRes) => { res.writeHead(pRes.statusCode, pRes.headers); pRes.pipe(res); }
    );
    up.on("error", () => { if (!res.headersSent) { res.writeHead(502); res.end("Bad Gateway"); } });
    req.pipe(up);
    return;
  }

  // Serve /_next/static/ files directly from the filesystem.
  // Next.js standalone mode expects a separate static file server for /_next/static/.
  // Going through Next.js internally can produce MIME-type mismatches that `nosniff`
  // blocks. Direct serving guarantees correct Content-Type, Cache-Control, and avoids
  // 404s from Next.js path-resolution edge cases.
  const reqUrl = req.url || "/";
  if (reqUrl.startsWith("/_next/static/")) {
    const relPath = reqUrl.split("?")[0].slice("/_next/static/".length);
    // Reject path traversal attempts
    if (!relPath.startsWith("..") && !relPath.includes("/../")) {
      const candidates = [
        path.join(root, "apps/web/.next/standalone/apps/web/.next/static", relPath),
        path.join(root, "apps/web/.next/static", relPath),
      ];
      (function tryNext(i) {
        if (i >= candidates.length) { proxyToWeb(req, res); return; }
        fs.stat(candidates[i], (err, stat) => {
          if (err || !stat.isFile()) { tryNext(i + 1); return; }
          const ext = path.extname(candidates[i]).toLowerCase();
          res.writeHead(200, {
            "Content-Type": MIME_MAP[ext] || "application/octet-stream",
            "Content-Length": stat.size,
            "Cache-Control": "public, max-age=31536000, immutable",
            "X-Content-Type-Options": "nosniff",
          });
          fs.createReadStream(candidates[i]).pipe(res);
        });
      }(0));
      return;
    }
  }

  if (!webReady) {
    // 503 (not 200): fetch() callers check r.ok / status — a 200 fools them into thinking
    // the request succeeded when it actually hit the startup page. refreshSession() returned
    // "ok", apiFetch skipped its TRANSIENT_STATUSES retry, and auth-context skipped its
    // !res.ok retry — all because the status code was 200. Browsers render HTML on 503 just
    // fine and the meta-refresh still fires, so the user experience is identical.
    res.writeHead(503, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store", "retry-after": "3" });
    res.end(
      "<!doctype html><html><head><meta http-equiv='refresh' content='3'>" +
      "<style>body{margin:0;font-family:system-ui,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;background:#f0f2f5}" +
      ".box{text-align:center;max-width:380px;padding:2rem}" +
      ".spinner{width:36px;height:36px;border:3px solid #e2e5eb;border-top-color:#e07b39;border-radius:50%;animation:spin 0.8s linear infinite;margin:0 auto 1.5rem}" +
      "@keyframes spin{to{transform:rotate(360deg)}}" +
      "h2{margin:0 0 0.5rem;font-size:1.1rem;color:#1a2235}" +
      "p{margin:0 0 1.5rem;font-size:0.875rem;color:#6b7280}" +
      "a{font-size:0.75rem;color:#9ca3af;text-decoration:underline}" +
      "</style></head>" +
      "<body><div class='box'><div class='spinner'></div><h2>Akoko Solutions ERP is starting…</h2>" +
      "<p>The server wakes up automatically. This page refreshes every 3 seconds.</p>" +
      "<a href='/__status'>View startup status</a></div></body></html>"
    );
    return;
  }
  proxyToWeb(req, res);
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

  // Always overwrite @prisma/client from the generated backup. pnpm install on a fresh
  // Hostinger deployment installs the generic npm package (no schema models). Without
  // this overwrite the generated client would be replaced by the shell version and all
  // model queries would fail. The copy costs ~5s but correctness is worth it.
  if (fs.existsSync(clientBackup)) {
    try {
      await fs.promises.rm(clientDir, { recursive: true, force: true });
      await fs.promises.mkdir(path.dirname(clientDir), { recursive: true });
      await fs.promises.cp(clientBackup, clientDir, { recursive: true });
      console.log("[start] @prisma/client restored from backup");
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
    waitForPortFree(WEB_INTERNAL_PORT, 20000),
    waitForPortFree(API_PORT, 20000),
  ]);
  console.log("[start] ports clear");

  let dbUrl = process.env.DATABASE_URL || "";
  if (dbUrl.startsWith("mysql://")) {
    dbUrl = dbUrl.replace("@localhost:", "@127.0.0.1:");
    const sep = () => dbUrl.includes("?") ? "&" : "?";
    // 30s TCP connection timeout — MySQL on Hostinger shared hosting is slow to
    // accept connections on cold start. 10s was too tight; 30s gives Prisma enough
    // time to establish a connection before declaring failure.
    if (!dbUrl.includes("connect_timeout")) dbUrl += sep() + "connect_timeout=30";
    // Cap connection pool to 5. Hostinger shared MySQL plans often limit users to
    // 5-10 simultaneous connections. Prisma defaults to 10, which can exhaust the
    // quota and cause "too many connections" errors for the 6th+ concurrent query.
    if (!dbUrl.includes("connection_limit")) dbUrl += "&connection_limit=5";
    // Wait up to 20s for a pool slot before failing a query. Without this, Prisma
    // raises "Timed out fetching a connection from the connection pool" immediately
    // when all 5 slots are busy.
    if (!dbUrl.includes("pool_timeout")) dbUrl += "&pool_timeout=20";
    if (dbUrl !== process.env.DATABASE_URL) {
      console.log("[start] DATABASE_URL patched: localhost→127.0.0.1 + connect_timeout=30 + connection_limit=5 + pool_timeout=20");
    }
  }

  // Poll WEB_INTERNAL_PORT via TCP every second until it accepts connections.
  // Fallback for when the "Ready" stdout string is missed.
  function pollWebPort(proc) {
    let stopped = false;
    const _stop = () => { stopped = true; };
    // ChildProcess fires "close"; Worker threads fire "exit" — handle both.
    try { proc.once("close", _stop); } catch {}
    try { proc.once("exit", _stop); } catch {}
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
    // Terminate any in-flight worker from a prior call before starting fresh.
    if (webWorker) {
      try { webWorker.terminate(); } catch {}
      webWorker = null;
    }
    if (!fs.existsSync(serverScript)) {
      console.error(`[start] web server.js missing at ${serverScript} — will retry in 30s`);
      setTimeout(startWeb, 30000);
      return;
    }
    // For Worker threads, port 3001 is held by THIS process's PID (start.js).
    // Calling killPortOwner(WEB_INTERNAL_PORT) would SIGKILL start.js itself —
    // so we only wait for the port rather than actively killing anything.
    // On the very first boot the outer async block already called killPortOwner
    // to clear any orphans from a previous run, so this is safe.
    waitForPortFree(WEB_INTERNAL_PORT, 10000).then(() => {
      console.log(`[start] launching jokas-web as worker thread — ${serverScript}`);
      const worker = new Worker(workerWrapper, {
        workerData: { serverScript },
        // Isolated env copy: PORT/HOSTNAME changes in the worker won't bleed
        // into start.js's process.env (which still holds PORT=3000 for the proxy).
        env: {
          ...process.env,
          PORT: String(WEB_INTERNAL_PORT),
          HOSTNAME: "0.0.0.0",
          NODE_ENV: "production",
        },
      });
      webWorker = worker;

      // Facade so killAll() and savePids() keep working without changes.
      // Worker threads share start.js's PID — no separate PID to track.
      webProc = {
        pid: null,
        kill: () => { try { worker.terminate(); } catch {} },
      };
      savePids(); // saves only the API pid (webProc.pid is null for a worker)

      worker.on("message", (msg) => {
        if (msg.type === "log") {
          // Capture Next.js stdout for /__status lastWebLines buffer.
          const lines = msg.data.split("\n").filter(l => l.trim());
          lastWebLines.push(...lines);
          if (lastWebLines.length > 20) lastWebLines = lastWebLines.slice(-20);
          if (!_nextjsUp && /\bready\b/i.test(msg.data)) {
            _nextjsUp = true;
            console.log("[start] Next.js ready (worker stdout)");
            checkBothReady();
          }
        } else if (msg.type === "exit") {
          // Next.js called process.exit() internally — terminate the worker cleanly.
          console.log(`[start] Next.js worker called process.exit(${msg.code}) — terminating`);
          worker.terminate();
        }
      });

      worker.on("error", (err) => {
        console.error("[start] Next.js worker error:", err.message);
        lastWebLines.push("[WEB-ERR] " + err.message);
        if (lastWebLines.length > 20) lastWebLines = lastWebLines.slice(-20);
      });

      pollWebPort(worker); // TCP fallback if stdout readiness is missed

      worker.on("exit", (code) => {
        if (webWorker === worker) webWorker = null;
        webProc = null;
        webReady = false;
        _nextjsUp = false;
        webRestarts++;
        // Worker threads are not subject to Hostinger's 30s PID-based kill, so
        // an exit here is a real crash. Use modest backoff to avoid thrashing.
        const delay = Math.min(3000 * webRestarts, 10000);
        const exitMsg = `[WEB EXIT] worker code=${code} restart=#${webRestarts} delay=${delay}ms`;
        lastWebLines.push(exitMsg);
        if (lastWebLines.length > 20) lastWebLines = lastWebLines.slice(-20);
        console.log(`[start] Next.js worker exited code=${code} — restart #${webRestarts} in ${delay}ms`);
        setTimeout(startWeb, delay);
      });
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

  // ── Customer storefront (port 3002, served at /shop/*) ───────────────────
  function startStorefront() {
    if (!fs.existsSync(storefrontServerScript)) {
      console.log("[start] Storefront server.js not found — skipping (will be available after next deploy)");
      return;
    }
    if (storefrontWorker) {
      try { storefrontWorker.terminate(); } catch {}
      storefrontWorker = null;
    }
    waitForPortFree(STOREFRONT_PORT, 10000).then(() => {
      console.log(`[start] launching jokas-storefront as worker thread — ${storefrontServerScript}`);
      const worker = new Worker(workerWrapper, {
        workerData: { serverScript: storefrontServerScript },
        env: {
          ...process.env,
          PORT: String(STOREFRONT_PORT),
          HOSTNAME: "0.0.0.0",
          NODE_ENV: "production",
          API_PORT: String(API_PORT),
        },
      });
      storefrontWorker = worker;

      worker.on("message", (msg) => {
        if (msg.type === "log" && !_storefrontUp && /\bready\b/i.test(msg.data)) {
          _storefrontUp = true;
          console.log("[start] Storefront ready (worker stdout)");
        } else if (msg.type === "exit") {
          worker.terminate();
        }
      });

      // TCP probe fallback in case the "ready" log line is missed
      let sfStopped = false;
      worker.once("exit", () => { sfStopped = true; });
      function probeSF() {
        if (sfStopped || _storefrontUp) return;
        const sock = net.createConnection(STOREFRONT_PORT, "127.0.0.1");
        sock.setTimeout(1000);
        sock.once("connect", () => { sock.destroy(); if (!_storefrontUp && !sfStopped) { _storefrontUp = true; console.log("[start] Storefront ready (TCP probe)"); } });
        sock.once("error", () => { sock.destroy(); if (!sfStopped && !_storefrontUp) setTimeout(probeSF, 1000); });
        sock.once("timeout", () => { sock.destroy(); if (!sfStopped && !_storefrontUp) setTimeout(probeSF, 1000); });
      }
      setTimeout(probeSF, 3000);

      worker.on("error", (err) => console.error("[start] Storefront worker error:", err.message));
      worker.on("exit", (code) => {
        if (storefrontWorker === worker) storefrontWorker = null;
        _storefrontUp = false;
        storefrontRestarts++;
        const delay = Math.min(5000 * storefrontRestarts, 30000);
        console.log(`[start] Storefront exited code=${code} — restart #${storefrontRestarts} in ${delay}ms`);
        setTimeout(startStorefront, delay);
      });
    });
  }
  startStorefront();

  // ── Internal DB keep-alive ───────────────────────────────────────────────
  // Pings NestJS /health (SELECT 1) every 45s so Prisma's connection pool
  // never goes idle. MySQL on Hostinger drops idle connections at ~60s
  // (wait_timeout); 45s ensures we ping before the connection is reclaimed.
  setInterval(() => {
    if (!_apiUp) return;
    http.get(`http://127.0.0.1:${API_PORT}/health`, (r) => r.resume()).on("error", () => {});
  }, 45 * 1000);

  // ── Internal Next.js keep-alive ──────────────────────────────────────────
  // Hostinger's process monitor kills Next.js if it receives no connections for
  // ~30 seconds. Ping every 5 seconds — well inside that threshold — so the
  // first ping arrives within 5s of Next.js becoming ready regardless of when
  // the interval started relative to the spawn. Loopback bypasses Passenger but
  // still keeps the process active from the OS/monitoring perspective.
  setInterval(() => {
    if (!_nextjsUp) return;
    http.get(`http://127.0.0.1:${WEB_INTERNAL_PORT}/api/v1/health`, (r) => r.resume()).on("error", () => {});
  }, 5 * 1000);

  // ── CI runner + DB backup watchdogs ──────────────────────────────────────
  // This Hostinger plan has no Cron Jobs feature and `crontab` is aliased to
  // a read-only stub (confirmed live 2026-08-06 — piping into it does
  // nothing), so neither the GitHub Actions self-hosted runner nor the DB
  // backup can be scheduled the normal way. Piggybacking on start.js instead:
  // Passenger already keeps this process running indefinitely and restarts
  // it on crash, and — unlike a process backgrounded from an SSH shell — it
  // isn't tied to any login session, so it isn't subject to the session-end
  // process cleanup that killed the earlier nohup/setsid-based watcher.
  // Confirmed live 2026-08-07, twice: (1) Passenger runs this process with
  // `HOME` stripped from the environment (no HOME= in /proc/<pid>/environ),
  // silently no-opping both watchdogs below. (2) Switching to os.homedir()
  // "fixed" that but returned /home/u136486538/domains/jokasfarms.com — NOT
  // the real Unix home (/home/u136486538). Passenger scopes HOME to the
  // app's own domain directory for sandboxing, and os.homedir() picked that
  // up too. Neither the env var nor the OS user-database lookup can be
  // trusted here. Deriving it structurally instead: `root` (__dirname) is
  // always $HOME/domains/jokasfarms.com/nodejs by deploy.yml's own directory
  // convention, so walking up 3 levels gets the real home deterministically,
  // independent of whatever Passenger does to the environment.
  const HOME_DIR = path.dirname(path.dirname(path.dirname(root)));
  console.log(`[start] HOME_DIR resolved to: ${HOME_DIR}`);

  // Pure-Node process scan — avoids depending on `pgrep` being resolvable via
  // PATH, which (like HOME above) may not be set up the way an interactive
  // SSH shell's is inside Passenger's environment.
  function isProcessRunning(needle) {
    try {
      for (const pid of fs.readdirSync("/proc")) {
        if (!/^\d+$/.test(pid)) continue;
        try {
          const cmdline = fs.readFileSync(`/proc/${pid}/cmdline`, "utf8");
          if (cmdline.includes(needle)) return true;
        } catch {}
      }
    } catch {}
    return false;
  }

  function checkCiRunner() {
    if (isProcessRunning("actions-runner/run.sh")) return; // already running
    const runnerDir = path.join(HOME_DIR, "actions-runner");
    const runScript = path.join(runnerDir, "run.sh");
    if (!fs.existsSync(runScript)) {
      console.warn(`[start] CI runner is down but run.sh not found at ${runScript} — skipping restart`);
      return;
    }
    try {
      // Exec the script directly by absolute path (relies on its own shebang
      // + execute bit, same as running `./run.sh` manually) instead of
      // spawning "bash" by name — PATH may not resolve that name here either.
      const child = spawn(runScript, [], {
        cwd: runnerDir,
        detached: true,
        stdio: "ignore",
      });
      child.unref();
      console.log(`[start] CI runner was down — restarted, PID=${child.pid}`);
    } catch (e) {
      console.error("[start] failed to restart CI runner:", e.message);
    }
  }
  setInterval(checkCiRunner, 5 * 60 * 1000);
  checkCiRunner();

  function checkDailyBackup() {
    const backupScript = path.join(HOME_DIR, "jokas-db-backup.sh");
    if (!fs.existsSync(backupScript)) return; // not written yet by a deploy
    const now = new Date();
    if (now.getHours() !== 2) return; // only fire during the 02:00 hour
    const dateStr = now.toISOString().slice(0, 10).replace(/-/g, "");
    const expected = path.join(HOME_DIR, "jokas-db-backups", `db-${dateStr}.sql.gz`);
    if (fs.existsSync(expected)) return; // already ran today
    try {
      // Same reasoning as checkCiRunner() — exec by absolute path, not via "bash".
      const child = spawn(backupScript, [], { detached: true, stdio: "ignore" });
      child.unref();
      console.log(`[start] running daily DB backup, PID=${child.pid}`);
    } catch (e) {
      console.error("[start] failed to run daily DB backup:", e.message);
    }
  }
  // Checked every 15 min so the 02:00-04:00 UTC-ish window is never missed
  // even if start.js restarted right before 2am; cheap no-op the rest of the day.
  setInterval(checkDailyBackup, 15 * 60 * 1000);
  checkDailyBackup();

  function checkDailyFilesBackup() {
    // C8: same polling fallback as checkDailyBackup() above, for the sibling
    // uploaded-files backup cron written by deploy.yml's "Setup uploaded-files
    // backup cron" step — crontab itself is a read-only stub on this host.
    const backupScript = path.join(HOME_DIR, "jokas-files-backup.sh");
    if (!fs.existsSync(backupScript)) return; // not written yet by a deploy
    const now = new Date();
    if (now.getHours() !== 2) return; // only fire during the 02:00 hour
    const dateStr = now.toISOString().slice(0, 10).replace(/-/g, "");
    const expected = path.join(HOME_DIR, "jokas-files-backups", `files-${dateStr}.tar.gz`);
    if (fs.existsSync(expected)) return; // already ran today
    try {
      const child = spawn(backupScript, [], { detached: true, stdio: "ignore" });
      child.unref();
      console.log(`[start] running daily uploaded-files backup, PID=${child.pid}`);
    } catch (e) {
      console.error("[start] failed to run daily uploaded-files backup:", e.message);
    }
  }
  setInterval(checkDailyFilesBackup, 15 * 60 * 1000);
  checkDailyFilesBackup();

  // ── External self-ping to prevent Hostinger from hibernating ────────────
  // Passenger/OpenLiteSpeed tracks idle time from the LAST REQUEST it forwarded
  // to this process. Loopback connections bypass Passenger entirely, so they
  // don't reset the idle timer. Outbound requests to the public domain travel
  // through the NIC → LiteSpeed → Passenger → here, which DOES reset the timer.
  //
  // 25-second interval: Hostinger's idle timeout appears to be ~30 seconds.
  // Pinging every 25 seconds stays safely under that threshold.
  // WEB_ORIGIN is already set in Hostinger's env for CORS (e.g. https://jokasfarms.com).
  const selfPingBase = (process.env.SITE_URL || process.env.WEB_ORIGIN || "")
    .split(",")[0].trim().replace(/\/$/, "");
  if (selfPingBase) {
    const selfPingUrl = selfPingBase + "/api/v1/health";
    const selfPingMod = selfPingUrl.startsWith("https") ? https : http;
    setInterval(() => {
      if (!webReady) return;
      selfPingMod
        .get(selfPingUrl, { headers: { "user-agent": "jokas-keepalive/1.0" } }, (r) => r.resume())
        .on("error", () => {});
    }, 25 * 1000);
    console.log(`[start] self-ping active → ${selfPingUrl} every 25s`);
  } else {
    console.warn("[start] external self-ping disabled — set SITE_URL or WEB_ORIGIN env var to enable (internal ping is still active)");
  }
})().catch((e) => {
  console.error("[start] FATAL — main startup threw:", e?.stack || e);
});

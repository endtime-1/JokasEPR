#!/usr/bin/env node
"use strict";
const { spawn, execSync } = require("child_process");
const fs = require("fs");
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

// ---------------------------------------------------------------------------
// Kill any process listening on a given port.
// Tries four methods so we don't depend on a single tool being available.
// ---------------------------------------------------------------------------
function killPortOwner(port) {
  // 1. fuser with numeric signal (most portable SIGKILL syntax)
  for (const sig of ["-9", "-KILL"]) {
    try {
      execSync(`fuser ${sig} ${port}/tcp 2>/dev/null`, { timeout: 3000 });
      console.log(`[start] killed port ${port} owner via fuser ${sig}`);
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

// Run both cleanup paths before anything else.
killOrphans();
killPortOwner(WEB_INTERNAL_PORT);
killPortOwner(API_PORT);

// ---------------------------------------------------------------------------
// Env log
// ---------------------------------------------------------------------------
console.log("[start] env — DATABASE_URL:", process.env.DATABASE_URL ? "SET" : "MISSING",
  "| JWT:", process.env.JWT_ACCESS_SECRET ? "SET" : "MISSING",
  "| PORT:", process.env.PORT, "| API_PORT:", process.env.API_PORT);

// ---------------------------------------------------------------------------
// Child tracking
// ---------------------------------------------------------------------------
let webProc = null;
let apiProc = null;
let proxy;
let webReady = false;

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
    if (name === "jokas-web" && s.includes("Ready")) {
      webReady = true;
      console.log("[start] Next.js ready — live traffic forwarding enabled");
    }
  });
  proc.stderr.on("data", (d) => process.stdout.write(`[${name}-ERR] ` + d));
  proc.on("error", (err) => console.error(`[start] ${name} spawn error:`, err.message));
  return proc;
}

// ---------------------------------------------------------------------------
// HTTP proxy (starts immediately — Hostinger requires listen() within 3s)
// ---------------------------------------------------------------------------
function handleRequest(req, res) {
  if (!webReady) {
    res.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" });
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
    if (process.send) process.send("ready");
  });
}

// ---------------------------------------------------------------------------
// Bind the proxy port immediately so Hostinger's 3-second listen() check
// passes before any slow synchronous operations (file copies etc.) below.
// ---------------------------------------------------------------------------
startProxy(0);

// ---------------------------------------------------------------------------
// Diagnostics
// ---------------------------------------------------------------------------
try {
  const os = execSync("cat /etc/os-release 2>/dev/null | grep PRETTY_NAME", { encoding: "utf8", timeout: 2000 }).trim();
  console.log("[start] OS:", os);
} catch {}
try {
  const ssl = execSync("openssl version 2>/dev/null", { encoding: "utf8", timeout: 2000 }).trim();
  console.log("[start] OpenSSL:", ssl);
} catch {}

// ---------------------------------------------------------------------------
// Restore Prisma runtime — two steps, both synchronous (no child processes).
//
// Without a custom output in schema, Prisma generates into the pnpm store
// (.pnpm/…/node_modules/@prisma/client and .pnpm/…/node_modules/.prisma/client).
// Hostinger excludes dot-directories from the deployed runtime, so:
//   • node_modules/@prisma/client  → broken symlink (target .pnpm/ is gone)
//   • node_modules/.prisma/client  → missing (dot-dir excluded)
//
// post-build.js backed both up to node_modules/prisma-client/ and
// node_modules/prisma-runtime/ (no dots).  We restore them here before
// launching any child process.
// ---------------------------------------------------------------------------
(function restorePrismaRuntime() {
  const clientDir   = path.join(root, "node_modules/@prisma/client");
  const prismaDir   = path.join(root, "node_modules/.prisma/client");
  // Backups live inside apps/api/dist/ — the one directory that is guaranteed
  // to be deployed by Hostinger (the API binary lives there).
  const clientBackup  = path.join(root, "apps/api/dist/prisma-client");
  const runtimeBackup = path.join(root, "apps/api/dist/prisma-runtime");

  // Returns true if the symlink at p has a missing target.
  function isBrokenSymlink(p) {
    try {
      if (!fs.lstatSync(p).isSymbolicLink()) return false;
      fs.statSync(p);   // throws if target is missing
      return false;
    } catch { return true; }
  }

  console.log("[start] backup paths — client:", clientBackup, "| runtime:", runtimeBackup);

  // ── Step 1: ALWAYS overwrite @prisma/client with the generated backup ─────
  // pnpm's fresh install in nodejs/ puts an UNGENERATED (vanilla) @prisma/client
  // here — either as a real directory or a broken symlink.  The vanilla index.js
  // uses require('./.prisma/client/default') which looks INSIDE @prisma/client/
  // itself and will never find anything.  Our post-build backup is the GENERATED
  // version whose index.js uses require('../../.prisma/client/default'), which
  // resolves to node_modules/.prisma/client/default.js — exactly where step 2
  // restores the runtime.  We must overwrite the vanilla unconditionally.
  if (fs.existsSync(clientBackup)) {
    // Remove existing dir/symlink (vanilla real dir, broken symlink, or absent)
    if (isBrokenSymlink(clientDir)) {
      try { fs.unlinkSync(clientDir); } catch {}
    } else {
      try { fs.rmSync(clientDir, { recursive: true, force: true }); } catch {}
    }
    try {
      fs.mkdirSync(path.dirname(clientDir), { recursive: true });
      fs.cpSync(clientBackup, clientDir, { recursive: true });
      console.log("[start] @prisma/client overwritten with generated backup");
    } catch (e) {
      console.error("[start] @prisma/client restore failed:", e.message);
    }
  } else {
    const vanillaOk = (() => {
      try { return !!fs.statSync(path.join(clientDir, "index.js")); } catch { return false; }
    })();
    if (vanillaOk) {
      console.warn("[start] prisma-client/ backup missing — keeping vanilla @prisma/client (API will likely fail)");
    } else {
      console.error("[start] prisma-client/ backup not found at", clientBackup, "AND @prisma/client unreachable — API will fail");
    }
  }

  // ── Step 2: ensure .prisma/client/default.js exists ─────────────────────
  // @prisma/client/index.js does require('../.prisma/client/default') at
  // runtime.  After step 1, @prisma/client is a real dir at
  // node_modules/@prisma/client, so '../' resolves to node_modules/ and
  // Node.js looks for node_modules/.prisma/client/default.js.
  const runtimeOk = fs.existsSync(path.join(prismaDir, "default.js"));
  if (!runtimeOk) {
    console.warn("[start] .prisma/client/default.js missing — restoring from backup");
    if (fs.existsSync(runtimeBackup)) {
      try {
        fs.mkdirSync(path.dirname(prismaDir), { recursive: true });
        try { fs.rmSync(prismaDir, { recursive: true, force: true }); } catch {}
        fs.cpSync(runtimeBackup, prismaDir, { recursive: true });
        console.log("[start] .prisma/client/ restored from node_modules/prisma-runtime/");
        const engines = fs.readdirSync(prismaDir)
          .filter(f => f.includes("query_engine") || f.includes("libquery") || f.endsWith(".so.node"));
        console.log("[start] Prisma engine:", engines.length ? engines.join(", ") : "NONE FOUND");
      } catch (e) {
        console.error("[start] .prisma/client restore failed:", e.message);
      }
    } else {
      console.error("[start] prisma-runtime/ backup not found at", runtimeBackup, "— API will fail");
    }
  } else {
    console.log("[start] .prisma/client/default.js present — OK");
    try {
      const engines = fs.readdirSync(prismaDir)
        .filter(f => f.includes("query_engine") || f.includes("libquery") || f.endsWith(".so.node"));
      console.log("[start] Prisma engine:", engines.length ? engines.join(", ") : "NONE FOUND");
    } catch {}
  }
})();

// ---------------------------------------------------------------------------
// Wait for ports to be free, then launch children
// ---------------------------------------------------------------------------
(async () => {
  console.log(`[start] waiting for ports ${WEB_INTERNAL_PORT} and ${API_PORT} to be free…`);
  await Promise.all([
    waitForPortFree(WEB_INTERNAL_PORT),
    waitForPortFree(API_PORT),
  ]);
  console.log("[start] ports clear");

  // ---------------------------------------------------------------------------
  // Fix DATABASE_URL for reliable MySQL connection:
  //   - "localhost" → "127.0.0.1" to force TCP (avoid Unix socket hang)
  //   - add connect_timeout=10 so a bad host fails in 10s instead of hanging
  // ---------------------------------------------------------------------------
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

  // Web
  webProc = launch("jokas-web", serverScript, standaloneDir, {
    PORT: String(WEB_INTERNAL_PORT),
    HOSTNAME: "0.0.0.0",
  });
  if (!webProc) { console.error("[start] aborting — web script missing"); process.exit(1); }

  webProc.on("close", (code, signal) => {
    console.log(`[start] web exited code=${code} signal=${signal} — shutting down`);
    webProc = null;
    if (proxy) proxy.close();
    process.exit(code ?? 1);
  });

  // API (exponential backoff restarts; API is non-fatal so web keeps running)
  let apiRestarts = 0;
  function startApi() {
    apiProc = launch("jokas-api", apiScript, path.join(root, "apps/api"), {
      PORT: String(API_PORT),
      DATABASE_URL: dbUrl,
    });
    if (!apiProc) { console.error("[start] API script missing — not starting API"); return; }
    savePids();
    apiProc.on("close", (code, signal) => {
      apiProc = null;
      apiRestarts++;
      const delay = Math.min(3000 * apiRestarts, 30000);
      console.log(`[start] API exited code=${code} signal=${signal} — restart #${apiRestarts} in ${delay}ms`);
      setTimeout(startApi, delay);
    });
  }

  savePids(); // record web PID
  startApi();
})().catch((e) => {
  console.error("[start] FATAL — main startup threw:", e?.stack || e);
});

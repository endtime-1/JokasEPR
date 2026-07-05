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

// Diagnostic: confirm Hostinger injects env vars at runtime (not only at build).
console.log("[start] env check — DATABASE_URL:", process.env.DATABASE_URL ? "SET" : "MISSING",
  "| JWT_ACCESS_SECRET:", process.env.JWT_ACCESS_SECRET ? "SET" : "MISSING",
  "| PORT:", process.env.PORT, "| API_PORT:", process.env.API_PORT);

function launch(name, script, cwd, env, onExit) {
  console.log(`[start] launching ${name}`);
  const proc = spawn(process.execPath, [script], {
    cwd,
    stdio: ["inherit", "inherit", "pipe"], // pipe stderr so we can forward it to stdout
    env: { ...process.env, ...env, NODE_ENV: "production" },
  });
  // Forward child stderr → parent stdout so runtime logs capture it.
  proc.stderr.on("data", (d) => process.stdout.write(`[${name}:err] ${d}`));
  proc.on("error", (err) => console.error(`[start] ${name} spawn error:`, err.message));
  proc.on("close", (code) => {
    console.log(`[start] ${name} exited with code ${code}`);
    if (onExit) onExit(code);
  });
  return proc;
}

// Start Next.js web server (internal port, behind the bridge).
let web = launch("jokas-web", serverScript, standaloneDir,
  { PORT: String(WEB_INTERNAL_PORT), HOSTNAME: "0.0.0.0" },
  (code) => { bridge.close(); process.exit(code ?? 1); }
);

// Start NestJS API with auto-restart on crash.
let apiRestarts = 0;
function startApi() {
  api = launch("jokas-api", apiScript, path.join(root, "apps/api"),
    { PORT: String(API_PORT) },
    (code) => {
      apiRestarts++;
      const delay = Math.min(3000 * apiRestarts, 30000);
      console.log(`[start] API restart #${apiRestarts} in ${delay}ms`);
      setTimeout(startApi, delay);
    }
  );
}
let api;
startApi();

// TCP bridge: bind $PORT immediately (Hostinger requires listen() within 3 s),
// then pipe all sockets to Next.js on WEB_INTERNAL_PORT.
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
    if (web) web.kill(sig);
    if (api) api.kill(sig);
    bridge.close();
    process.exit(0);
  });
});

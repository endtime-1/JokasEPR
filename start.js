#!/usr/bin/env node
"use strict";
const { spawn } = require("child_process");
const path = require("path");

const root = __dirname;
const API_PORT = process.env.API_PORT || "4001";
const standaloneDir = path.join(root, "apps/web/.next/standalone");
const serverPath = path.join(standaloneDir, "apps/web/server.js");

// Spawn the NestJS API as a background child process.
// If it exits the web keeps serving; API errors are logged only.
console.log("[start] launching jokas-api");
const api = spawn(process.execPath, [
  path.join(root, "apps/api/dist/main.js"),
], {
  cwd: path.join(root, "apps/api"),
  stdio: "inherit",
  env: { ...process.env, PORT: API_PORT, NODE_ENV: "production" },
});
api.on("error", (err) => console.error("[start] API error:", err.message));
api.on("close", (code) => console.error("[start] API exited with code", code));

["SIGTERM", "SIGINT"].forEach((sig) => {
  process.on(sig, () => { api.kill(sig); process.exit(0); });
});

// Run the Next.js standalone server IN this process, not as a child.
// Hostinger requires the entry-file process itself to call listen() within
// 3 seconds — a child's listen() is not detected.
console.log("[start] loading Next.js server");
process.chdir(standaloneDir);
require(serverPath);

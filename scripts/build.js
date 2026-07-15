#!/usr/bin/env node
"use strict";
// Detect Hostinger's Git auto-deploy build environment (path contains /public_html/.builds/)
// or any explicit skip signal. The server runs pre-built artifacts uploaded by GitHub Actions
// via rsync and must never attempt to compile from source (insufficient memory).
const isHostingerBuild =
  __dirname.includes("/public_html/") ||
  (process.env.HOME || "").includes("u136486538") ||
  process.env.SKIP_BUILD === "1" ||
  process.env.NODE_APP_INSTANCE !== undefined;

if (isHostingerBuild) {
  console.log("[build] Hostinger server environment detected — skipping source build.");
  console.log("[build] Pre-built artifacts are deployed via GitHub Actions rsync. No action needed.");
  process.exit(0);
}

const { execSync } = require("child_process");

function run(cmd) {
  console.log(`\n[build] ${cmd}`);
  execSync(cmd, { stdio: "inherit" });
}

run("npx --yes pnpm@11.9.0 --filter @jokas/db build");
run("npx --yes pnpm@11.9.0 --filter @jokas/shared build");
run("npx --yes pnpm@11.9.0 --filter @jokas/api build");
run("npx --yes pnpm@11.9.0 --filter @jokas/web build");
run("node scripts/post-build.js");

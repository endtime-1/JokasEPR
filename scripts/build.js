#!/usr/bin/env node
"use strict";
// When running on the production server (SKIP_BUILD=1 or NODE_APP_INSTANCE is set
// by Passenger/PM2), exit immediately — the server runs pre-built artifacts uploaded
// by CI and must never attempt to compile from source (insufficient memory).
if (process.env.SKIP_BUILD === "1" || process.env.NODE_APP_INSTANCE !== undefined) {
  console.log("[build] Production server detected — skipping source build (pre-built artifacts in place).");
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

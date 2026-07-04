#!/usr/bin/env node
// Copies public/ and .next/static/ into the standalone output directory.
// Next.js standalone mode does not include these automatically.
const { cpSync, existsSync, mkdirSync } = require("fs");
const path = require("path");

const webDir = path.join(__dirname, "../apps/web");
const standaloneDir = path.join(webDir, ".next/standalone");
const standaloneWebDir = path.join(standaloneDir, "apps/web");

if (!existsSync(standaloneDir)) {
  console.log("No standalone output found — skipping asset copy.");
  process.exit(0);
}

mkdirSync(standaloneWebDir, { recursive: true });

// Copy public/
const publicSrc = path.join(webDir, "public");
if (existsSync(publicSrc)) {
  cpSync(publicSrc, path.join(standaloneWebDir, "public"), { recursive: true });
  console.log("Copied public/");
}

// Copy .next/static/
const staticSrc = path.join(webDir, ".next/static");
if (existsSync(staticSrc)) {
  mkdirSync(path.join(standaloneWebDir, ".next"), { recursive: true });
  cpSync(staticSrc, path.join(standaloneWebDir, ".next/static"), { recursive: true });
  console.log("Copied .next/static/");
}

console.log("post-build: done");

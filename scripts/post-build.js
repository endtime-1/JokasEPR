#!/usr/bin/env node
// Copies public/ and .next/static/ into the standalone output directory.
// Next.js standalone mode does not include these automatically.
const { cpSync, existsSync, mkdirSync, readdirSync, realpathSync, rmSync, writeFileSync } = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const webDir = path.join(root, "apps/web");
const standaloneDir = path.join(webDir, ".next/standalone");
const standaloneWebDir = path.join(standaloneDir, "apps/web");

if (!existsSync(standaloneDir)) {
  console.log("post-build: no standalone output found — skipping static asset copy (Prisma backup will still run)");
} else {
  mkdirSync(standaloneWebDir, { recursive: true });

  const publicSrc = path.join(webDir, "public");
  if (existsSync(publicSrc)) {
    cpSync(publicSrc, path.join(standaloneWebDir, "public"), { recursive: true });
    console.log("Copied public/");
  }

  const staticSrc = path.join(webDir, ".next/static");
  if (existsSync(staticSrc)) {
    mkdirSync(path.join(standaloneWebDir, ".next"), { recursive: true });
    cpSync(staticSrc, path.join(standaloneWebDir, ".next/static"), { recursive: true });
    console.log("Copied .next/static/");
  }
}

// Write LiteSpeed proxy .htaccess.
// During Hostinger build, __dirname is:
//   public_html/.builds/source/repository/scripts/
// public_html/ is 4 levels up: scripts→repository→source→.builds→public_html
const port = process.env.PORT || "3000";
const htaccessPath = path.join(__dirname, "../../../../.htaccess");
const htaccess = `RewriteEngine On
RewriteRule ^\\.builds - [F,L]
RewriteCond %{HTTP:Upgrade} websocket [NC]
RewriteCond %{HTTP:Connection} upgrade [NC]
RewriteRule ^/?(.*)$ ws://127.0.0.1:${port}/$1 [P,L]
RewriteCond %{REQUEST_FILENAME} !-f
RewriteRule ^/?(.*)$ http://127.0.0.1:${port}/$1 [P,L]
`;
try {
  writeFileSync(htaccessPath, htaccess);
  console.log(`post-build: .htaccess written (proxy → port ${port})`);
} catch (e) {
  console.log(`post-build: could not write .htaccess (${e.message}) — skipping`);
}

// ---------------------------------------------------------------------------
// Find @prisma/client by searching all known pnpm locations.
// pnpm may hoist packages to root node_modules/ OR keep them in the
// workspace package's local node_modules/ depending on version and config.
// ---------------------------------------------------------------------------
function findDir(candidates, markerFile) {
  for (const c of candidates) {
    try {
      // Follow symlinks — if it's in .pnpm store, realpathSync gives real path
      const real = realpathSync(c);
      if (existsSync(path.join(real, markerFile))) return real;
    } catch {}
    if (existsSync(path.join(c, markerFile))) return c;
  }
  return null;
}

// Search the .pnpm virtual store for a specific scoped package
function pnpmStoreCandidates(scopedPkg) {
  const pnpm = path.join(root, "node_modules/.pnpm");
  if (!existsSync(pnpm)) return [];
  const prefix = scopedPkg.replace("/", "+") + "@";
  const results = [];
  try {
    for (const entry of readdirSync(pnpm)) {
      if (entry.startsWith(prefix)) {
        results.push(path.join(pnpm, entry, "node_modules", scopedPkg));
      }
    }
  } catch {}
  return results;
}

const clientCandidates = [
  path.join(root, "node_modules/@prisma/client"),
  path.join(root, "packages/db/node_modules/@prisma/client"),
  path.join(root, "apps/api/node_modules/@prisma/client"),
  ...pnpmStoreCandidates("@prisma/client"),
];

const clientDir = findDir(clientCandidates, "index.js");
console.log("post-build: @prisma/client found at:", clientDir || "NOT FOUND");

// .prisma/client (generated runtime files + engine binary) may live next to
// @prisma/client in the store, or in node_modules/.prisma/client at root/pkg level.
const runtimeCandidates = [
  path.join(root, "node_modules/.prisma/client"),
  path.join(root, "packages/db/node_modules/.prisma/client"),
  path.join(root, "apps/api/node_modules/.prisma/client"),
];
// Also look for .prisma/client as sibling of @prisma/client in the .pnpm store
for (const c of clientCandidates) {
  const sibling = path.join(path.dirname(path.dirname(c)), ".prisma/client");
  if (!runtimeCandidates.includes(sibling)) runtimeCandidates.push(sibling);
}

const runtimeDir = findDir(runtimeCandidates, "default.js");
console.log("post-build: .prisma/client found at:", runtimeDir || "NOT FOUND");

// ---------------------------------------------------------------------------
// Backup to apps/api/dist/ — the only non-dot path Hostinger always deploys.
// start.js restores these at boot time so the API can connect to MySQL.
// ---------------------------------------------------------------------------
const distDir = path.join(root, "apps/api/dist");
mkdirSync(distDir, { recursive: true });

const clientDst = path.join(distDir, "prisma-client");
if (clientDir) {
  if (existsSync(clientDst)) rmSync(clientDst, { recursive: true, force: true });
  cpSync(clientDir, clientDst, { recursive: true });
  console.log("post-build: @prisma/client backed up → apps/api/dist/prisma-client/");
} else {
  console.warn("post-build: @prisma/client not found — client backup skipped. API will likely fail.");
}

const runtimeDst = path.join(distDir, "prisma-runtime");
if (runtimeDir) {
  const engineFiles = readdirSync(runtimeDir).filter(
    f => f.includes("query_engine") || f.includes("libquery") || f.endsWith(".so.node")
  );
  if (engineFiles.length === 0) {
    console.warn("post-build: .prisma/client found but no engine binary inside it — runtime may fail");
  } else {
    console.log("post-build: Prisma engine:", engineFiles.join(", "));
  }
  if (existsSync(runtimeDst)) rmSync(runtimeDst, { recursive: true, force: true });
  cpSync(runtimeDir, runtimeDst, { recursive: true });
  console.log("post-build: .prisma/client backed up → apps/api/dist/prisma-runtime/");
} else {
  console.error("post-build: .prisma/client not found — API will fail at runtime!");
}

console.log("post-build: done");

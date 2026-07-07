#!/usr/bin/env node
// Copies public/ and .next/static/ into the standalone output directory.
// Next.js standalone mode does not include these automatically.
const { cpSync, existsSync, mkdirSync, readdirSync, realpathSync, rmSync, writeFileSync } = require("fs");
const path = require("path");

const webDir = path.join(__dirname, "../apps/web");
const standaloneDir = path.join(webDir, ".next/standalone");
const standaloneWebDir = path.join(standaloneDir, "apps/web");

if (!existsSync(standaloneDir)) {
  console.log("post-build: no standalone output found — skipping static asset copy (Prisma backup will still run)");
} else {
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
}

// Write LiteSpeed proxy rules so jokasfarms.com forwards to the Node.js app.
const port = process.env.PORT || "3000";
// During Hostinger build, __dirname is:
//   public_html/.builds/source/public_html/scripts/
// So public_html/ is 4 levels up: scripts→public_html→source→.builds→public_html
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
// Back up the Prisma runtime client to non-dot paths for Hostinger deployment.
//
// Without a custom `output` in the schema generator, Prisma generates the
// client into the pnpm store (node_modules/.pnpm/@prisma+client@.../...).
// TypeScript resolves @prisma/client via the symlink in node_modules/ and
// sees the correct generated types — the build works.
//
// BUT Hostinger's deployment strips dot-directories (.pnpm/, .prisma/) from
// the runtime copy. At runtime:
//   - node_modules/@prisma/client  → broken symlink (target .pnpm/ is gone)
//   - node_modules/.prisma/client  → missing dot-dir (required at runtime via
//                                    require('../.prisma/client/default'))
//
// We back up both here. start.js restores them synchronously at boot before
// launching the web and API processes (no child process spawning needed).
// ---------------------------------------------------------------------------

// Resolve the REAL path of @prisma/client, following the pnpm symlink into
// the store. The .prisma/client/ directory is a sibling of @prisma/client
// inside the pnpm store's node_modules/.
let storeNodeModulesDir = null;
let prismaRealClientDir = null;
try {
  prismaRealClientDir = realpathSync(path.join(__dirname, "../node_modules/@prisma/client"));
  // path: <root>/node_modules/.pnpm/@prisma+client@.../node_modules/@prisma/client
  // dirname → .../node_modules/@prisma
  // dirname → .../node_modules        ← the store's node_modules
  storeNodeModulesDir = path.dirname(path.dirname(prismaRealClientDir));
  console.log("post-build: @prisma/client real path:", prismaRealClientDir);
} catch (e) {
  console.warn("post-build: could not resolve real path of @prisma/client:", e.message);
}

// Backup destination: apps/api/dist/ is guaranteed to be deployed by Hostinger
// (the API starts from there).  Project-root build-generated dirs are NOT
// deployed (Hostinger only deploys git-tracked files + specific build outputs).
const distDir = path.join(__dirname, "../apps/api/dist");

// Ensure the target directory exists even if the API build didn't run.
mkdirSync(distDir, { recursive: true });

// 1. Back up @prisma/client (the JS package) → apps/api/dist/prisma-client/
//    start.js uses this to create a real directory at node_modules/@prisma/client
//    (the pnpm symlink in the fresh nodejs/ install points to .pnpm/ which is
//    missing from the runtime, so the symlink is broken or the dir is absent).
const clientSrc = prismaRealClientDir || path.join(__dirname, "../node_modules/@prisma/client");
const clientDst = path.join(distDir, "prisma-client");
if (existsSync(path.join(clientSrc, "index.js"))) {
  if (existsSync(clientDst)) rmSync(clientDst, { recursive: true, force: true });
  cpSync(clientSrc, clientDst, { recursive: true });
  console.log("post-build: @prisma/client backed up → apps/api/dist/prisma-client/");
} else {
  console.warn("post-build: @prisma/client/index.js not found — client backup skipped");
}

// 2. Back up .prisma/client/ (generated runtime code + engine binary)
//    → apps/api/dist/prisma-runtime/
//    @prisma/client/index.js does require('../../.prisma/client/default') at runtime.
//    After step 1, @prisma/client is a real dir at node_modules/@prisma/client/,
//    so ../../ = node_modules/ and it looks for node_modules/.prisma/client/default.
//    This dot-dir is excluded from the Hostinger runtime; start.js restores it.
const runtimeSrc = storeNodeModulesDir
  ? path.join(storeNodeModulesDir, ".prisma/client")
  : path.join(__dirname, "../node_modules/.prisma/client");
const runtimeDst = path.join(distDir, "prisma-runtime");

let runtimeSrcFound = existsSync(runtimeSrc);

// Fallback: if generate wrote to root node_modules/.prisma/client (real dir, not symlink)
if (!runtimeSrcFound) {
  const rootFallback = path.join(__dirname, "../node_modules/.prisma/client");
  if (existsSync(rootFallback) && rootFallback !== runtimeSrc) {
    console.log("post-build: using root node_modules/.prisma/client as fallback");
    runtimeSrcFound = true;
    // runtimeSrc variable can't be reassigned; use a local override below
    backupRuntime(rootFallback, runtimeDst);
  } else {
    console.error("post-build: .prisma/client/ not found anywhere — API will fail at runtime!");
  }
} else {
  backupRuntime(runtimeSrc, runtimeDst);
}

function backupRuntime(src, dst) {
  try {
    const engineFiles = readdirSync(src).filter(
      f => f.includes("query_engine") || f.includes("libquery") || f.endsWith(".so.node")
    );
    if (engineFiles.length === 0) {
      console.warn("post-build: .prisma/client/ found but no engine binary — runtime may fail");
    } else {
      console.log("post-build: Prisma engine found:", engineFiles.join(", "));
    }
    if (existsSync(dst)) rmSync(dst, { recursive: true, force: true });
    cpSync(src, dst, { recursive: true });
    console.log("post-build: .prisma/client/ backed up → apps/api/dist/prisma-runtime/");
  } catch (e) {
    console.error("post-build: failed to back up .prisma/client/:", e.message);
  }
}

console.log("post-build: done");

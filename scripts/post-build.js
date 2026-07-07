#!/usr/bin/env node
// post-build.js — runs after all workspace packages are compiled.
// 1. Copies Next.js static assets into the standalone output.
// 2. Writes the LiteSpeed .htaccess proxy rules.
// 3. Finds and backs up @prisma/client + .prisma/client engine binary.
// 4. Bundles the NestJS API (tsc output) into a single file with esbuild.
// 5. Rewrites package.json and pnpm-workspace.yaml so the runtime pnpm
//    install is a near-instant no-op (nothing to download).
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

// ---------------------------------------------------------------------------
// Bundle the NestJS API into a single file with esbuild.
//
// tsc (nest build) compiles TypeScript → apps/api/dist/*.js but leaves all
// require('package') calls pointing at external node_modules. esbuild then
// bundles dist/main.js and inlines all dependencies into dist/bundle.js.
// Only @prisma/client stays external because start.js restores it from the
// build-time backup.
//
// With shamefully-hoist=true, ALL packages are symlinked to root
// node_modules/, so esbuild can resolve every dependency correctly.
// ---------------------------------------------------------------------------
const apiDistMain = path.join(root, "apps/api/dist/main.js");
const apiDistBundle = path.join(root, "apps/api/dist/bundle.js");

if (existsSync(apiDistMain)) {
  try {
    console.log("post-build: bundling API with esbuild…");
    // Find esbuild in root node_modules or in the .pnpm virtual store.
    // shamefully-hoist doesn't always create root-level symlinks, so we
    // search .pnpm the same way we search for @prisma/client above.
    const esbuildCandidates = [
      path.join(root, "node_modules/esbuild"),
      ...pnpmStoreCandidates("esbuild"),
    ];
    let esbuildPath = null;
    for (const c of esbuildCandidates) {
      if (existsSync(path.join(c, "package.json"))) { esbuildPath = c; break; }
    }
    if (!esbuildPath) throw new Error("esbuild package not found in node_modules or .pnpm store");
    console.log("post-build: using esbuild at:", esbuildPath);
    // esbuild spawns a platform-specific native binary at runtime.
    // pnpm's .pnpm store sometimes strips the execute bit — chmod it first.
    try {
      const { execSync: ce } = require("child_process");
      ce("find node_modules/.pnpm -path '*/@esbuild/*/bin/esbuild' -type f -exec chmod +x {} +",
        { cwd: root, shell: true, stdio: "pipe" });
      console.log("post-build: chmod +x @esbuild/* binary OK");
    } catch (ce) {
      console.warn("post-build: chmod @esbuild binary failed:", ce.message);
    }
    const esbuild = require(esbuildPath);
    esbuild.buildSync({
      entryPoints: [apiDistMain],
      bundle: true,
      platform: "node",
      target: "node18",
      outfile: apiDistBundle,
      // @prisma/client stays external — start.js restores it from backup.
      external: ["@prisma/client", ".prisma/client", ".prisma/*"],
      logLevel: "warning",
    });
    console.log("post-build: API bundle written → apps/api/dist/bundle.js");
  } catch (e) {
    console.error("post-build: esbuild bundling failed:", e.message);
    console.warn("post-build: will fall back to unbundled dist/main.js at runtime (node_modules required)");
  }
} else {
  console.warn("post-build: apps/api/dist/main.js not found — skipping esbuild step");
}

// ---------------------------------------------------------------------------
// Write minimal runtime package.json and pnpm-workspace.yaml.
//
// Hostinger deploys whatever files exist in the build directory AFTER the
// build command runs. By overwriting these two files, the runtime (nodejs/)
// ends up with a package.json that has zero dependencies and a workspace
// config with no packages. That makes `pnpm install` a near-instant no-op —
// nothing to download — so `node start.js` runs within seconds.
//
// The API is webpack-bundled (all JS deps included in dist/main.js), and
// Next.js standalone already bundles its own node_modules. The only external
// dependency at runtime is @prisma/client, which start.js restores from the
// build-time backup above.
//
// NOTE: the BUILD itself uses the git-committed files, so this overwrite
// only affects the deployed runtime copy. The next build starts fresh from
// the git repo every time.
// ---------------------------------------------------------------------------
const runtimePkg = {
  name: "jokas-agribusiness-erp",
  private: true,
  version: "0.1.0",
  scripts: { start: "node start.js" },
  dependencies: {},
};
try {
  writeFileSync(path.join(root, "package.json"), JSON.stringify(runtimePkg, null, 2) + "\n");
  console.log("post-build: wrote minimal runtime package.json (pnpm install will be instant)");
} catch (e) {
  console.warn("post-build: could not write runtime package.json:", e.message);
}

try {
  writeFileSync(path.join(root, "pnpm-workspace.yaml"), "packages: []\n");
  console.log("post-build: wrote minimal runtime pnpm-workspace.yaml");
} catch (e) {
  console.warn("post-build: could not write runtime pnpm-workspace.yaml:", e.message);
}

console.log("post-build: done");

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

// Write LiteSpeed proxy rules so jokasfarms.com forwards to the Node.js app.
// The app binds to process.env.PORT (default 3000). Hostinger serves static
// files from public_html/ but needs this .htaccess to reach the Node.js process.
const { writeFileSync } = require("fs");
const port = process.env.PORT || "3000";
// Hostinger builds from public_html/.builds/source/ so __dirname is
// .builds/source/scripts/ — public_html/.htaccess is three levels up.
const htaccessPath = path.join(__dirname, "../../../.htaccess");
const htaccess = `RewriteEngine On
RewriteRule ^\\.builds - [F,L]
RewriteCond %{HTTP:Upgrade} websocket [NC]
RewriteCond %{HTTP:Connection} upgrade [NC]
RewriteRule ^/?(.*)$ ws://127.0.0.1:${port}/$1 [P,L]
RewriteCond %{REQUEST_FILENAME} !-f
RewriteCond %{REQUEST_FILENAME} !-d
RewriteRule ^/?(.*)$ http://127.0.0.1:${port}/$1 [P,L]
`;
try {
  writeFileSync(htaccessPath, htaccess);
  console.log(`post-build: .htaccess written (proxy → port ${port})`);
} catch (e) {
  console.log(`post-build: could not write .htaccess (${e.message}) — skipping`);
}

// Back up the generated Prisma client to a non-dot directory.
// Hostinger excludes dot-prefix directories (like .prisma/) when rsyncing
// node_modules to the runtime nodejs/ dir. node_modules/prisma-client/ (no dot)
// survives the sync. start.js restores it via fs.symlinkSync at boot.
const prismaClientSrc = path.join(__dirname, "../node_modules/.prisma/client");
const prismaClientDst = path.join(__dirname, "../node_modules/prisma-client");
if (existsSync(prismaClientSrc)) {
  if (existsSync(prismaClientDst)) {
    const { rmSync } = require("fs");
    rmSync(prismaClientDst, { recursive: true, force: true });
  }
  cpSync(prismaClientSrc, prismaClientDst, { recursive: true });
  console.log("post-build: Prisma client backed up → node_modules/prisma-client/");
} else {
  console.warn("post-build: .prisma/client not found — Prisma may not have generated. API will fail on Hostinger.");
}

console.log("post-build: done");

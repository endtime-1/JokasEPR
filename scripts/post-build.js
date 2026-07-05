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
const htaccessPath = path.join(__dirname, "../../public_html/.htaccess");
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

console.log("post-build: done");

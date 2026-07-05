#!/usr/bin/env node
"use strict";
// Ensures Prisma engine binaries are executable after pnpm install.
// Runs as root postinstall on Hostinger where pnpm may not set +x.
const fs = require("fs");
const path = require("path");

const roots = [
  path.join(__dirname, "../node_modules/@prisma/engines"),
  path.join(__dirname, "../node_modules/.pnpm"),
];

let fixed = 0;

function fixDir(dir) {
  if (!fs.existsSync(dir)) return;
  for (const entry of fs.readdirSync(dir)) {
    const full = path.join(dir, entry);
    try {
      const stat = fs.statSync(full);
      if (stat.isDirectory()) {
        // Recurse into @prisma/engines nested paths only
        if (entry.startsWith("@prisma") || entry.startsWith("prisma") || dir.includes("prisma")) {
          fixDir(full);
        }
      } else if (stat.isFile() && !entry.endsWith(".js") && !entry.endsWith(".json") && !entry.endsWith(".node")) {
        // Likely a native binary — ensure it is executable
        const mode = stat.mode | 0o111;
        if (stat.mode !== mode) {
          fs.chmodSync(full, mode);
          fixed++;
        }
      }
    } catch {
      // ignore individual file errors
    }
  }
}

for (const root of roots) {
  fixDir(root);
}

if (fixed > 0) {
  console.log(`[fix-permissions] chmod +x applied to ${fixed} Prisma engine file(s)`);
} else {
  console.log("[fix-permissions] all Prisma engine files already executable");
}

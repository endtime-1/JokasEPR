#!/usr/bin/env node
"use strict";
// Runs the Prisma seed only when the database has no users.
// Called by db-build.js after prisma db push so the first deploy
// bootstraps the demo company and Super Admin account automatically.
// Safe to call on every deploy — it is a no-op when users already exist.
const { execSync, execFileSync } = require("child_process");
const path = require("path");
const { existsSync } = require("fs");

const root = path.join(__dirname, "..");
const dbDir = path.join(root, "packages/db");

// pnpm with shamefully-hoist puts everything in root node_modules.
// Fall back to package-local as a secondary search.
function requireFrom(candidates, mod) {
  for (const base of candidates) {
    const full = path.join(base, mod);
    if (existsSync(full)) {
      try { return require(full); } catch {}
    }
  }
  return require(mod); // last resort: let Node resolve normally
}

// Find the tsx binary (TypeScript executor for the seed script).
function findTsx() {
  const candidates = [
    path.join(root, "node_modules/.bin/tsx"),
    path.join(dbDir, "node_modules/.bin/tsx"),
  ];
  for (const c of candidates) {
    if (existsSync(c)) return c;
  }
  return "npx tsx"; // fallback: let npx download if needed
}

async function main() {
  let prisma;
  try {
    // @prisma/client is available because prisma generate already ran.
    const { PrismaClient } = requireFrom(
      [
        path.join(root, "node_modules/@prisma/client"),
        path.join(dbDir, "node_modules/@prisma/client"),
      ],
      "@prisma/client"
    );
    prisma = new PrismaClient();
    const count = await prisma.user.count();
    if (count === 0) {
      console.log("[seed-if-empty] No users in database — running initial seed…");
      const tsx = findTsx();
      execSync(`"${tsx}" prisma/seed.ts`, {
        cwd: dbDir,
        stdio: "inherit",
        env: process.env,
        shell: true,
      });
      console.log("[seed-if-empty] Seed complete. Login: admin@jokas.local / Admin@12345");
    } else {
      console.log(`[seed-if-empty] ${count} user(s) exist — skipping seed.`);
    }
  } catch (e) {
    console.error("[seed-if-empty] Failed:", e.message);
    // Non-fatal: a seed failure should not abort the deploy.
  } finally {
    if (prisma) await prisma.$disconnect();
  }
}

main();

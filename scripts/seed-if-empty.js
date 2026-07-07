#!/usr/bin/env node
"use strict";
// Runs the Prisma seed only when the database has no users.
// Called by db-build.js after prisma db push so the first deploy
// bootstraps the demo company and Super Admin account automatically.
// Safe to call on every deploy — it is a no-op when users already exist.
const { execSync } = require("child_process");
const path = require("path");

const dbDir = path.join(__dirname, "../packages/db");

async function main() {
  let prisma;
  try {
    // @prisma/client is available here because prisma generate already ran.
    const { PrismaClient } = require(path.join(dbDir, "node_modules/@prisma/client"));
    prisma = new PrismaClient();
    const count = await prisma.user.count();
    if (count === 0) {
      console.log("[seed-if-empty] No users in database — running initial seed…");
      execSync("node_modules/.bin/tsx prisma/seed.ts", {
        cwd: dbDir,
        stdio: "inherit",
        env: process.env,
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

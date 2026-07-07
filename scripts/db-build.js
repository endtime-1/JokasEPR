#!/usr/bin/env node
"use strict";
// Runs prisma generate (and migrate deploy in production) using the
// correct schema for the target database provider.
// Set DATABASE_PROVIDER=mysql on Hostinger; defaults to postgresql.
const { execSync } = require("child_process");
const path = require("path");

const dbDir = path.join(__dirname, "../packages/db");
const provider = process.env.DATABASE_PROVIDER || "postgresql";
const schemaFile = provider === "mysql" ? "schema.mysql.prisma" : "schema.prisma";
const schema = path.join(dbDir, "prisma", schemaFile);

console.log(`[db-build] provider=${provider} schema=${schemaFile}`);

// Delete the previously generated client so Hostinger's build cache cannot
// serve a stale version with the wrong binary targets.
const { rmSync } = require("fs");
const generatedDir = path.join(dbDir, "../../node_modules/.prisma/client");
try {
  rmSync(generatedDir, { recursive: true, force: true });
  console.log("[db-build] cleared old .prisma/client cache");
} catch {}

execSync(`npx prisma generate --schema="${schema}"`, {
  stdio: "inherit",
  cwd: dbDir,
});

if (process.env.NODE_ENV === "production") {
  if (provider === "mysql") {
    // MySQL on Hostinger: migration files use PostgreSQL syntax so they won't
    // work. Use db push to sync the schema directly against the fresh database.
    //
    // First chmod the schema-engine binary — pnpm's .pnpm store sometimes
    // loses the execute bit, causing EACCES when the binary is first spawned.
    try {
      execSync(
        "find ../../node_modules/.pnpm -name 'schema-engine-*' -type f -exec chmod +x {} +",
        { cwd: dbDir, shell: true, stdio: "pipe" }
      );
      console.log("[db-build] chmod +x schema-engine binaries OK");
    } catch {}

    console.log("[db-build] mysql: running prisma db push...");
    try {
      execSync(`npx prisma db push --schema="${schema}" --accept-data-loss`, {
        stdio: "inherit",
        cwd: dbDir,
      });
    } catch (err) {
      console.error("[db-build] prisma db push failed:", err.message);
      console.error("[db-build] continuing build — run db push manually after deploy if needed");
    }
  } else {
    console.log("[db-build] postgresql: running prisma migrate deploy...");
    execSync(`npx prisma migrate deploy --schema="${schema}"`, {
      stdio: "inherit",
      cwd: dbDir,
    });
  }
}

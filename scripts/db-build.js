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

execSync(`npx prisma generate --schema="${schema}"`, {
  stdio: "inherit",
  cwd: dbDir,
});

if (process.env.NODE_ENV === "production") {
  if (provider === "mysql") {
    // MySQL on Hostinger: migration files use PostgreSQL syntax so they won't
    // work. Use db push to sync the schema directly against the fresh database.
    console.log("[db-build] mysql: running prisma db push...");
    execSync(`npx prisma db push --schema="${schema}" --accept-data-loss`, {
      stdio: "inherit",
      cwd: dbDir,
    });
  } else {
    console.log("[db-build] postgresql: running prisma migrate deploy...");
    execSync(`npx prisma migrate deploy --schema="${schema}"`, {
      stdio: "inherit",
      cwd: dbDir,
    });
  }
}

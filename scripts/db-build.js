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
  console.log("[db-build] running prisma migrate deploy...");
  execSync(`npx prisma migrate deploy --schema="${schema}"`, {
    stdio: "inherit",
    cwd: dbDir,
  });
}

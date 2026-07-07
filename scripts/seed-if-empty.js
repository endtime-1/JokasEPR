#!/usr/bin/env node
"use strict";
// Runs only when the database has no users (first deploy).
// Creates the company, all standard roles/permissions, and the Super Admin.
// Called by db-build.js after prisma db push. Safe to re-run — no-op when
// users already exist.
const path = require("path");
const root = path.join(__dirname, "..");

const PERMISSIONS = [
  ["platform.read",         "Platform",        "View companies, branches, farms, sites, warehouses, and departments"],
  ["platform.manage",       "Platform",        "Manage companies, branches, farms, sites, warehouses, and departments"],
  ["identity.read",         "Identity",        "View users, roles, permissions, and access assignments"],
  ["identity.manage",       "Identity",        "Manage users, roles, permissions, and access assignments"],
  ["inventory.read",        "Inventory",       "View products, stock batches, inventory items, and stock movements"],
  ["inventory.manage",      "Inventory",       "Manage products, stock batches, inventory items, and stock movements"],
  ["poultry.read",          "Poultry",         "View poultry houses and poultry operations"],
  ["poultry.manage",        "Poultry",         "Manage poultry houses and poultry operations"],
  ["poultry.record",        "Poultry",         "Submit daily poultry operating records"],
  ["feed.read",             "Feed Production", "View feed production records"],
  ["feed.manage",           "Feed Production", "Manage feed production records"],
  ["soya.read",             "Soya Processing", "View soya processing records"],
  ["soya.manage",           "Soya Processing", "Manage soya processing records"],
  ["finance.read",          "Finance",         "View finance and accounting records"],
  ["finance.manage",        "Finance",         "Manage finance and accounting records"],
  ["sales.read",            "Sales",           "View sales and customer records"],
  ["sales.manage",          "Sales",           "Manage sales and customer records"],
  ["procurement.read",      "Procurement",     "View procurement and supplier records"],
  ["procurement.manage",    "Procurement",     "Manage procurement and supplier records"],
  ["market-planning.read",  "Market Planning", "View market-led production planning and MRP"],
  ["market-planning.manage","Market Planning", "Manage market targets, MRP, and production planning"],
  ["hr.read",               "HR",              "View HR, worker, and task records"],
  ["hr.manage",             "HR",              "Manage HR, worker, and task records"],
  ["maintenance.read",      "Maintenance",     "View machine and maintenance records"],
  ["maintenance.manage",    "Maintenance",     "Manage machine and maintenance records"],
  ["quality.read",          "Quality Control", "View quality control records"],
  ["quality.manage",        "Quality Control", "Manage quality control records"],
  ["health.read",           "Vet and Health",  "View veterinary and flock health records"],
  ["health.manage",         "Vet and Health",  "Manage veterinary and flock health records"],
  ["reports.export",        "Reports",         "Export operational reports"],
  ["audit.read",            "Audit",           "View audit logs"],
  ["settings.manage",       "Settings",        "Manage system settings"],
  ["ai.read",               "AI Assistant",    "Access AI business assistant"],
  ["alerts.read",           "Alerts",          "View system alerts and forecasts"],
  ["alerts.manage",         "Alerts",          "Acknowledge and resolve system alerts"],
  ["quickbooks.read",       "QuickBooks",      "View QuickBooks integration status and sync logs"],
  ["quickbooks.manage",     "QuickBooks",      "Manage QuickBooks connection, sync, and mappings"],
];

const OTHER_ROLES = [
  ["CEO/Owner",          "CEO",      "Company owner and executive access"],
  ["General Manager",    "MANAGER",  "General operations management"],
  ["Farm Manager",       "MANAGER",  "Farm and poultry operations management"],
  ["Feed Mill Manager",  "MANAGER",  "Feed mill operations management"],
  ["Storekeeper",        "OFFICER",  "Warehouse and stock control"],
  ["Accountant",         "OFFICER",  "Finance and accounting operations"],
  ["Sales Officer",      "OFFICER",  "Sales and customer operations"],
  ["HR/Admin",           "OFFICER",  "Human resources and administration"],
  ["Worker",             "WORKER",   "Operational worker"],
  ["Auditor",            "AUDITOR",  "Read-only audit access"],
];

function tryRequire(...candidates) {
  for (const c of candidates) {
    try { return require(c); } catch {}
  }
  return null;
}

async function main() {
  const clientMod = tryRequire(
    "@prisma/client",
    path.join(root, "node_modules/@prisma/client"),
    path.join(root, "packages/db/node_modules/@prisma/client")
  );
  if (!clientMod) { console.error("[seed] @prisma/client not found"); return; }

  const bcrypt = tryRequire(
    "bcryptjs",
    path.join(root, "node_modules/bcryptjs"),
    path.join(root, "packages/db/node_modules/bcryptjs")
  );
  if (!bcrypt) { console.error("[seed] bcryptjs not found"); return; }

  const { PrismaClient } = clientMod;
  const prisma = new PrismaClient();

  try {
    const count = await prisma.user.count();
    if (count > 0) {
      console.log(`[seed] ${count} user(s) already exist — skipping.`);
      return;
    }

    console.log("[seed] Empty database — creating Super Admin account…");

    const passwordHash = await bcrypt.hash("Akoko@2026", 12);

    const company = await prisma.company.create({
      data: { name: "Jokas Agribusiness", legalName: "Jokas Agribusiness Ltd", timezone: "Africa/Accra" },
    });

    const branch = await prisma.branch.create({
      data: { companyId: company.id, name: "Head Office", code: "HQ", isHeadOffice: true },
    });

    const permissions = await Promise.all(
      PERMISSIONS.map(([key, module, description]) =>
        prisma.permission.create({ data: { companyId: company.id, key, module, description } })
      )
    );

    const superAdminRole = await prisma.role.create({
      data: {
        companyId: company.id,
        name: "Super Admin",
        level: "SUPER_ADMIN",
        description: "Full system access",
        isSystem: true,
        permissions: { connect: permissions.map((p) => ({ id: p.id })) },
      },
    });

    await Promise.all(
      OTHER_ROLES.map(([name, level, description]) =>
        prisma.role.create({
          data: { companyId: company.id, name, level, description, isSystem: true },
        })
      )
    );

    const user = await prisma.user.create({
      data: {
        companyId: company.id,
        branchId: branch.id,
        email: "superadmin@jokasfarms.com",
        fullName: "Super Admin",
        passwordHash,
      },
    });

    await prisma.userRole.create({
      data: { userId: user.id, roleId: superAdminRole.id, companyId: company.id },
    });

    await prisma.userBranchAccess.create({
      data: { userId: user.id, branchId: branch.id, companyId: company.id },
    });

    console.log("[seed] Done!");
    console.log("[seed] Email:    superadmin@jokasfarms.com");
    console.log("[seed] Password: Akoko@2026");
  } catch (e) {
    console.error("[seed] Error:", e.message);
  } finally {
    await prisma.$disconnect();
  }
}

main();

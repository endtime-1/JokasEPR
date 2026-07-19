/**
 * Idempotent permissions sync — safe to run on every deployment.
 * Upserts Permission rows and syncs _RolePermissions for every role
 * that exists in the DB, based on the canonical rolePermissionMap.
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const permissions = [
  ["platform.read", "Platform", "View companies, branches, farms, sites, warehouses, and departments"],
  ["platform.manage", "Platform", "Manage companies, branches, farms, sites, warehouses, and departments"],
  ["identity.read", "Identity", "View users, roles, permissions, and access assignments"],
  ["identity.manage", "Identity", "Manage users, roles, permissions, and access assignments"],
  ["inventory.read", "Inventory", "View products, stock batches, inventory items, and stock movements"],
  ["inventory.manage", "Inventory", "Manage products, stock batches, inventory items, and stock movements"],
  ["poultry.read", "Poultry", "View poultry houses and poultry operations"],
  ["poultry.manage", "Poultry", "Manage poultry houses and poultry operations"],
  ["poultry.record", "Poultry", "Submit daily poultry operating records"],
  ["feed.read", "Feed Production", "View feed production records"],
  ["feed.manage", "Feed Production", "Manage feed production records"],
  ["soya.read", "Soya Processing", "View soya processing records"],
  ["soya.manage", "Soya Processing", "Manage soya processing records"],
  ["finance.read", "Finance", "View finance and accounting records"],
  ["finance.manage", "Finance", "Manage finance and accounting records"],
  ["sales.read", "Sales", "View sales and customer records"],
  ["sales.manage", "Sales", "Manage sales and customer records"],
  ["procurement.read", "Procurement", "View procurement and supplier records"],
  ["procurement.manage", "Procurement", "Manage procurement and supplier records"],
  ["market-planning.read", "Market Planning", "View market-led production planning and MRP"],
  ["market-planning.manage", "Market Planning", "Manage market targets, MRP, and production planning"],
  ["hr.read", "HR", "View HR, worker, and task records"],
  ["hr.manage", "HR", "Manage HR, worker, and task records"],
  ["maintenance.read", "Maintenance", "View machine and maintenance records"],
  ["maintenance.manage", "Maintenance", "Manage machine and maintenance records"],
  ["quality.read", "Quality Control", "View quality control records"],
  ["quality.manage", "Quality Control", "Manage quality control records"],
  ["health.read", "Vet and Health", "View veterinary and flock health records"],
  ["health.manage", "Vet and Health", "Manage veterinary and flock health records"],
  ["reports.export", "Reports", "Export operational reports"],
  ["audit.read", "Audit", "View audit logs"],
  ["settings.manage", "Settings", "Manage system settings"],
  ["ai.read", "AI Assistant", "Access AI business assistant"],
  ["alerts.read", "Alerts", "View system alerts and forecasts"],
  ["alerts.manage", "Alerts", "Acknowledge and resolve system alerts"],
  ["quickbooks.read", "QuickBooks", "View QuickBooks integration status and sync logs"],
  ["quickbooks.manage", "QuickBooks", "Manage QuickBooks connection, sync, and mappings"],
  ["executive.read", "Executive", "Access the executive dashboard, AI assistant, AI alerts, and business intelligence reports"],
] as const;

const ALL_KEYS = permissions.map(([key]) => key);

const rolePermissionMap: Record<string, readonly string[]> = {
  "Super Admin": ALL_KEYS,
  "CEO/Owner": ALL_KEYS,
  "General Manager": ALL_KEYS.filter((k) => k !== "settings.manage"),
  "Farm Manager": ["platform.read", "inventory.read", "poultry.read", "poultry.manage", "poultry.record", "health.read", "maintenance.read", "maintenance.manage"],
  "Feed Mill Manager": ["platform.read", "inventory.read", "inventory.manage", "feed.read", "feed.manage", "market-planning.read", "quality.read", "maintenance.read", "maintenance.manage", "reports.export", "ai.read", "alerts.read", "alerts.manage"],
  "Marketing Manager": ["platform.read", "inventory.read", "sales.read", "market-planning.read", "market-planning.manage", "reports.export", "ai.read", "alerts.read"],
  "Sales Manager": ["platform.read", "inventory.read", "sales.read", "sales.manage", "market-planning.read", "market-planning.manage", "reports.export", "ai.read", "alerts.read"],
  "Soya Manager": ["platform.read", "inventory.read", "inventory.manage", "soya.read", "soya.manage", "quality.read", "maintenance.read", "maintenance.manage", "reports.export", "ai.read", "alerts.read", "alerts.manage"],
  "Storekeeper": ["platform.read", "inventory.read", "inventory.manage", "feed.read", "soya.read", "maintenance.read", "reports.export", "ai.read", "alerts.read"],
  "Accountant": ["platform.read", "finance.read", "finance.manage", "feed.read", "soya.read", "sales.read", "procurement.read", "reports.export", "ai.read", "alerts.read"],
  "Sales Officer": ["platform.read", "sales.read", "sales.manage", "inventory.read", "market-planning.read", "reports.export", "ai.read", "alerts.read"],
  "Procurement Officer": ["platform.read", "procurement.read", "procurement.manage", "inventory.read", "reports.export", "ai.read", "alerts.read"],
  "HR/Admin": ["platform.read", "hr.read", "hr.manage", "identity.read", "identity.manage"],
  "Maintenance Officer": ["platform.read", "maintenance.read", "maintenance.manage", "reports.export", "ai.read", "alerts.read"],
  "Quality Officer": ["platform.read", "quality.read", "quality.manage", "feed.read", "soya.read", "inventory.read", "reports.export", "ai.read", "alerts.read"],
  "Vet/Health Officer": ["platform.read", "poultry.read", "poultry.record", "health.read", "health.manage", "reports.export", "ai.read", "alerts.read"],
  "Worker": ["platform.read", "poultry.read", "poultry.record", "inventory.read"],
  "Auditor": ["platform.read", "identity.read", "inventory.read", "feed.read", "soya.read", "finance.read", "maintenance.read", "market-planning.read", "reports.export", "audit.read", "alerts.read"],
};

async function main() {
  const companies = await prisma.company.findMany({ select: { id: true, name: true } });
  console.log(`[sync-permissions] ${companies.length} companies found`);

  for (const company of companies) {
    console.log(`[sync-permissions] syncing company: ${company.name} (${company.id})`);

    const upserted = await Promise.all(
      permissions.map(([key, module, description]) =>
        prisma.permission.upsert({
          where: { companyId_key: { companyId: company.id, key } },
          update: { module, description },
          create: { companyId: company.id, key, module, description },
        })
      )
    );
    const permByKey = new Map(upserted.map((p) => [p.key, p]));
    console.log(`[sync-permissions]   ${upserted.length} permissions upserted`);

    const allRoles = await prisma.role.findMany({
      where: { companyId: company.id },
      select: { id: true, name: true },
    });
    console.log(`[sync-permissions]   ${allRoles.length} roles found`);

    let linked = 0;
    for (const role of allRoles) {
      const keys = rolePermissionMap[role.name];
      if (!keys) {
        console.log(`[sync-permissions]   no permission map for role "${role.name}" — skipping`);
        continue;
      }

      const permIds = keys.map((k) => permByKey.get(k)?.id).filter((id): id is string => !!id);
      if (!permIds.length) continue;

      await prisma.$executeRawUnsafe(
        `DELETE FROM _RolePermissions WHERE B = ? AND A NOT IN (${permIds.map(() => "?").join(",")})`,
        role.id,
        ...permIds
      );

      for (const permId of permIds) {
        await prisma.$executeRawUnsafe(
          `INSERT IGNORE INTO _RolePermissions (A, B) VALUES (?, ?)`,
          permId,
          role.id
        );
      }

      linked += permIds.length;
      console.log(`[sync-permissions]   ${role.name}: ${permIds.length} permissions`);
    }

    console.log(`[sync-permissions]   ${linked} total role-permission links for ${company.name}`);
  }

  console.log("[sync-permissions] done");
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());

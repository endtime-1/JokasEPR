import { Injectable, Logger, OnApplicationBootstrap } from "@nestjs/common";
import { PrismaService } from "../../modules/prisma/prisma.service";

const PERMISSIONS = [
  ["platform.read", "Platform", "View companies, branches, farms, sites, warehouses, and departments"],
  ["platform.manage", "Platform", "Manage companies, branches, farms, sites, warehouses, and departments"],
  ["identity.read", "Identity", "View users, roles, permissions, and access assignments"],
  ["identity.manage", "Identity", "Manage users, roles, permissions, and access assignments"],
  ["inventory.read", "Inventory", "View products, stock batches, inventory items, and stock movements"],
  ["inventory.manage", "Inventory", "Manage products, stock batches, inventory items, and stock movements"],
  ["poultry.read", "Poultry", "View poultry houses and poultry operations"],
  ["poultry.manage", "Poultry", "Manage poultry houses and poultry operations"],
  ["poultry.record", "Poultry", "Submit daily poultry operating records"],
  ["poultry.supervise", "Poultry", "Record farm feed-store receipts and reconcile feed stock"],
  ["feed.read", "Feed Production", "View feed production records"],
  ["feed.manage", "Feed Production", "Manage feed production records"],
  ["soya.read", "Soya Processing", "View soya processing records"],
  ["soya.manage", "Soya Processing", "Manage soya processing records"],
  ["finance.read", "Finance", "View finance and accounting records"],
  ["finance.manage", "Finance", "Manage finance and accounting records"],
  ["sales.read", "Sales", "View sales and customer records"],
  ["sales.manage", "Sales", "Manage sales and customer records"],
  ["egg-sales.read", "Egg Sales", "View egg sale records"],
  ["egg-sales.manage", "Egg Sales", "Record and void egg sales"],
  ["procurement.read", "Procurement", "View procurement and supplier records"],
  ["procurement.manage", "Procurement", "Manage procurement and supplier records"],
  ["market-planning.read", "Market Planning", "View market-led production planning and MRP"],
  ["market-planning.submit", "Market Planning", "Create and submit a weekly/monthly market target for your own market"],
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

const ALL_KEYS = PERMISSIONS.map(([key]) => key);

// System roles that must exist for every company. Added here (not only in
// setup.service.ts) so a NEW system role rolls out to companies that were
// created before it existed — created once, idempotently, then picked up by
// the permission sync below like any other role. Never removes roles.
//
// (2026-09-15) Live symptom: "Marketing Manager" didn't show up in the Users
// role picker at all, and this company's Role table turned out to genuinely
// never have had it — being in ROLE_PERMISSION_MAP (attaches permissions to
// a role that already exists) and in setup.service.ts's brand-new-company
// list doesn't backfill an EXISTING company. Checking this company's actual
// synced-role log against setup.service.ts's full canonical list turned up
// six roles missing this same way, not just the one reported — added all
// of them here rather than fixing them one report at a time. Also switched
// this list to carry its own level per role instead of a hardcoded
// "OFFICER" (harmless for the original three, would have been wrong for
// every MANAGER-level role added since).
const ENSURE_SYSTEM_ROLES: ReadonlyArray<readonly [string, string, "MANAGER" | "OFFICER"]> = [
  ["Poultry Supervisor", "Records farm feed-store receipts and pen-level poultry operations", "OFFICER"],
  ["Marketer", "Submits a weekly market target for their own assigned market", "OFFICER"],
  ["Egg Sales Officer", "Records direct egg sales from an egg store", "OFFICER"],
  ["Marketing Manager", "Marketing and planning management", "MANAGER"],
  ["Sales Manager", "Sales and customer management", "MANAGER"],
  ["Soya Manager", "Soya processing management", "MANAGER"],
  ["Procurement Officer", "Procurement and supplier operations", "OFFICER"],
  ["Maintenance Officer", "Machine and maintenance operations", "OFFICER"],
  ["Quality Officer", "Quality control operations", "OFFICER"],
  ["Vet/Health Officer", "Veterinary and flock health operations", "OFFICER"],
];

const ROLE_PERMISSION_MAP: Record<string, readonly string[]> = {
  // ── Core roles ──────────────────────────────────────────────────────────────
  "Super Admin": ALL_KEYS,
  "Admin": ALL_KEYS,
  "CEO/Owner": ALL_KEYS,
  "CEO": ALL_KEYS,
  "Owner": ALL_KEYS,
  "General Manager": ALL_KEYS.filter((k) => k !== "settings.manage"),

  // ── Manager-level roles ──────────────────────────────────────────────────────
  "Farm Manager": ["platform.read", "inventory.read", "inventory.manage", "poultry.read", "poultry.manage", "poultry.record", "poultry.supervise", "health.read", "health.manage", "maintenance.read", "maintenance.manage"],
  "Feed Mill Manager": ["platform.read", "inventory.read", "inventory.manage", "feed.read", "feed.manage", "market-planning.read", "quality.read", "maintenance.read", "maintenance.manage", "reports.export", "ai.read", "alerts.read", "alerts.manage"],
  "Feed Production Manager": ["platform.read", "inventory.read", "inventory.manage", "feed.read", "feed.manage", "market-planning.read", "quality.read", "maintenance.read", "maintenance.manage", "reports.export", "ai.read", "alerts.read", "alerts.manage"],
  // identity.read (2026-09-14): assigning a marketer to a Market means
  // picking them from the company's user list — the same reason any
  // "assign this to a teammate" picker needs read access to that list.
  "Marketing Manager": ["platform.read", "identity.read", "inventory.read", "sales.read", "market-planning.read", "market-planning.submit", "market-planning.manage", "reports.export", "ai.read", "alerts.read"],
  "Sales Manager": ["platform.read", "identity.read", "inventory.read", "sales.read", "sales.manage", "market-planning.read", "market-planning.submit", "market-planning.manage", "reports.export", "ai.read", "alerts.read"],
  "Soya Manager": ["platform.read", "inventory.read", "inventory.manage", "soya.read", "soya.manage", "quality.read", "maintenance.read", "maintenance.manage", "reports.export", "ai.read", "alerts.read", "alerts.manage"],
  "Soya Processing Manager": ["platform.read", "inventory.read", "inventory.manage", "soya.read", "soya.manage", "quality.read", "maintenance.read", "maintenance.manage", "reports.export", "ai.read", "alerts.read", "alerts.manage"],

  // ── Officer-level roles ──────────────────────────────────────────────────────
  "Storekeeper": ["platform.read", "inventory.read", "inventory.manage", "feed.read", "soya.read", "maintenance.read", "reports.export", "ai.read", "alerts.read"],
  "Store Keeper": ["platform.read", "inventory.read", "inventory.manage", "feed.read", "soya.read", "maintenance.read", "reports.export", "ai.read", "alerts.read"],
  "Accountant": ["platform.read", "finance.read", "finance.manage", "feed.read", "soya.read", "sales.read", "procurement.read", "reports.export", "ai.read", "alerts.read"],
  "Finance Officer": ["platform.read", "finance.read", "finance.manage", "sales.read", "procurement.read", "reports.export", "ai.read", "alerts.read"],
  "Sales Officer": ["platform.read", "sales.read", "sales.manage", "inventory.read", "market-planning.read", "reports.export", "ai.read", "alerts.read"],
  "Procurement Officer": ["platform.read", "procurement.read", "procurement.manage", "inventory.read", "reports.export", "ai.read", "alerts.read"],
  "HR/Admin": ["platform.read", "hr.read", "hr.manage", "identity.read", "identity.manage"],
  "HR Officer": ["platform.read", "hr.read", "hr.manage"],
  "Maintenance Officer": ["platform.read", "maintenance.read", "maintenance.manage", "reports.export", "ai.read", "alerts.read"],
  "Quality Officer": ["platform.read", "quality.read", "quality.manage", "feed.read", "soya.read", "inventory.read", "reports.export", "ai.read", "alerts.read"],
  "Quality Control Officer": ["platform.read", "quality.read", "quality.manage", "feed.read", "soya.read", "inventory.read", "reports.export", "ai.read", "alerts.read"],
  "Vet/Health Officer": ["platform.read", "poultry.read", "poultry.record", "health.read", "health.manage", "reports.export", "ai.read", "alerts.read"],
  "Vet Officer": ["platform.read", "poultry.read", "poultry.record", "health.read", "health.manage", "reports.export", "ai.read", "alerts.read"],
  "Health Officer": ["platform.read", "poultry.read", "poultry.record", "health.read", "health.manage", "reports.export", "ai.read", "alerts.read"],

  // ── Supervisor-level roles ───────────────────────────────────────────────────
  // Poultry Supervisor: works in the pens/houses. Records feed received into the
  // farm feed store, records feeding/mortality/eggs (which draw feed stock down
  // automatically), and reconciles feed on hand. Sits alongside Workers.
  "Poultry Supervisor": ["platform.read", "poultry.read", "poultry.record", "poultry.supervise", "health.read", "inventory.read", "feed.read", "reports.export", "alerts.read"],
  // Marketer: owns one (or more) assigned Markets, submits their own weekly
  // MarketTarget for it. No market-planning.manage — can't approve, and the
  // service layer further restricts them to seeing/editing only their own
  // targets, never another marketer's.
  "Marketer": ["platform.read", "sales.read", "inventory.read", "market-planning.read", "market-planning.submit", "reports.export", "ai.read", "alerts.read"],
  // Egg Sales Officer: a distinct person from the marketers (owner's
  // instruction, 2026-09-14) — records direct egg sales only. Deliberately
  // no sales.* or market-planning.* — this role's whole job is the egg-sales
  // screen, not the general Sales module.
  "Egg Sales Officer": ["platform.read", "inventory.read", "egg-sales.read", "egg-sales.manage", "reports.export", "alerts.read"],

  // ── Worker-level roles ───────────────────────────────────────────────────────
  "Worker": ["platform.read", "poultry.read", "poultry.record", "inventory.read"],
  "Field Officer": ["platform.read", "poultry.read", "poultry.record", "inventory.read"],
  "Farm Worker": ["platform.read", "poultry.read", "poultry.record"],
  "Feed Production Officer": ["platform.read", "feed.read", "inventory.read"],
  "Soya Processing Officer": ["platform.read", "soya.read", "inventory.read"],

  // ── Audit role ───────────────────────────────────────────────────────────────
  "Auditor": ["platform.read", "identity.read", "inventory.read", "feed.read", "soya.read", "finance.read", "maintenance.read", "market-planning.read", "reports.export", "audit.read", "alerts.read"],
};

@Injectable()
export class PermissionSyncService implements OnApplicationBootstrap {
  private readonly logger = new Logger(PermissionSyncService.name);

  constructor(private readonly prisma: PrismaService) {}

  async onApplicationBootstrap() {
    try {
      await this.sync();
    } catch (err) {
      this.logger.error("Permission sync failed on startup", err);
    }
  }

  private async sync() {
    const companies = await this.prisma.company.findMany({ select: { id: true, name: true } });
    this.logger.log(`Syncing permissions for ${companies.length} company/companies`);

    for (const company of companies) {
      const upserted = await Promise.all(
        PERMISSIONS.map(([key, module, description]) =>
          this.prisma.permission.upsert({
            where: { companyId_key: { companyId: company.id, key } },
            update: { module, description },
            create: { companyId: company.id, key, module, description },
          })
        )
      );
      const permByKey = new Map(upserted.map((p) => [p.key, p]));

      for (const [name, description, level] of ENSURE_SYSTEM_ROLES) {
        const existing = await this.prisma.role.findFirst({
          where: { companyId: company.id, name },
          select: { id: true },
        });
        if (!existing) {
          await this.prisma.role.create({
            data: { companyId: company.id, name, description, level, isSystem: true },
          });
          this.logger.log(`  created missing system role "${name}"`);
        }
      }

      const roles = await this.prisma.role.findMany({
        where: { companyId: company.id },
        select: { id: true, name: true },
      });

      let synced = 0;
      for (const role of roles) {
        const keys = ROLE_PERMISSION_MAP[role.name];
        if (!keys) {
          this.logger.warn(`No permission map for role "${role.name}" — skipping`);
          continue;
        }

        const permIds = keys.map((k) => permByKey.get(k)?.id).filter((id): id is string => !!id);

        // Connect only — adds any missing permissions without removing permissions
        // that an admin has manually customised via the Identity UI.
        await this.prisma.role.update({
          where: { id: role.id },
          data: { permissions: { connect: permIds.map((id) => ({ id })) } },
        });

        this.logger.log(`  ${role.name}: ${permIds.length} permissions connected`);
        synced++;
      }

      this.logger.log(`${company.name}: synced ${synced}/${roles.length} roles`);
    }
  }
}

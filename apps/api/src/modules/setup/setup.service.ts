import { ForbiddenException, Injectable } from "@nestjs/common";
import { RoleLevel } from "@prisma/client";
import bcrypt from "bcryptjs";
import { PrismaService } from "../prisma/prisma.service";
import { SetupDto } from "./dto/setup.dto";

const ALL_PERMISSIONS = [
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
] as const;

@Injectable()
export class SetupService {
  constructor(private readonly prisma: PrismaService) {}

  async status() {
    const count = await this.prisma.user.count();
    return { setupRequired: count === 0 };
  }

  async setup(dto: SetupDto) {
    const count = await this.prisma.user.count();
    if (count > 0) {
      throw new ForbiddenException("Setup has already been completed.");
    }

    const passwordHash = await bcrypt.hash(dto.password, 12);

    // Company + branch
    const company = await this.prisma.company.create({
      data: {
        name: dto.companyName,
        legalName: dto.companyName,
        timezone: "Africa/Accra",
      },
    });

    const branch = await this.prisma.branch.create({
      data: {
        companyId: company.id,
        name: "Head Office",
        code: "HQ",
        isHeadOffice: true,
      },
    });

    // Permissions
    const permissions = await Promise.all(
      ALL_PERMISSIONS.map(([key, module, description]) =>
        this.prisma.permission.create({
          data: { companyId: company.id, key, module, description },
        })
      )
    );

    // Super Admin role — gets every permission
    const superAdminRole = await this.prisma.role.create({
      data: {
        companyId: company.id,
        name: "Super Admin",
        level: RoleLevel.SUPER_ADMIN,
        description: "Full system access",
        isSystem: true,
        permissions: {
          connect: permissions.map((p) => ({ id: p.id })),
        },
      },
    });

    // Additional standard roles (no permissions yet — admin assigns later)
    const otherRoles = [
      ["CEO/Owner", RoleLevel.CEO, "Company owner and executive access"],
      ["General Manager", RoleLevel.MANAGER, "General operations management"],
      ["Farm Manager", RoleLevel.MANAGER, "Farm and poultry operations management"],
      ["Feed Mill Manager", RoleLevel.MANAGER, "Feed mill operations management"],
      ["Storekeeper", RoleLevel.OFFICER, "Warehouse and stock control"],
      ["Accountant", RoleLevel.OFFICER, "Finance and accounting operations"],
      ["Sales Officer", RoleLevel.OFFICER, "Sales and customer operations"],
      ["HR/Admin", RoleLevel.OFFICER, "Human resources and administration"],
      ["Worker", RoleLevel.WORKER, "Operational worker"],
      ["Auditor", RoleLevel.AUDITOR, "Read-only audit access"],
    ] as const;

    await Promise.all(
      otherRoles.map(([name, level, description]) =>
        this.prisma.role.create({
          data: { companyId: company.id, name, level, description, isSystem: true },
        })
      )
    );

    // Admin user
    const user = await this.prisma.user.create({
      data: {
        companyId: company.id,
        branchId: branch.id,
        email: dto.email.toLowerCase().trim(),
        fullName: dto.adminName,
        passwordHash,
      },
    });

    // Link user ↔ Super Admin role
    await this.prisma.userRole.create({
      data: { userId: user.id, roleId: superAdminRole.id, companyId: company.id },
    });

    // Give user access to head office branch
    await this.prisma.userBranchAccess.create({
      data: { userId: user.id, branchId: branch.id, companyId: company.id },
    });

    return {
      success: true,
      message: "Setup complete. You can now log in.",
      email: user.email,
      companyId: company.id,
    };
  }
}

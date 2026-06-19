import { BirdType, BusinessUnit, DashboardMetricKey, PoultryCostType, Prisma, PrismaClient, ProductionSiteType, RoleLevel } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

const ids = {
  company: "11111111-1111-4111-8111-111111111111",
  accraBranch: "22222222-2222-4222-8222-222222222201",
  kumasiBranch: "22222222-2222-4222-8222-222222222202",
  layerFarm: "33333333-3333-4333-8333-333333333301",
  broilerFarm: "33333333-3333-4333-8333-333333333302",
  breederFarm: "33333333-3333-4333-8333-333333333303",
  mainWarehouse: "44444444-4444-4444-8444-444444444401",
  farmWarehouse: "44444444-4444-4444-8444-444444444402",
  feedWarehouse: "44444444-4444-4444-8444-444444444403",
  soyaWarehouse: "44444444-4444-4444-8444-444444444404",
  feedSite: "55555555-5555-4555-8555-555555555501",
  soyaSite: "55555555-5555-4555-8555-555555555502"
};

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
  ["alerts.manage", "Alerts", "Acknowledge and resolve system alerts"]
] as const;

const roles = [
  ["Super Admin", RoleLevel.SUPER_ADMIN, "Full system access"],
  ["CEO/Owner", RoleLevel.CEO, "Company owner and executive access"],
  ["General Manager", RoleLevel.MANAGER, "General operations management"],
  ["Farm Manager", RoleLevel.MANAGER, "Farm and poultry operations management"],
  ["Feed Mill Manager", RoleLevel.MANAGER, "Feed mill operations management"],
  ["Marketing Manager", RoleLevel.MANAGER, "Market demand and target planning"],
  ["Sales Manager", RoleLevel.MANAGER, "Sales demand and order fulfillment management"],
  ["Soya Manager", RoleLevel.MANAGER, "Soya processing operations management"],
  ["Storekeeper", RoleLevel.OFFICER, "Warehouse and stock control"],
  ["Accountant", RoleLevel.OFFICER, "Finance and accounting operations"],
  ["Sales Officer", RoleLevel.OFFICER, "Sales and customer operations"],
  ["Procurement Officer", RoleLevel.OFFICER, "Procurement and supplier operations"],
  ["HR/Admin", RoleLevel.OFFICER, "Human resources and administration"],
  ["Maintenance Officer", RoleLevel.OFFICER, "Machine and maintenance operations"],
  ["Quality Officer", RoleLevel.OFFICER, "Quality control operations"],
  ["Vet/Health Officer", RoleLevel.OFFICER, "Veterinary and flock health operations"],
  ["Worker", RoleLevel.WORKER, "Operational worker"],
  ["Auditor", RoleLevel.AUDITOR, "Read-only audit access"]
] as const;

const rolePermissionMap: Record<string, string[]> = {
  "Super Admin": permissions.map(([key]) => key),
  "CEO/Owner": permissions.map(([key]) => key),
  "General Manager": permissions.map(([key]) => key).filter((key) => key !== "settings.manage"),
  "Farm Manager": ["platform.read", "inventory.read", "poultry.read", "poultry.manage", "poultry.record", "health.read", "maintenance.read", "maintenance.manage", "reports.export", "ai.read", "alerts.read", "alerts.manage"],
  "Feed Mill Manager": ["platform.read", "inventory.read", "inventory.manage", "feed.read", "feed.manage", "market-planning.read", "quality.read", "maintenance.read", "maintenance.manage", "reports.export", "ai.read", "alerts.read", "alerts.manage"],
  "Marketing Manager": ["platform.read", "inventory.read", "sales.read", "market-planning.read", "market-planning.manage", "reports.export", "ai.read", "alerts.read"],
  "Sales Manager": ["platform.read", "inventory.read", "sales.read", "sales.manage", "market-planning.read", "market-planning.manage", "reports.export", "ai.read", "alerts.read"],
  "Soya Manager": ["platform.read", "inventory.read", "inventory.manage", "soya.read", "soya.manage", "quality.read", "maintenance.read", "maintenance.manage", "reports.export", "ai.read", "alerts.read", "alerts.manage"],
  Storekeeper: ["platform.read", "inventory.read", "inventory.manage", "feed.read", "soya.read", "maintenance.read", "reports.export", "ai.read", "alerts.read"],
  Accountant: ["platform.read", "finance.read", "finance.manage", "feed.read", "soya.read", "sales.read", "procurement.read", "reports.export", "ai.read", "alerts.read"],
  "Sales Officer": ["platform.read", "sales.read", "sales.manage", "inventory.read", "market-planning.read", "reports.export", "ai.read", "alerts.read"],
  "Procurement Officer": ["platform.read", "procurement.read", "procurement.manage", "inventory.read", "reports.export", "ai.read", "alerts.read"],
  "HR/Admin": ["platform.read", "hr.read", "hr.manage", "identity.read", "reports.export"],
  "Maintenance Officer": ["platform.read", "maintenance.read", "maintenance.manage", "reports.export", "ai.read", "alerts.read"],
  "Quality Officer": ["platform.read", "quality.read", "quality.manage", "feed.read", "soya.read", "inventory.read", "reports.export", "ai.read", "alerts.read"],
  "Vet/Health Officer": ["platform.read", "poultry.read", "poultry.record", "health.read", "health.manage", "reports.export", "ai.read", "alerts.read"],
  Worker: ["platform.read", "poultry.read", "poultry.record", "inventory.read"],
  Auditor: ["platform.read", "identity.read", "inventory.read", "feed.read", "soya.read", "finance.read", "maintenance.read", "market-planning.read", "reports.export", "audit.read", "alerts.read"]
};

function roleEmail(roleName: string) {
  if (roleName === "Super Admin") {
    return "admin@jokas.local";
  }

  return `${roleName.toLowerCase().replace(/\/owner/g, "").replace(/[^a-z0-9]+/g, ".").replace(/\.$/, "")}@jokas.local`;
}

async function upsertSystemSetting(companyId: string, key: string, value: string, description: string) {
  const existing = await prisma.systemSetting.findFirst({
    where: { companyId, key, branchId: null, farmId: null, warehouseId: null, productionSiteId: null }
  });

  if (existing) {
    return prisma.systemSetting.update({ where: { id: existing.id }, data: { value, description } });
  }

  return prisma.systemSetting.create({ data: { companyId, key, value, description } });
}

function metricDate(daysAgo: number) {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() - daysAgo);
  return date;
}

async function main() {
  const passwordHash = await bcrypt.hash("Admin@12345", 12);

  const company = await prisma.company.upsert({
    where: { id: ids.company },
    update: {},
    create: {
      id: ids.company,
      name: "Jokas Agribusiness Demo Company",
      legalName: "Jokas Agribusiness Ltd",
      taxId: "DEMO-TIN-001",
      timezone: "Africa/Accra"
    }
  });

  const branches = await Promise.all([
    prisma.branch.upsert({
      where: { companyId_code: { companyId: company.id, code: "ACC-HQ" } },
      update: {},
      create: {
        id: ids.accraBranch,
        companyId: company.id,
        name: "Accra Head Office",
        code: "ACC-HQ",
        city: "Accra",
        isHeadOffice: true
      }
    }),
    prisma.branch.upsert({
      where: { companyId_code: { companyId: company.id, code: "KSI-BR" } },
      update: {},
      create: {
        id: ids.kumasiBranch,
        companyId: company.id,
        name: "Kumasi Branch",
        code: "KSI-BR",
        city: "Kumasi"
      }
    })
  ]);

  const [accraBranch, kumasiBranch] = branches;

  const departments = await Promise.all(
    ["Operations", "Finance", "Sales", "Procurement", "HR/Admin", "Maintenance", "Quality", "Health"].map((name) =>
      prisma.department.upsert({
        where: { companyId_code: { companyId: company.id, code: name.toUpperCase().replace(/[^A-Z0-9]+/g, "-") } },
        update: {},
        create: {
          companyId: company.id,
          branchId: accraBranch.id,
          name,
          code: name.toUpperCase().replace(/[^A-Z0-9]+/g, "-")
        }
      })
    )
  );

  const farms = await Promise.all([
    prisma.farm.upsert({
      where: { companyId_code: { companyId: company.id, code: "LAYER-FARM-01" } },
      update: {},
      create: {
        id: ids.layerFarm,
        companyId: company.id,
        branchId: accraBranch.id,
        name: "Accra Layer Farm",
        code: "LAYER-FARM-01",
        type: "POULTRY",
        location: "Nsawam"
      }
    }),
    prisma.farm.upsert({
      where: { companyId_code: { companyId: company.id, code: "BROILER-FARM-01" } },
      update: {},
      create: {
        id: ids.broilerFarm,
        companyId: company.id,
        branchId: accraBranch.id,
        name: "Accra Broiler Farm",
        code: "BROILER-FARM-01",
        type: "POULTRY",
        location: "Dodowa"
      }
    }),
    prisma.farm.upsert({
      where: { companyId_code: { companyId: company.id, code: "BREEDER-FARM-01" } },
      update: {},
      create: {
        id: ids.breederFarm,
        companyId: company.id,
        branchId: kumasiBranch.id,
        name: "Kumasi Breeder Farm",
        code: "BREEDER-FARM-01",
        type: "POULTRY",
        location: "Ejisu"
      }
    })
  ]);

  const poultryHouses = await Promise.all([
    ["Layer House A", "LAYER-A", farms[0].id, accraBranch.id, 6000],
    ["Layer House B", "LAYER-B", farms[0].id, accraBranch.id, 6000],
    ["Broiler House A", "BROILER-A", farms[1].id, accraBranch.id, 8000],
    ["Breeder House A", "BREEDER-A", farms[2].id, kumasiBranch.id, 3000]
  ].map(([name, code, farmId, branchId, capacity]) =>
    prisma.poultryHouse.upsert({
      where: { companyId_farmId_code: { companyId: company.id, farmId: farmId as string, code: code as string } },
      update: {},
      create: {
        companyId: company.id,
        branchId: branchId as string,
        farmId: farmId as string,
        name: name as string,
        code: code as string,
        capacity: capacity as number
      }
    })
  ));

  const productionSites = await Promise.all([
    prisma.productionSite.upsert({
      where: { companyId_code: { companyId: company.id, code: "FEED-MILL-01" } },
      update: {},
      create: {
        id: ids.feedSite,
        companyId: company.id,
        branchId: accraBranch.id,
        name: "Accra Feed Mill",
        code: "FEED-MILL-01",
        type: ProductionSiteType.FEED_PRODUCTION,
        location: "Accra Industrial Area"
      }
    }),
    prisma.productionSite.upsert({
      where: { companyId_code: { companyId: company.id, code: "SOYA-FEED-01" } },
      update: {},
      create: {
        id: ids.soyaSite,
        companyId: company.id,
        branchId: kumasiBranch.id,
        name: "Kumasi Soya and Feed Site",
        code: "SOYA-FEED-01",
        type: ProductionSiteType.MIXED,
        location: "Kumasi Industrial Area"
      }
    })
  ]);

  const warehouses = await Promise.all([
    prisma.warehouse.upsert({
      where: { companyId_code: { companyId: company.id, code: "MAIN-WH" } },
      update: {},
      create: {
        id: ids.mainWarehouse,
        companyId: company.id,
        branchId: accraBranch.id,
        name: "Main Accra Warehouse",
        code: "MAIN-WH",
        type: "GENERAL",
        location: "Accra Head Office"
      }
    }),
    prisma.warehouse.upsert({
      where: { companyId_code: { companyId: company.id, code: "LAYER-FARM-WH" } },
      update: {},
      create: {
        id: ids.farmWarehouse,
        companyId: company.id,
        branchId: accraBranch.id,
        farmId: farms[0].id,
        name: "Layer Farm Store",
        code: "LAYER-FARM-WH",
        type: "FARM_STORE",
        location: "Accra Layer Farm"
      }
    }),
    prisma.warehouse.upsert({
      where: { companyId_code: { companyId: company.id, code: "FEED-MILL-WH" } },
      update: {},
      create: {
        id: ids.feedWarehouse,
        companyId: company.id,
        branchId: accraBranch.id,
        productionSiteId: productionSites[0].id,
        name: "Feed Mill Store",
        code: "FEED-MILL-WH",
        type: "FEED_STORE",
        location: "Accra Feed Mill"
      }
    }),
    prisma.warehouse.upsert({
      where: { companyId_code: { companyId: company.id, code: "SOYA-PROCESS-WH" } },
      update: {},
      create: {
        id: ids.soyaWarehouse,
        companyId: company.id,
        branchId: kumasiBranch.id,
        productionSiteId: productionSites[1].id,
        name: "Soya Processing Store",
        code: "SOYA-PROCESS-WH",
        type: "SOYA_STORE",
        location: "Kumasi Soya and Feed Site"
      }
    })
  ]);

  const [kg, bag, litre] = await Promise.all([
    prisma.unitOfMeasure.upsert({
      where: { companyId_code: { companyId: company.id, code: "KG" } },
      update: {},
      create: { companyId: company.id, name: "Kilogram", code: "KG", symbol: "kg" }
    }),
    prisma.unitOfMeasure.upsert({
      where: { companyId_code: { companyId: company.id, code: "BAG" } },
      update: {},
      create: { companyId: company.id, name: "Bag", code: "BAG", symbol: "bag" }
    }),
    prisma.unitOfMeasure.upsert({
      where: { companyId_code: { companyId: company.id, code: "LTR" } },
      update: {},
      create: { companyId: company.id, name: "Litre", code: "LTR", symbol: "L" }
    })
  ]);

  const [rawCategory, finishedCategory] = await Promise.all([
    prisma.productCategory.upsert({
      where: { companyId_code: { companyId: company.id, code: "RAW-MATERIALS" } },
      update: {},
      create: { companyId: company.id, name: "Raw Materials", code: "RAW-MATERIALS" }
    }),
    prisma.productCategory.upsert({
      where: { companyId_code: { companyId: company.id, code: "FINISHED-GOODS" } },
      update: {},
      create: { companyId: company.id, name: "Finished Goods", code: "FINISHED-GOODS" }
    })
  ]);

  const [maize, layerFeed, soyaOil] = await Promise.all([
    prisma.product.upsert({
      where: { companyId_sku: { companyId: company.id, sku: "MAIZE-RAW" } },
      update: {},
      create: {
        companyId: company.id,
        branchId: accraBranch.id,
        categoryId: rawCategory.id,
        uomId: kg.id,
        name: "Raw Maize",
        sku: "MAIZE-RAW",
        type: "RAW_MATERIAL"
      }
    }),
    prisma.product.upsert({
      where: { companyId_sku: { companyId: company.id, sku: "LAYER-FEED" } },
      update: {},
      create: {
        companyId: company.id,
        branchId: accraBranch.id,
        categoryId: finishedCategory.id,
        uomId: bag.id,
        name: "Layer Feed",
        sku: "LAYER-FEED",
        type: "FINISHED_GOOD"
      }
    }),
    prisma.product.upsert({
      where: { companyId_sku: { companyId: company.id, sku: "SOYA-OIL" } },
      update: {},
      create: {
        companyId: company.id,
        branchId: kumasiBranch.id,
        categoryId: finishedCategory.id,
        uomId: litre.id,
        name: "Soya Oil",
        sku: "SOYA-OIL",
        type: "FINISHED_GOOD"
      }
    })
  ]);

  const [soyaCake, wheatBran, broilerFinisher] = await Promise.all([
    prisma.product.upsert({
      where: { companyId_sku: { companyId: company.id, sku: "SOYA-CAKE" } },
      update: {},
      create: {
        companyId: company.id,
        branchId: kumasiBranch.id,
        categoryId: rawCategory.id,
        uomId: kg.id,
        name: "Soya Cake",
        sku: "SOYA-CAKE",
        type: "RAW_MATERIAL"
      }
    }),
    prisma.product.upsert({
      where: { companyId_sku: { companyId: company.id, sku: "WHEAT-BRAN" } },
      update: {},
      create: {
        companyId: company.id,
        branchId: accraBranch.id,
        categoryId: rawCategory.id,
        uomId: kg.id,
        name: "Wheat Bran",
        sku: "WHEAT-BRAN",
        type: "RAW_MATERIAL"
      }
    }),
    prisma.product.upsert({
      where: { companyId_sku: { companyId: company.id, sku: "BROILER-FINISHER" } },
      update: {},
      create: {
        companyId: company.id,
        branchId: accraBranch.id,
        categoryId: finishedCategory.id,
        uomId: bag.id,
        name: "Broiler Finisher Feed",
        sku: "BROILER-FINISHER",
        type: "FINISHED_GOOD"
      }
    })
  ]);

  const soyaBeans = await prisma.product.upsert({
    where: { companyId_sku: { companyId: company.id, sku: "SOYA-BEANS-RAW" } },
    update: {},
    create: {
      companyId: company.id,
      branchId: kumasiBranch.id,
      categoryId: rawCategory.id,
      uomId: kg.id,
      name: "Raw Soya Beans",
      sku: "SOYA-BEANS-RAW",
      type: "RAW_MATERIAL"
    }
  });

  const [eggs, liveBirds, dressedBirds, manure, medicine, vaccine, packagingBags, sparePart, equipment, farmSupply] = await Promise.all([
    prisma.product.upsert({
      where: { companyId_sku: { companyId: company.id, sku: "EGGS-TRAY" } },
      update: {},
      create: { companyId: company.id, branchId: accraBranch.id, categoryId: finishedCategory.id, uomId: bag.id, name: "Table Eggs Tray", sku: "EGGS-TRAY", type: "FINISHED_GOOD" }
    }),
    prisma.product.upsert({
      where: { companyId_sku: { companyId: company.id, sku: "LIVE-BIRDS" } },
      update: {},
      create: { companyId: company.id, branchId: accraBranch.id, categoryId: finishedCategory.id, uomId: kg.id, name: "Live Birds", sku: "LIVE-BIRDS", type: "FINISHED_GOOD" }
    }),
    prisma.product.upsert({
      where: { companyId_sku: { companyId: company.id, sku: "DRESSED-BIRDS" } },
      update: {},
      create: { companyId: company.id, branchId: accraBranch.id, categoryId: finishedCategory.id, uomId: kg.id, name: "Dressed Birds", sku: "DRESSED-BIRDS", type: "FINISHED_GOOD" }
    }),
    prisma.product.upsert({
      where: { companyId_sku: { companyId: company.id, sku: "POULTRY-MANURE" } },
      update: {},
      create: { companyId: company.id, branchId: accraBranch.id, categoryId: finishedCategory.id, uomId: kg.id, name: "Poultry Manure", sku: "POULTRY-MANURE", type: "FINISHED_GOOD" }
    }),
    prisma.product.upsert({
      where: { companyId_sku: { companyId: company.id, sku: "MED-VITAMIN-MIX" } },
      update: {},
      create: { companyId: company.id, branchId: accraBranch.id, categoryId: rawCategory.id, uomId: kg.id, name: "Vitamin Medication Mix", sku: "MED-VITAMIN-MIX", type: "CONSUMABLE" }
    }),
    prisma.product.upsert({
      where: { companyId_sku: { companyId: company.id, sku: "VAC-ND-1000" } },
      update: {},
      create: { companyId: company.id, branchId: accraBranch.id, categoryId: rawCategory.id, uomId: kg.id, name: "Newcastle Vaccine 1000 Dose", sku: "VAC-ND-1000", type: "CONSUMABLE" }
    }),
    prisma.product.upsert({
      where: { companyId_sku: { companyId: company.id, sku: "PKG-FEED-BAG-50KG" } },
      update: {},
      create: { companyId: company.id, branchId: accraBranch.id, categoryId: rawCategory.id, uomId: bag.id, name: "50kg Feed Packaging Bag", sku: "PKG-FEED-BAG-50KG", type: "CONSUMABLE" }
    }),
    prisma.product.upsert({
      where: { companyId_sku: { companyId: company.id, sku: "SPARE-BELT-PELLET" } },
      update: {},
      create: { companyId: company.id, branchId: accraBranch.id, categoryId: rawCategory.id, uomId: bag.id, name: "Pellet Mill Drive Belt", sku: "SPARE-BELT-PELLET", type: "CONSUMABLE" }
    }),
    prisma.product.upsert({
      where: { companyId_sku: { companyId: company.id, sku: "EQP-FEED-SCALE" } },
      update: {},
      create: { companyId: company.id, branchId: accraBranch.id, categoryId: rawCategory.id, uomId: bag.id, name: "Digital Feed Scale", sku: "EQP-FEED-SCALE", type: "CONSUMABLE" }
    }),
    prisma.product.upsert({
      where: { companyId_sku: { companyId: company.id, sku: "SUP-LITTER-WOOD" } },
      update: {},
      create: { companyId: company.id, branchId: accraBranch.id, categoryId: rawCategory.id, uomId: kg.id, name: "Wood Shavings Litter", sku: "SUP-LITTER-WOOD", type: "CONSUMABLE" }
    })
  ]);

  const maizeInventory = await prisma.inventoryItem.upsert({
    where: { companyId_warehouseId_productId: { companyId: company.id, warehouseId: warehouses[0].id, productId: maize.id } },
    update: {},
    create: {
      companyId: company.id,
      branchId: accraBranch.id,
      warehouseId: warehouses[0].id,
      productId: maize.id,
      uomId: kg.id,
      reorderLevel: 1000,
      quantityOnHand: 5000
    }
  });

  await prisma.inventoryItem.upsert({
    where: { companyId_warehouseId_productId: { companyId: company.id, warehouseId: warehouses[2].id, productId: layerFeed.id } },
    update: {},
    create: {
      companyId: company.id,
      branchId: accraBranch.id,
      warehouseId: warehouses[2].id,
      productionSiteId: productionSites[0].id,
      productId: layerFeed.id,
      uomId: bag.id,
      reorderLevel: 100,
      quantityOnHand: 350
    }
  });

  await prisma.inventoryItem.upsert({
    where: { companyId_warehouseId_productId: { companyId: company.id, warehouseId: warehouses[0].id, productId: soyaOil.id } },
    update: {},
    create: {
      companyId: company.id,
      branchId: accraBranch.id,
      warehouseId: warehouses[0].id,
      productId: soyaOil.id,
      uomId: litre.id,
      reorderLevel: 200,
      quantityOnHand: 1200
    }
  });

  await Promise.all([
    prisma.inventoryItem.upsert({
      where: { companyId_warehouseId_productId: { companyId: company.id, warehouseId: warehouses[0].id, productId: soyaCake.id } },
      update: {},
      create: {
        companyId: company.id,
        branchId: accraBranch.id,
        warehouseId: warehouses[0].id,
        productId: soyaCake.id,
        uomId: kg.id,
        reorderLevel: 800,
        quantityOnHand: 4200
      }
    }),
    prisma.inventoryItem.upsert({
      where: { companyId_warehouseId_productId: { companyId: company.id, warehouseId: warehouses[0].id, productId: wheatBran.id } },
      update: {},
      create: {
        companyId: company.id,
        branchId: accraBranch.id,
        warehouseId: warehouses[0].id,
        productId: wheatBran.id,
        uomId: kg.id,
        reorderLevel: 600,
        quantityOnHand: 3600
      }
    })
  ]);

  await prisma.inventoryItem.upsert({
    where: { companyId_warehouseId_productId: { companyId: company.id, warehouseId: warehouses[3].id, productId: soyaBeans.id } },
    update: {},
    create: {
      companyId: company.id,
      branchId: kumasiBranch.id,
      warehouseId: warehouses[3].id,
      productionSiteId: productionSites[1].id,
      productId: soyaBeans.id,
      uomId: kg.id,
      reorderLevel: 2000,
      quantityOnHand: 9000
    }
  });

  const maizeBatch = await prisma.stockBatch.upsert({
    where: { companyId_batchNumber_productId: { companyId: company.id, batchNumber: "OPENING-MAIZE-001", productId: maize.id } },
    update: {},
    create: {
      companyId: company.id,
      branchId: accraBranch.id,
      warehouseId: warehouses[0].id,
      productId: maize.id,
      inventoryItemId: maizeInventory.id,
      uomId: kg.id,
      batchNumber: "OPENING-MAIZE-001",
      quantityReceived: 5000,
      quantityRemaining: 5000,
      unitCost: 3.5
    }
  });

  const createdPermissions = await Promise.all(
    permissions.map(([key, module, description]) =>
      prisma.permission.upsert({
        where: { companyId_key: { companyId: company.id, key } },
        update: { module, description },
        create: { companyId: company.id, key, module, description }
      })
    )
  );
  const permissionByKey = new Map(createdPermissions.map((permission) => [permission.key, permission]));
  const roleByName = new Map<string, { id: string; name: string }>();

  for (const [name, level, description] of roles) {
    const role = await prisma.role.upsert({
      where: { companyId_name: { companyId: company.id, name } },
      update: { level, description },
      create: { companyId: company.id, name, level, description, isSystem: true }
    });
    roleByName.set(name, role);

    await prisma.role.update({
      where: { id: role.id },
      data: {
        permissions: {
          set: (rolePermissionMap[name] ?? []).map((key) => ({ id: permissionByKey.get(key)!.id }))
        }
      }
    });
  }

  const departmentByName = new Map(departments.map((department) => [department.name, department.id]));
  const superAdminUsers: string[] = [];

  for (const [roleName] of roles) {
    const role = roleByName.get(roleName)!;
    const user = await prisma.user.upsert({
      where: { companyId_email: { companyId: company.id, email: roleEmail(roleName) } },
      update: { passwordHash },
      create: {
        companyId: company.id,
        branchId: roleName === "Soya Manager" ? kumasiBranch.id : accraBranch.id,
        farmId: ["Farm Manager", "Vet/Health Officer", "Worker"].includes(roleName) ? farms[0].id : undefined,
        warehouseId: roleName === "Storekeeper" ? warehouses[0].id : undefined,
        productionSiteId:
          roleName === "Feed Mill Manager" ? productionSites[0].id : roleName === "Soya Manager" ? productionSites[1].id : undefined,
        departmentId:
          roleName === "Accountant"
            ? departmentByName.get("Finance")
            : roleName === "Sales Officer"
              ? departmentByName.get("Sales")
              : roleName === "Procurement Officer"
                ? departmentByName.get("Procurement")
                : roleName === "HR/Admin"
                  ? departmentByName.get("HR/Admin")
                  : roleName === "Maintenance Officer"
                    ? departmentByName.get("Maintenance")
                    : roleName === "Quality Officer"
                      ? departmentByName.get("Quality")
                      : roleName === "Vet/Health Officer"
                        ? departmentByName.get("Health")
                        : departmentByName.get("Operations"),
        email: roleEmail(roleName),
        fullName: roleName,
        passwordHash
      }
    });

    if (roleName === "Super Admin") {
      superAdminUsers.push(user.id);
    }

    await prisma.userRole.upsert({
      where: { userId_roleId: { userId: user.id, roleId: role.id } },
      update: {},
      create: { userId: user.id, roleId: role.id, companyId: company.id }
    });

    for (const branch of branches) {
      if (["Super Admin", "CEO/Owner", "General Manager", "Auditor"].includes(roleName) || branch.id === user.branchId) {
        await prisma.userBranchAccess.upsert({
          where: { userId_branchId: { userId: user.id, branchId: branch.id } },
          update: {},
          create: { userId: user.id, branchId: branch.id, companyId: company.id }
        });
      }
    }

    const accessibleFarms = ["Super Admin", "CEO/Owner", "General Manager", "Auditor"].includes(roleName) ? farms : farms.filter((farm) => farm.id === user.farmId);
    for (const farm of accessibleFarms) {
      await prisma.userFarmAccess.upsert({
        where: { userId_farmId: { userId: user.id, farmId: farm.id } },
        update: {},
        create: { userId: user.id, farmId: farm.id, companyId: company.id }
      });
    }

    const accessibleWarehouses =
      ["Super Admin", "CEO/Owner", "General Manager", "Feed Mill Manager", "Soya Manager", "Storekeeper", "Auditor"].includes(roleName) ? warehouses : warehouses.filter((warehouse) => warehouse.id === user.warehouseId);
    for (const warehouse of accessibleWarehouses) {
      await prisma.userWarehouseAccess.upsert({
        where: { userId_warehouseId: { userId: user.id, warehouseId: warehouse.id } },
        update: {},
        create: { userId: user.id, warehouseId: warehouse.id, companyId: company.id }
      });
    }

    const accessibleSites =
      ["Super Admin", "CEO/Owner", "General Manager", "Auditor"].includes(roleName) ? productionSites : productionSites.filter((site) => site.id === user.productionSiteId);
    for (const site of accessibleSites) {
      await prisma.userProductionSiteAccess.upsert({
        where: { userId_productionSiteId: { userId: user.id, productionSiteId: site.id } },
        update: {},
        create: { userId: user.id, productionSiteId: site.id, companyId: company.id }
      });
    }
  }

  const superAdmin = await prisma.user.findUniqueOrThrow({
    where: { companyId_email: { companyId: company.id, email: "admin@jokas.local" } }
  });

  await prisma.poultryCostRecord.deleteMany({ where: { companyId: company.id } });
  await prisma.poultryHealthObservation.deleteMany({ where: { companyId: company.id } });
  await prisma.poultryTransferRecord.deleteMany({ where: { companyId: company.id } });
  await prisma.vaccinationRecord.deleteMany({ where: { companyId: company.id } });
  await prisma.medicationRecord.deleteMany({ where: { companyId: company.id } });
  await prisma.birdWeightRecord.deleteMany({ where: { companyId: company.id } });
  await prisma.eggProductionRecord.deleteMany({ where: { companyId: company.id } });
  await prisma.feedConsumptionRecord.deleteMany({ where: { companyId: company.id } });
  await prisma.mortalityRecord.deleteMany({ where: { companyId: company.id } });
  await prisma.dailyPoultryRecord.deleteMany({ where: { companyId: company.id } });
  await prisma.flockBatch.deleteMany({ where: { companyId: company.id } });

  const flockBatches = await Promise.all([
    prisma.flockBatch.create({
      data: {
        companyId: company.id,
        branchId: accraBranch.id,
        farmId: farms[0].id,
        poultryHouseId: poultryHouses[0].id,
        code: "LAYER-2026-001",
        name: "Layer Batch 2026 A",
        birdType: BirdType.LAYERS,
        openingBirdCount: 6000,
        startDate: metricDate(45),
        expectedCloseDate: metricDate(-430),
        createdById: superAdmin.id
      }
    }),
    prisma.flockBatch.create({
      data: {
        companyId: company.id,
        branchId: accraBranch.id,
        farmId: farms[1].id,
        poultryHouseId: poultryHouses[2].id,
        code: "BROILER-2026-001",
        name: "Broiler Batch 2026 A",
        birdType: BirdType.BROILERS,
        openingBirdCount: 8000,
        startDate: metricDate(28),
        expectedCloseDate: metricDate(-14),
        createdById: superAdmin.id
      }
    }),
    prisma.flockBatch.create({
      data: {
        companyId: company.id,
        branchId: kumasiBranch.id,
        farmId: farms[2].id,
        poultryHouseId: poultryHouses[3].id,
        code: "BREEDER-2026-001",
        name: "Breeder Batch 2026 A",
        birdType: BirdType.BREEDERS,
        openingBirdCount: 3000,
        startDate: metricDate(70),
        expectedCloseDate: metricDate(-520),
        createdById: superAdmin.id
      }
    })
  ]);

  const [layerBatch, broilerBatch, breederBatch] = flockBatches;
  const flockSeedBase = [
    { batch: layerBatch, farm: farms[0], house: poultryHouses[0], eggs: 4560, mortality: 5, feed: 1180, weight: 1.85 },
    { batch: broilerBatch, farm: farms[1], house: poultryHouses[2], eggs: 0, mortality: 14, feed: 2840, weight: 1.42 },
    { batch: breederBatch, farm: farms[2], house: poultryHouses[3], eggs: 1320, mortality: 3, feed: 720, weight: 2.15 }
  ];

  for (let day = 0; day < 14; day += 1) {
    for (const [index, item] of flockSeedBase.entries()) {
      const recordDate = metricDate(day);
      const mortalityCount = item.mortality + (day % 3);
      const culledCount = day % 6 === 0 ? index + 1 : 0;
      const totalEggs = item.eggs + (day % 4) * 38;
      await prisma.dailyPoultryRecord.create({
        data: {
          companyId: company.id,
          branchId: item.batch.branchId,
          farmId: item.farm.id,
          poultryHouseId: item.house.id,
          flockBatchId: item.batch.id,
          recordDate,
          openingBirdCount: item.batch.openingBirdCount,
          mortalityCount,
          culledCount,
          feedConsumedKg: item.feed + day * 12,
          totalEggs,
          notes: "Seeded daily poultry operating record",
          createdById: superAdmin.id
        }
      });
      await prisma.mortalityRecord.create({
        data: {
          companyId: company.id,
          branchId: item.batch.branchId,
          farmId: item.farm.id,
          poultryHouseId: item.house.id,
          flockBatchId: item.batch.id,
          recordDate,
          birdCount: mortalityCount,
          isCulling: false,
          reason: day % 5 === 0 ? "Heat stress" : "Natural mortality",
          createdById: superAdmin.id
        }
      });
      if (culledCount > 0) {
        await prisma.mortalityRecord.create({
          data: {
            companyId: company.id,
            branchId: item.batch.branchId,
            farmId: item.farm.id,
            poultryHouseId: item.house.id,
            flockBatchId: item.batch.id,
            recordDate,
            birdCount: culledCount,
            isCulling: true,
            reason: "Weak birds culled during inspection",
            createdById: superAdmin.id
          }
        });
      }
      await prisma.feedConsumptionRecord.create({
        data: {
          companyId: company.id,
          branchId: item.batch.branchId,
          farmId: item.farm.id,
          poultryHouseId: item.house.id,
          flockBatchId: item.batch.id,
          feedProductId: layerFeed.id,
          recordDate,
          quantityKg: item.feed + day * 12,
          costAmount: (item.feed + day * 12) * 4.2,
          createdById: superAdmin.id
        }
      });
      if (totalEggs > 0) {
        await prisma.eggProductionRecord.create({
          data: {
            companyId: company.id,
            branchId: item.batch.branchId,
            farmId: item.farm.id,
            poultryHouseId: item.house.id,
            flockBatchId: item.batch.id,
            recordDate,
            goodEggs: totalEggs - 130,
            crackedEggs: 42,
            dirtyEggs: 38,
            brokenEggs: 25,
            rejectedEggs: 25,
            createdById: superAdmin.id
          }
        });
      }
    }
  }

  await Promise.all([
    prisma.birdWeightRecord.create({
      data: {
        companyId: company.id,
        branchId: accraBranch.id,
        farmId: farms[1].id,
        poultryHouseId: poultryHouses[2].id,
        flockBatchId: broilerBatch.id,
        recordDate: metricDate(0),
        sampleSize: 100,
        averageWeightKg: 1.92,
        notes: "Weekly broiler sample weight",
        createdById: superAdmin.id
      }
    }),
    prisma.medicationRecord.create({
      data: {
        companyId: company.id,
        branchId: accraBranch.id,
        farmId: farms[0].id,
        poultryHouseId: poultryHouses[0].id,
        flockBatchId: layerBatch.id,
        medicationName: "Amprolium",
        dosage: "1g per litre",
        route: "Water",
        startDate: metricDate(3),
        endDate: metricDate(1),
        withdrawalUntil: metricDate(-5),
        notes: "Preventive coccidiosis treatment",
        createdById: superAdmin.id
      }
    }),
    prisma.vaccinationRecord.create({
      data: {
        companyId: company.id,
        branchId: accraBranch.id,
        farmId: farms[1].id,
        poultryHouseId: poultryHouses[2].id,
        flockBatchId: broilerBatch.id,
        vaccineName: "Newcastle Disease",
        dose: "Eye drop",
        vaccinationDate: metricDate(7),
        nextDueDate: metricDate(-14),
        notes: "Routine vaccination schedule",
        createdById: superAdmin.id
      }
    }),
    prisma.poultryHealthObservation.create({
      data: {
        companyId: company.id,
        branchId: accraBranch.id,
        farmId: farms[0].id,
        poultryHouseId: poultryHouses[0].id,
        flockBatchId: layerBatch.id,
        observationDate: metricDate(1),
        severity: "MEDIUM",
        observation: "Reduced feed intake in one pen; no respiratory signs.",
        vetVisitDate: metricDate(1),
        veterinarianName: "Dr. Ama Mensah",
        recommendation: "Monitor water lines and repeat inspection in 48 hours.",
        createdById: superAdmin.id
      }
    }),
    prisma.poultryTransferRecord.create({
      data: {
        companyId: company.id,
        branchId: accraBranch.id,
        flockBatchId: layerBatch.id,
        fromFarmId: farms[0].id,
        fromPoultryHouseId: poultryHouses[0].id,
        toFarmId: farms[0].id,
        toPoultryHouseId: poultryHouses[1].id,
        birdCount: 250,
        transferDate: metricDate(2),
        status: "COMPLETED",
        reason: "Stocking density balancing",
        approvedById: superAdmin.id,
        approvedAt: metricDate(2),
        createdById: superAdmin.id
      }
    }),
    prisma.poultryCostRecord.create({
      data: {
        companyId: company.id,
        branchId: accraBranch.id,
        farmId: farms[1].id,
        poultryHouseId: poultryHouses[2].id,
        flockBatchId: broilerBatch.id,
        costDate: metricDate(0),
        costType: PoultryCostType.FEED,
        amount: 11928,
        description: "Broiler finisher feed allocation",
        status: "APPROVED",
        approvedById: superAdmin.id,
        approvedAt: metricDate(0),
        createdById: superAdmin.id
      }
    })
  ]);

  const openingMovement = await prisma.stockMovement.findFirst({
    where: { companyId: company.id, referenceType: "SeedData", referenceId: maizeBatch.id, movementType: "OPENING_BALANCE" }
  });

  if (!openingMovement) {
    await prisma.stockMovement.create({
      data: {
        companyId: company.id,
        branchId: accraBranch.id,
        productId: maize.id,
        inventoryItemId: maizeInventory.id,
        stockBatchId: maizeBatch.id,
        toWarehouseId: warehouses[0].id,
        warehouseId: warehouses[0].id,
        uomId: kg.id,
        movementType: "OPENING_BALANCE",
        quantity: 5000,
        unitCost: 3.5,
        referenceType: "SeedData",
        referenceId: maizeBatch.id,
        notes: "Opening stock seeded for ERP core schema",
        createdById: superAdmin.id
      }
    });
  }

  await prisma.stockMovement.deleteMany({
    where: { companyId: company.id, referenceType: { in: ["InventorySeed", "StockTransfer", "StockAdjustment", "StockReservation"] } }
  });
  await prisma.stockApproval.deleteMany({ where: { companyId: company.id } });
  await prisma.stockReservation.deleteMany({ where: { companyId: company.id } });
  await prisma.inventoryValuation.deleteMany({ where: { companyId: company.id } });
  await prisma.stockExpiryAlert.deleteMany({ where: { companyId: company.id } });
  await prisma.stockReorderLevel.deleteMany({ where: { companyId: company.id } });
  await prisma.stockTransfer.deleteMany({ where: { companyId: company.id } });
  await prisma.stockAdjustment.deleteMany({ where: { companyId: company.id } });
  await prisma.warehouseLocation.deleteMany({ where: { companyId: company.id } });

  await Promise.all(
    warehouses.map((warehouse) =>
      prisma.warehouseLocation.upsert({
        where: { companyId_warehouseId_code: { companyId: company.id, warehouseId: warehouse.id, code: "A1" } },
        update: {},
        create: {
          companyId: company.id,
          branchId: warehouse.branchId,
          warehouseId: warehouse.id,
          productionSiteId: warehouse.productionSiteId,
          code: "A1",
          name: `${warehouse.name} Primary Bin`,
          barcode: `LOC-${warehouse.code}-A1`,
          createdById: superAdmin.id
        }
      })
    )
  );

  const inventorySeedProducts = [
    { product: eggs, warehouse: warehouses[1], quantity: 240, reorder: 60, batch: "EGG-OPEN-001", unitCost: 28 },
    { product: liveBirds, warehouse: warehouses[1], quantity: 1800, reorder: 500, batch: "BIRD-OPEN-001", unitCost: 42 },
    { product: dressedBirds, warehouse: warehouses[1], quantity: 640, reorder: 120, batch: "DRESSED-OPEN-001", unitCost: 58 },
    { product: manure, warehouse: warehouses[1], quantity: 3200, reorder: 900, batch: "MANURE-OPEN-001", unitCost: 0.45 },
    { product: medicine, warehouse: warehouses[0], quantity: 100, reorder: 25, batch: "MED-OPEN-001", unitCost: 95, expiryDays: 120 },
    { product: vaccine, warehouse: warehouses[0], quantity: 35, reorder: 20, batch: "VAC-EXP-001", unitCost: 180, expiryDays: 25 },
    { product: packagingBags, warehouse: warehouses[2], quantity: 490, reorder: 120, batch: "PKG-OPEN-001", unitCost: 1.8 },
    { product: sparePart, warehouse: warehouses[2], quantity: 12, reorder: 4, batch: "SPARE-OPEN-001", unitCost: 220 },
    { product: equipment, warehouse: warehouses[0], quantity: 3, reorder: 1, batch: "EQP-OPEN-001", unitCost: 1450 },
    { product: farmSupply, warehouse: warehouses[1], quantity: 2600, reorder: 800, batch: "SUP-OPEN-001", unitCost: 1.2 }
  ];

  const inventorySeedItems = [];
  for (const row of inventorySeedProducts) {
    const item = await prisma.inventoryItem.upsert({
      where: { companyId_warehouseId_productId: { companyId: company.id, warehouseId: row.warehouse.id, productId: row.product.id } },
      update: { quantityOnHand: row.quantity, reorderLevel: row.reorder },
      create: {
        companyId: company.id,
        branchId: row.warehouse.branchId,
        farmId: row.warehouse.farmId,
        warehouseId: row.warehouse.id,
        productionSiteId: row.warehouse.productionSiteId,
        productId: row.product.id,
        uomId: row.product.uomId,
        reorderLevel: row.reorder,
        quantityOnHand: row.quantity,
        createdById: superAdmin.id
      }
    });
    inventorySeedItems.push({ ...row, item });

    const expiryDate = row.expiryDays ? new Date(Date.now() + row.expiryDays * 86400000) : undefined;
    const batch = await prisma.stockBatch.upsert({
      where: { companyId_batchNumber_productId: { companyId: company.id, batchNumber: row.batch, productId: row.product.id } },
      update: { quantityReceived: row.quantity, quantityRemaining: row.quantity, unitCost: row.unitCost, expiryDate },
      create: {
        companyId: company.id,
        branchId: row.warehouse.branchId,
        farmId: row.warehouse.farmId,
        warehouseId: row.warehouse.id,
        productionSiteId: row.warehouse.productionSiteId,
        productId: row.product.id,
        inventoryItemId: item.id,
        uomId: row.product.uomId,
        batchNumber: row.batch,
        quantityReceived: row.quantity,
        quantityRemaining: row.quantity,
        unitCost: row.unitCost,
        expiryDate,
        createdById: superAdmin.id
      }
    });

    await prisma.stockReorderLevel.upsert({
      where: { companyId_warehouseId_productId: { companyId: company.id, warehouseId: row.warehouse.id, productId: row.product.id } },
      update: { minimumQuantity: row.reorder, reorderQuantity: row.reorder * 2 },
      create: {
        companyId: company.id,
        branchId: row.warehouse.branchId,
        warehouseId: row.warehouse.id,
        productionSiteId: row.warehouse.productionSiteId,
        inventoryItemId: item.id,
        productId: row.product.id,
        minimumQuantity: row.reorder,
        reorderQuantity: row.reorder * 2,
        createdById: superAdmin.id
      }
    });

    await prisma.inventoryValuation.create({
      data: {
        companyId: company.id,
        branchId: row.warehouse.branchId,
        warehouseId: row.warehouse.id,
        productionSiteId: row.warehouse.productionSiteId,
        inventoryItemId: item.id,
        productId: row.product.id,
        quantityOnHand: row.quantity,
        unitCost: row.unitCost,
        totalValue: row.quantity * row.unitCost,
        method: "FIFO"
      }
    });

    if (expiryDate) {
      await prisma.stockExpiryAlert.upsert({
        where: { companyId_stockBatchId: { companyId: company.id, stockBatchId: batch.id } },
        update: { expiryDate, daysToExpiry: row.expiryDays!, status: "ACTIVE" },
        create: {
          companyId: company.id,
          branchId: row.warehouse.branchId,
          warehouseId: row.warehouse.id,
          productionSiteId: row.warehouse.productionSiteId,
          inventoryItemId: item.id,
          stockBatchId: batch.id,
          productId: row.product.id,
          expiryDate,
          daysToExpiry: row.expiryDays!
        }
      });
    }
  }

  const medicineDestination = await prisma.inventoryItem.upsert({
    where: { companyId_warehouseId_productId: { companyId: company.id, warehouseId: warehouses[1].id, productId: medicine.id } },
    update: { quantityOnHand: 20, reorderLevel: 10 },
    create: {
      companyId: company.id,
      branchId: warehouses[1].branchId,
      farmId: warehouses[1].farmId,
      warehouseId: warehouses[1].id,
      productId: medicine.id,
      uomId: medicine.uomId,
      quantityOnHand: 20,
      reorderLevel: 10,
      createdById: superAdmin.id
    }
  });
  const medicineSource = inventorySeedItems.find((item) => item.product.id === medicine.id)!;
  await prisma.inventoryItem.update({ where: { id: medicineSource.item.id }, data: { quantityOnHand: 100 } });
  await prisma.stockBatch.update({ where: { companyId_batchNumber_productId: { companyId: company.id, batchNumber: "MED-OPEN-001", productId: medicine.id } }, data: { quantityReceived: 120, quantityRemaining: 100 } });
  const medicineTransfer = await prisma.stockTransfer.create({
    data: {
      companyId: company.id,
      branchId: accraBranch.id,
      productId: medicine.id,
      transferNumber: "STR-2026-0001",
      fromWarehouseId: warehouses[0].id,
      toWarehouseId: warehouses[1].id,
      quantity: 20,
      unitCost: 95,
      barcode: "TRF-MED-2026-0001",
      status: "COMPLETED",
      requestedById: superAdmin.id,
      approvedById: superAdmin.id,
      approvedAt: metricDate(0),
      createdById: superAdmin.id
    }
  });
  await prisma.stockMovement.createMany({
    data: [
      {
        companyId: company.id,
        branchId: accraBranch.id,
        productId: medicine.id,
        inventoryItemId: medicineSource.item.id,
        fromWarehouseId: warehouses[0].id,
        warehouseId: warehouses[0].id,
        uomId: medicine.uomId,
        movementType: "TRANSFER",
        quantity: 20,
        unitCost: 95,
        referenceType: "StockTransfer",
        referenceId: medicineTransfer.id,
        notes: "Medicine transfer to layer farm store",
        createdById: superAdmin.id
      },
      {
        companyId: company.id,
        branchId: accraBranch.id,
        productId: medicine.id,
        inventoryItemId: medicineDestination.id,
        toWarehouseId: warehouses[1].id,
        warehouseId: warehouses[1].id,
        farmId: farms[0].id,
        uomId: medicine.uomId,
        movementType: "TRANSFER",
        quantity: 20,
        unitCost: 95,
        referenceType: "StockTransfer",
        referenceId: medicineTransfer.id,
        notes: "Medicine received in layer farm store",
        createdById: superAdmin.id
      }
    ]
  });

  const packagingItem = inventorySeedItems.find((item) => item.product.id === packagingBags.id)!;
  const packagingAdjustment = await prisma.stockAdjustment.create({
    data: {
      companyId: company.id,
      branchId: packagingItem.warehouse.branchId,
      warehouseId: packagingItem.warehouse.id,
      productionSiteId: packagingItem.warehouse.productionSiteId,
      inventoryItemId: packagingItem.item.id,
      productId: packagingBags.id,
      adjustmentNumber: "ADJ-2026-0001",
      adjustmentType: "DAMAGE",
      quantity: -10,
      unitCost: 1.8,
      reason: "Damaged feed bags found during stock count",
      status: "APPROVED",
      requestedById: superAdmin.id,
      approvedById: superAdmin.id,
      approvedAt: metricDate(0),
      createdById: superAdmin.id
    }
  });
  await prisma.stockApproval.create({
    data: {
      companyId: company.id,
      branchId: packagingItem.warehouse.branchId,
      approvalNumber: "SAP-2026-0001",
      entityType: "StockAdjustment",
      entityId: packagingAdjustment.id,
      status: "APPROVED",
      requestedById: superAdmin.id,
      approvedById: superAdmin.id,
      approvedAt: metricDate(0),
      notes: "Approved seed damaged stock adjustment"
    }
  });
  await prisma.stockBatch.update({ where: { companyId_batchNumber_productId: { companyId: company.id, batchNumber: "PKG-OPEN-001", productId: packagingBags.id } }, data: { quantityReceived: 500, quantityRemaining: 490 } });
  await prisma.stockMovement.create({
    data: {
      companyId: company.id,
      branchId: packagingItem.warehouse.branchId,
      productId: packagingBags.id,
      inventoryItemId: packagingItem.item.id,
      fromWarehouseId: packagingItem.warehouse.id,
      warehouseId: packagingItem.warehouse.id,
      productionSiteId: packagingItem.warehouse.productionSiteId,
      uomId: packagingBags.uomId,
      movementType: "WASTE",
      quantity: 10,
      unitCost: 1.8,
      referenceType: "StockAdjustment",
      referenceId: packagingAdjustment.id,
      notes: "Damaged packaging bags written off",
      createdById: superAdmin.id
    }
  });

  const layerFeedInventory = await prisma.inventoryItem.findFirstOrThrow({ where: { companyId: company.id, warehouseId: warehouses[2].id, productId: layerFeed.id } });
  await prisma.stockReservation.create({
    data: {
      companyId: company.id,
      branchId: accraBranch.id,
      warehouseId: warehouses[2].id,
      productionSiteId: productionSites[0].id,
      inventoryItemId: layerFeedInventory.id,
      productId: layerFeed.id,
      reservationNumber: "RSV-2026-0001",
      quantity: 50,
      requestedById: superAdmin.id,
      purpose: "Reserved for Layer House A feed issue",
      expiresAt: new Date(Date.now() + 7 * 86400000),
      createdById: superAdmin.id
    }
  });

  await prisma.stockMovement.deleteMany({
    where: { companyId: company.id, referenceType: { in: ["SalesOrder", "SalesReturn"] } }
  });
  await prisma.customerStatement.deleteMany({ where: { companyId: company.id } });
  await prisma.deliveryNote.deleteMany({ where: { companyId: company.id } });
  await prisma.salesCommission.deleteMany({ where: { companyId: company.id } });
  await prisma.receipt.deleteMany({ where: { companyId: company.id } });
  await prisma.payment.deleteMany({ where: { companyId: company.id } });
  await prisma.salesReturn.deleteMany({ where: { companyId: company.id } });
  await prisma.invoice.deleteMany({ where: { companyId: company.id } });
  await prisma.salesOrderItem.deleteMany({ where: { companyId: company.id } });
  await prisma.salesOrder.deleteMany({ where: { companyId: company.id } });
  await prisma.priceList.deleteMany({ where: { companyId: company.id } });
  await prisma.customerCreditLimit.deleteMany({ where: { companyId: company.id } });
  await prisma.customer.deleteMany({ where: { companyId: company.id } });
  await prisma.customerGroup.deleteMany({ where: { companyId: company.id } });

  const salesOfficer = (await prisma.user.findFirst({ where: { companyId: company.id, email: "sales.officer@jokas.local" } })) ?? superAdmin;
  const accountant = (await prisma.user.findFirst({ where: { companyId: company.id, email: "accountant@jokas.local" } })) ?? superAdmin;
  const storekeeper = (await prisma.user.findFirst({ where: { companyId: company.id, email: "storekeeper@jokas.local" } })) ?? superAdmin;

  const [retailGroup, wholesaleGroup, feedDealerGroup] = await Promise.all([
    prisma.customerGroup.create({
      data: {
        companyId: company.id,
        branchId: accraBranch.id,
        code: "RETAIL",
        name: "Retail Customers",
        description: "Walk-in and small recurring customers",
        createdById: superAdmin.id
      }
    }),
    prisma.customerGroup.create({
      data: {
        companyId: company.id,
        branchId: accraBranch.id,
        code: "WHOLESALE",
        name: "Wholesale Buyers",
        description: "Bulk egg, bird, and soya buyers",
        createdById: superAdmin.id
      }
    }),
    prisma.customerGroup.create({
      data: {
        companyId: company.id,
        branchId: accraBranch.id,
        code: "FEED-DEALER",
        name: "Feed Dealers",
        description: "External finished feed distributors",
        createdById: superAdmin.id
      }
    })
  ]);

  const [marketCustomer, hotelCustomer, dealerCustomer] = await Promise.all([
    prisma.customer.create({
      data: {
        companyId: company.id,
        branchId: accraBranch.id,
        customerGroupId: wholesaleGroup.id,
        code: "CUST-ADENTA-001",
        name: "Adenta Market Egg Traders",
        phone: "+233240000101",
        email: "orders@adenta-eggs.example",
        address: "Adenta Market, Accra",
        createdById: salesOfficer.id
      }
    }),
    prisma.customer.create({
      data: {
        companyId: company.id,
        branchId: accraBranch.id,
        customerGroupId: retailGroup.id,
        code: "CUST-HOTEL-001",
        name: "Golden Spoon Hotel",
        phone: "+233240000202",
        email: "procurement@goldenspoon.example",
        address: "Airport Residential Area, Accra",
        createdById: salesOfficer.id
      }
    }),
    prisma.customer.create({
      data: {
        companyId: company.id,
        branchId: accraBranch.id,
        customerGroupId: feedDealerGroup.id,
        code: "CUST-FEED-001",
        name: "Eastern Feed Dealer",
        phone: "+233240000303",
        email: "sales@easternfeed.example",
        address: "Koforidua",
        createdById: salesOfficer.id
      }
    })
  ]);

  await Promise.all([
    prisma.customerCreditLimit.create({
      data: {
        companyId: company.id,
        branchId: accraBranch.id,
        customerId: marketCustomer.id,
        creditLimit: 25000,
        currentBalance: 3240,
        approvedById: superAdmin.id,
        approvedAt: metricDate(5),
        createdById: superAdmin.id
      }
    }),
    prisma.customerCreditLimit.create({
      data: {
        companyId: company.id,
        branchId: accraBranch.id,
        customerId: hotelCustomer.id,
        creditLimit: 12000,
        currentBalance: 0,
        approvedById: superAdmin.id,
        approvedAt: metricDate(5),
        createdById: superAdmin.id
      }
    }),
    prisma.customerCreditLimit.create({
      data: {
        companyId: company.id,
        branchId: accraBranch.id,
        customerId: dealerCustomer.id,
        creditLimit: 18000,
        currentBalance: 0,
        approvedById: superAdmin.id,
        approvedAt: metricDate(5),
        createdById: superAdmin.id
      }
    })
  ]);

  await prisma.priceList.createMany({
    data: [
      { companyId: company.id, branchId: accraBranch.id, customerGroupId: wholesaleGroup.id, productId: eggs.id, name: "Wholesale egg tray", unitPrice: 34, validFrom: metricDate(30), createdById: superAdmin.id },
      { companyId: company.id, branchId: accraBranch.id, customerGroupId: wholesaleGroup.id, productId: liveBirds.id, name: "Wholesale live birds per kg", unitPrice: 62, validFrom: metricDate(30), createdById: superAdmin.id },
      { companyId: company.id, branchId: accraBranch.id, customerGroupId: retailGroup.id, productId: dressedBirds.id, name: "Retail dressed birds per kg", unitPrice: 78, validFrom: metricDate(30), createdById: superAdmin.id },
      { companyId: company.id, branchId: accraBranch.id, customerGroupId: retailGroup.id, productId: manure.id, name: "Poultry manure per kg", unitPrice: 1.1, validFrom: metricDate(30), createdById: superAdmin.id },
      { companyId: company.id, branchId: accraBranch.id, customerGroupId: feedDealerGroup.id, productId: layerFeed.id, name: "Dealer layer feed bag", unitPrice: 165, validFrom: metricDate(30), createdById: superAdmin.id },
      { companyId: company.id, branchId: kumasiBranch.id, customerGroupId: wholesaleGroup.id, productId: soyaOil.id, name: "Wholesale soya oil litre", unitPrice: 22, validFrom: metricDate(30), createdById: superAdmin.id },
      { companyId: company.id, branchId: kumasiBranch.id, customerGroupId: wholesaleGroup.id, productId: soyaCake.id, name: "Wholesale soya cake kg", unitPrice: 7.1, validFrom: metricDate(30), createdById: superAdmin.id }
    ]
  });

  const saleSubtotal = 10160;
  const saleDiscount = 250;
  const saleTotal = saleSubtotal - saleDiscount;
  const salesOrder = await prisma.salesOrder.create({
    data: {
      companyId: company.id,
      branchId: accraBranch.id,
      customerId: marketCustomer.id,
      warehouseId: warehouses[1].id,
      orderNumber: "SO-2026-0001",
      orderDate: metricDate(1),
      status: "FULFILLED",
      subtotal: saleSubtotal,
      discountAmount: saleDiscount,
      totalAmount: saleTotal,
      paidAmount: 6500,
      balanceDue: 3240,
      salespersonId: salesOfficer.id,
      stockApprovedById: storekeeper.id,
      stockApprovedAt: metricDate(1),
      notes: "Wholesale eggs and live bird dispatch",
      createdById: salesOfficer.id,
      items: {
        create: [
          { companyId: company.id, productId: eggs.id, quantity: 80, unitPrice: 34, lineTotal: 2720 },
          { companyId: company.id, productId: liveBirds.id, quantity: 120, unitPrice: 62, discountAmount: 250, lineTotal: 7440 }
        ]
      }
    }
  });

  const eggsSeed = inventorySeedItems.find((item) => item.product.id === eggs.id)!;
  const liveBirdsSeed = inventorySeedItems.find((item) => item.product.id === liveBirds.id)!;
  const eggsSold = 80;
  const liveBirdsSold = 120;
  const eggsReturned = 5;

  await Promise.all([
    prisma.inventoryItem.update({ where: { id: eggsSeed.item.id }, data: { quantityOnHand: { decrement: eggsSold - eggsReturned } } }),
    prisma.inventoryItem.update({ where: { id: liveBirdsSeed.item.id }, data: { quantityOnHand: { decrement: liveBirdsSold } } }),
    prisma.stockBatch.update({ where: { companyId_batchNumber_productId: { companyId: company.id, batchNumber: "EGG-OPEN-001", productId: eggs.id } }, data: { quantityRemaining: 240 - eggsSold + eggsReturned } }),
    prisma.stockBatch.update({ where: { companyId_batchNumber_productId: { companyId: company.id, batchNumber: "BIRD-OPEN-001", productId: liveBirds.id } }, data: { quantityRemaining: 1800 - liveBirdsSold } })
  ]);

  await prisma.stockMovement.createMany({
    data: [
      {
        companyId: company.id,
        branchId: accraBranch.id,
        productId: eggs.id,
        inventoryItemId: eggsSeed.item.id,
        fromWarehouseId: warehouses[1].id,
        warehouseId: warehouses[1].id,
        farmId: warehouses[1].farmId,
        uomId: eggs.uomId,
        movementType: "SALE_DISPATCH",
        quantity: eggsSold,
        unitCost: 28,
        referenceType: "SalesOrder",
        referenceId: salesOrder.id,
        notes: "Sales dispatch for SO-2026-0001",
        createdById: storekeeper.id
      },
      {
        companyId: company.id,
        branchId: accraBranch.id,
        productId: liveBirds.id,
        inventoryItemId: liveBirdsSeed.item.id,
        fromWarehouseId: warehouses[1].id,
        warehouseId: warehouses[1].id,
        farmId: warehouses[1].farmId,
        uomId: liveBirds.uomId,
        movementType: "SALE_DISPATCH",
        quantity: liveBirdsSold,
        unitCost: 42,
        referenceType: "SalesOrder",
        referenceId: salesOrder.id,
        notes: "Sales dispatch for SO-2026-0001",
        createdById: storekeeper.id
      }
    ]
  });

  const invoice = await prisma.invoice.create({
    data: {
      companyId: company.id,
      branchId: accraBranch.id,
      customerId: marketCustomer.id,
      salesOrderId: salesOrder.id,
      invoiceNumber: "INV-2026-0001",
      invoiceDate: metricDate(1),
      dueDate: metricDate(-13),
      status: "PARTIALLY_PAID",
      subtotal: saleSubtotal,
      discountAmount: saleDiscount,
      totalAmount: saleTotal,
      paidAmount: 6500,
      balanceDue: 3240,
      createdById: salesOfficer.id
    }
  });

  const payment = await prisma.payment.create({
    data: {
      companyId: company.id,
      branchId: accraBranch.id,
      customerId: marketCustomer.id,
      invoiceId: invoice.id,
      paymentNumber: "PAY-2026-0001",
      paymentDate: metricDate(0),
      amount: 6500,
      method: "BANK_TRANSFER",
      status: "POSTED",
      reference: "BANK-TRF-88921",
      receivedById: accountant.id,
      createdById: accountant.id
    }
  });

  await prisma.receipt.create({
    data: {
      companyId: company.id,
      branchId: accraBranch.id,
      customerId: marketCustomer.id,
      invoiceId: invoice.id,
      paymentId: payment.id,
      receiptNumber: "RCT-2026-0001",
      receiptDate: metricDate(0),
      amount: 6500,
      issuedById: accountant.id,
      createdById: accountant.id
    }
  });

  await prisma.deliveryNote.create({
    data: {
      companyId: company.id,
      branchId: accraBranch.id,
      salesOrderId: salesOrder.id,
      warehouseId: warehouses[1].id,
      deliveryNumber: "DN-2026-0001",
      deliveryDate: metricDate(1),
      status: "DELIVERED",
      releasedById: storekeeper.id,
      deliveredAt: metricDate(0),
      recipientName: "Adenta Market Egg Traders",
      notes: "Delivered by farm dispatch truck",
      createdById: storekeeper.id
    }
  });

  await prisma.salesCommission.create({
    data: {
      companyId: company.id,
      branchId: accraBranch.id,
      salesOrderId: salesOrder.id,
      salespersonId: salesOfficer.id,
      commissionRate: 2,
      commissionAmount: 198.2,
      createdById: superAdmin.id
    }
  });

  const salesReturn = await prisma.salesReturn.create({
    data: {
      companyId: company.id,
      branchId: accraBranch.id,
      customerId: marketCustomer.id,
      salesOrderId: salesOrder.id,
      productId: eggs.id,
      warehouseId: warehouses[1].id,
      quantity: eggsReturned,
      unitPrice: 34,
      totalAmount: 170,
      reason: "Cracked trays returned during delivery inspection",
      status: "POSTED",
      approvedById: storekeeper.id,
      approvedAt: metricDate(0),
      createdById: salesOfficer.id
    }
  });

  await prisma.stockMovement.create({
    data: {
      companyId: company.id,
      branchId: accraBranch.id,
      productId: eggs.id,
      inventoryItemId: eggsSeed.item.id,
      toWarehouseId: warehouses[1].id,
      warehouseId: warehouses[1].id,
      farmId: warehouses[1].farmId,
      uomId: eggs.uomId,
      movementType: "RETURN_IN",
      quantity: eggsReturned,
      unitCost: 28,
      referenceType: "SalesReturn",
      referenceId: salesReturn.id,
      notes: "Customer return for SO-2026-0001",
      createdById: storekeeper.id
    }
  });

  await prisma.customerStatement.createMany({
    data: [
      {
        companyId: company.id,
        branchId: accraBranch.id,
        customerId: marketCustomer.id,
        invoiceId: invoice.id,
        entryDate: metricDate(1),
        entryType: "INVOICE",
        debit: saleTotal,
        credit: 0,
        balance: saleTotal,
        description: "Invoice INV-2026-0001"
      },
      {
        companyId: company.id,
        branchId: accraBranch.id,
        customerId: marketCustomer.id,
        paymentId: payment.id,
        entryDate: metricDate(0),
        entryType: "PAYMENT",
        debit: 0,
        credit: 6500,
        balance: 3410,
        description: "Payment PAY-2026-0001"
      },
      {
        companyId: company.id,
        branchId: accraBranch.id,
        customerId: marketCustomer.id,
        salesReturnId: salesReturn.id,
        entryDate: metricDate(0),
        entryType: "RETURN",
        debit: 0,
        credit: 170,
        balance: 3240,
        description: "Return credit for cracked egg trays"
      }
    ]
  });

  await prisma.auditLog.createMany({
    data: [
      { companyId: company.id, branchId: accraBranch.id, actorUserId: salesOfficer.id, action: "CREATE", entityType: "SalesOrder", entityId: salesOrder.id, summary: "Created seed sales order SO-2026-0001" },
      { companyId: company.id, branchId: accraBranch.id, warehouseId: warehouses[1].id, actorUserId: storekeeper.id, action: "APPROVE", entityType: "SalesOrder", entityId: salesOrder.id, summary: "Approved stock release for SO-2026-0001" },
      { companyId: company.id, branchId: accraBranch.id, actorUserId: accountant.id, action: "CREATE", entityType: "Payment", entityId: payment.id, summary: "Recorded payment PAY-2026-0001" },
      { companyId: company.id, branchId: accraBranch.id, warehouseId: warehouses[1].id, actorUserId: salesOfficer.id, action: "CREATE", entityType: "SalesReturn", entityId: salesReturn.id, summary: "Recorded sales return for SO-2026-0001" }
    ]
  });

  await prisma.stockMovement.deleteMany({
    where: { companyId: company.id, referenceType: { in: ["SparePartUsage"] } }
  });
  await prisma.maintenanceCost.deleteMany({ where: { companyId: company.id } });
  await prisma.machineDowntimeRecord.deleteMany({ where: { companyId: company.id } });
  await prisma.technicianAssignment.deleteMany({ where: { companyId: company.id } });
  await prisma.sparePartUsage.deleteMany({ where: { companyId: company.id } });
  await prisma.breakdownRecord.deleteMany({ where: { companyId: company.id } });
  await prisma.maintenanceRecord.deleteMany({ where: { companyId: company.id } });
  await prisma.maintenanceSchedule.deleteMany({ where: { companyId: company.id } });
  await prisma.equipment.deleteMany({ where: { companyId: company.id } });
  await prisma.machine.deleteMany({ where: { companyId: company.id } });

  const maintenanceOfficer = (await prisma.user.findFirst({ where: { companyId: company.id, email: "maintenance.officer@jokas.local" } })) ?? superAdmin;
  const feedMillManager = (await prisma.user.findFirst({ where: { companyId: company.id, email: "feed.mill.manager@jokas.local" } })) ?? superAdmin;

  const [feedMixer, grinder, pelletizer, soyaExpeller, generator, deliveryVehicle, poultryFeeder] = await Promise.all([
    prisma.machine.create({
      data: {
        companyId: company.id,
        branchId: accraBranch.id,
        productionSiteId: productionSites[0].id,
        warehouseId: warehouses[2].id,
        code: "MCH-FEED-MIX-001",
        name: "Feed Mixer 2 Ton",
        machineType: "FEED_MIXER",
        manufacturer: "AgroMix",
        serialNumber: "FMX-2000-001",
        capacity: "2 tons per batch",
        location: "Feed mill mixing bay",
        createdById: maintenanceOfficer.id
      }
    }),
    prisma.machine.create({
      data: {
        companyId: company.id,
        branchId: accraBranch.id,
        productionSiteId: productionSites[0].id,
        warehouseId: warehouses[2].id,
        code: "MCH-GRINDER-001",
        name: "Hammer Grinder",
        machineType: "GRINDER",
        manufacturer: "MillPro",
        serialNumber: "GRD-450-221",
        capacity: "1.5 tons per hour",
        location: "Feed mill raw material area",
        createdById: maintenanceOfficer.id
      }
    }),
    prisma.machine.create({
      data: {
        companyId: company.id,
        branchId: accraBranch.id,
        productionSiteId: productionSites[0].id,
        warehouseId: warehouses[2].id,
        code: "MCH-PELLET-001",
        name: "Pelletizer Line",
        machineType: "PELLETIZER",
        status: "UNDER_MAINTENANCE",
        manufacturer: "PelletTech",
        serialNumber: "PLT-900-808",
        capacity: "900 kg per hour",
        location: "Feed mill pelleting bay",
        createdById: maintenanceOfficer.id
      }
    }),
    prisma.machine.create({
      data: {
        companyId: company.id,
        branchId: kumasiBranch.id,
        productionSiteId: productionSites[1].id,
        warehouseId: warehouses[3].id,
        code: "MCH-SOYA-EXP-001",
        name: "Soya Expeller",
        machineType: "SOYA_EXPELLER",
        manufacturer: "OilPress",
        serialNumber: "EXP-1100-013",
        capacity: "1.1 tons per hour",
        location: "Soya processing press room",
        createdById: maintenanceOfficer.id
      }
    }),
    prisma.machine.create({
      data: {
        companyId: company.id,
        branchId: accraBranch.id,
        warehouseId: warehouses[0].id,
        code: "MCH-GEN-001",
        name: "Main Generator",
        machineType: "GENERATOR",
        manufacturer: "PowerSet",
        serialNumber: "GEN-500KVA-01",
        capacity: "500 KVA",
        location: "Main utilities yard",
        createdById: maintenanceOfficer.id
      }
    }),
    prisma.machine.create({
      data: {
        companyId: company.id,
        branchId: accraBranch.id,
        warehouseId: warehouses[0].id,
        code: "MCH-TRUCK-001",
        name: "Delivery Truck",
        machineType: "DELIVERY_VEHICLE",
        manufacturer: "Isuzu",
        serialNumber: "TRK-JK-001",
        capacity: "5 tons",
        location: "Dispatch yard",
        createdById: maintenanceOfficer.id
      }
    }),
    prisma.machine.create({
      data: {
        companyId: company.id,
        branchId: accraBranch.id,
        farmId: farms[0].id,
        warehouseId: warehouses[1].id,
        code: "MCH-POULTRY-FEEDER-001",
        name: "Layer House Automatic Feeder",
        machineType: "POULTRY_EQUIPMENT",
        manufacturer: "PoultryLine",
        serialNumber: "PFEED-3340",
        capacity: "6,000 birds",
        location: "Layer House A",
        createdById: maintenanceOfficer.id
      }
    })
  ]);

  const [weighingScale, oilFilter, packagingMachine] = await Promise.all([
    prisma.equipment.create({
      data: {
        companyId: company.id,
        branchId: accraBranch.id,
        warehouseId: warehouses[0].id,
        code: "EQ-WEIGH-001",
        name: "Digital Weighing Scale",
        equipmentType: "WAREHOUSE_EQUIPMENT",
        manufacturer: "ScaleRight",
        serialNumber: "SCL-001",
        location: "Main warehouse receiving area",
        createdById: maintenanceOfficer.id
      }
    }),
    prisma.equipment.create({
      data: {
        companyId: company.id,
        branchId: kumasiBranch.id,
        productionSiteId: productionSites[1].id,
        warehouseId: warehouses[3].id,
        machineId: soyaExpeller.id,
        code: "EQ-OIL-FILTER-001",
        name: "Soya Oil Filter",
        equipmentType: "PROCESSING_EQUIPMENT",
        manufacturer: "OilPress",
        serialNumber: "FLT-993",
        location: "Soya oil filtration area",
        createdById: maintenanceOfficer.id
      }
    }),
    prisma.equipment.create({
      data: {
        companyId: company.id,
        branchId: accraBranch.id,
        productionSiteId: productionSites[0].id,
        warehouseId: warehouses[2].id,
        code: "EQ-PACK-001",
        name: "Feed Packaging Machine",
        equipmentType: "PROCESSING_EQUIPMENT",
        manufacturer: "PackPro",
        serialNumber: "PKG-2026-01",
        location: "Feed packaging bay",
        createdById: maintenanceOfficer.id
      }
    })
  ]);

  const mixerSchedule = await prisma.maintenanceSchedule.create({
    data: {
      companyId: company.id,
      branchId: accraBranch.id,
      warehouseId: warehouses[2].id,
      productionSiteId: productionSites[0].id,
      machineId: feedMixer.id,
      scheduleNumber: "MS-2026-0001",
      title: "Feed mixer bearing inspection",
      maintenanceType: "PREVENTIVE",
      priority: "HIGH",
      frequencyDays: 14,
      lastCompletedAt: metricDate(8),
      nextDueDate: metricDate(-6),
      status: "SCHEDULED",
      instructions: "Inspect bearings, gearbox oil, and shaft alignment.",
      createdById: maintenanceOfficer.id
    }
  });

  const generatorSchedule = await prisma.maintenanceSchedule.create({
    data: {
      companyId: company.id,
      branchId: accraBranch.id,
      warehouseId: warehouses[0].id,
      machineId: generator.id,
      scheduleNumber: "MS-2026-0002",
      title: "Generator service",
      maintenanceType: "PREVENTIVE",
      priority: "CRITICAL",
      frequencyDays: 30,
      nextDueDate: metricDate(2),
      status: "SCHEDULED",
      instructions: "Oil, coolant, fuel filter, and load test.",
      createdById: maintenanceOfficer.id
    }
  });

  const mixerRecord = await prisma.maintenanceRecord.create({
    data: {
      companyId: company.id,
      branchId: accraBranch.id,
      warehouseId: warehouses[2].id,
      productionSiteId: productionSites[0].id,
      scheduleId: mixerSchedule.id,
      machineId: feedMixer.id,
      recordNumber: "MR-2026-0001",
      maintenanceDate: metricDate(1),
      maintenanceType: "PREVENTIVE",
      status: "COMPLETED",
      completedById: maintenanceOfficer.id,
      description: "Mixer bearing inspection and lubrication",
      findings: "Minor belt wear observed; replacement belt issued.",
      nextDueDate: metricDate(-13),
      createdById: maintenanceOfficer.id
    }
  });

  const pelletBreakdown = await prisma.breakdownRecord.create({
    data: {
      companyId: company.id,
      branchId: accraBranch.id,
      warehouseId: warehouses[2].id,
      productionSiteId: productionSites[0].id,
      machineId: pelletizer.id,
      breakdownNumber: "BD-2026-0001",
      reportedAt: metricDate(0),
      severity: "HIGH",
      status: "IN_REPAIR",
      description: "Pelletizer drive belt slipping under load.",
      rootCause: "Worn drive belt and pulley misalignment.",
      reportedById: feedMillManager.id,
      createdById: feedMillManager.id
    }
  });

  const downtimeStart = metricDate(0);
  downtimeStart.setHours(8, 0, 0, 0);
  const downtimeEnd = metricDate(0);
  downtimeEnd.setHours(12, 30, 0, 0);
  await prisma.machineDowntimeRecord.create({
    data: {
      companyId: company.id,
      branchId: accraBranch.id,
      warehouseId: warehouses[2].id,
      productionSiteId: productionSites[0].id,
      machineId: pelletizer.id,
      breakdownRecordId: pelletBreakdown.id,
      startAt: downtimeStart,
      endAt: downtimeEnd,
      durationHours: 4.5,
      reason: "Pelletizer belt replacement and alignment",
      status: "CLOSED",
      createdById: maintenanceOfficer.id
    }
  });

  const spareItem = inventorySeedItems.find((item) => item.product.id === sparePart.id)!;
  await prisma.inventoryItem.update({ where: { id: spareItem.item.id }, data: { quantityOnHand: { decrement: 1 } } });
  await prisma.stockBatch.update({ where: { companyId_batchNumber_productId: { companyId: company.id, batchNumber: "SPARE-OPEN-001", productId: sparePart.id } }, data: { quantityRemaining: { decrement: 1 } } });
  const spareUsage = await prisma.sparePartUsage.create({
    data: {
      companyId: company.id,
      branchId: accraBranch.id,
      warehouseId: warehouses[2].id,
      machineId: pelletizer.id,
      maintenanceRecordId: mixerRecord.id,
      breakdownRecordId: pelletBreakdown.id,
      productId: sparePart.id,
      quantity: 1,
      unitCost: 220,
      totalCost: 220,
      issuedById: storekeeper.id,
      usedAt: metricDate(0),
      notes: "Pelletizer drive belt issued from feed mill store",
      createdById: storekeeper.id
    }
  });
  await prisma.stockMovement.create({
    data: {
      companyId: company.id,
      branchId: accraBranch.id,
      productId: sparePart.id,
      inventoryItemId: spareItem.item.id,
      fromWarehouseId: warehouses[2].id,
      warehouseId: warehouses[2].id,
      productionSiteId: productionSites[0].id,
      uomId: sparePart.uomId,
      movementType: "ADJUSTMENT_OUT",
      quantity: 1,
      unitCost: 220,
      referenceType: "SparePartUsage",
      referenceId: spareUsage.id,
      notes: "Spare part issued for pelletizer repair",
      createdById: storekeeper.id
    }
  });

  await prisma.technicianAssignment.createMany({
    data: [
      {
        companyId: company.id,
        branchId: accraBranch.id,
        machineId: pelletizer.id,
        breakdownRecordId: pelletBreakdown.id,
        technicianId: maintenanceOfficer.id,
        assignedAt: metricDate(0),
        dueDate: metricDate(-1),
        status: "IN_PROGRESS",
        notes: "Replace drive belt and check pulley alignment",
        createdById: maintenanceOfficer.id
      },
      {
        companyId: company.id,
        branchId: accraBranch.id,
        machineId: generator.id,
        scheduleId: generatorSchedule.id,
        technicianId: maintenanceOfficer.id,
        assignedAt: metricDate(0),
        dueDate: metricDate(2),
        status: "ASSIGNED",
        notes: "Prepare for monthly generator service",
        createdById: maintenanceOfficer.id
      }
    ]
  });

  await prisma.maintenanceCost.createMany({
    data: [
      {
        companyId: company.id,
        branchId: accraBranch.id,
        warehouseId: warehouses[2].id,
        productionSiteId: productionSites[0].id,
        machineId: pelletizer.id,
        breakdownRecordId: pelletBreakdown.id,
        costDate: metricDate(0),
        costType: "SPARE_PART",
        amount: 220,
        description: "Pelletizer drive belt",
        status: "COMPLETED",
        approvedById: superAdmin.id,
        approvedAt: metricDate(0),
        createdById: maintenanceOfficer.id
      },
      {
        companyId: company.id,
        branchId: accraBranch.id,
        warehouseId: warehouses[2].id,
        productionSiteId: productionSites[0].id,
        machineId: feedMixer.id,
        maintenanceRecordId: mixerRecord.id,
        costDate: metricDate(1),
        costType: "LABOR",
        amount: 180,
        description: "Preventive maintenance labor",
        status: "COMPLETED",
        approvedById: superAdmin.id,
        approvedAt: metricDate(1),
        createdById: maintenanceOfficer.id
      }
    ]
  });

  await prisma.auditLog.createMany({
    data: [
      { companyId: company.id, branchId: accraBranch.id, productionSiteId: productionSites[0].id, actorUserId: maintenanceOfficer.id, action: "CREATE", entityType: "Machine", entityId: feedMixer.id, summary: "Registered feed mixer machine" },
      { companyId: company.id, branchId: accraBranch.id, productionSiteId: productionSites[0].id, actorUserId: maintenanceOfficer.id, action: "CREATE", entityType: "MaintenanceSchedule", entityId: mixerSchedule.id, summary: "Created preventive maintenance schedule" },
      { companyId: company.id, branchId: accraBranch.id, productionSiteId: productionSites[0].id, actorUserId: feedMillManager.id, action: "CREATE", entityType: "BreakdownRecord", entityId: pelletBreakdown.id, summary: "Reported pelletizer breakdown" },
      { companyId: company.id, branchId: accraBranch.id, warehouseId: warehouses[2].id, actorUserId: storekeeper.id, action: "CREATE", entityType: "SparePartUsage", entityId: spareUsage.id, summary: "Issued spare part for maintenance" }
    ]
  });

  await prisma.stockMovement.deleteMany({
    where: { companyId: company.id, referenceType: { in: ["FeedProductionBatch", "FeedInternalTransfer"] } }
  });
  await prisma.feedInternalTransfer.deleteMany({ where: { companyId: company.id } });
  await prisma.feedProductionCost.deleteMany({ where: { companyId: company.id } });
  await prisma.feedPackagingRecord.deleteMany({ where: { companyId: company.id } });
  await prisma.finishedFeedStock.deleteMany({ where: { companyId: company.id } });
  await prisma.feedQualityCheck.deleteMany({ where: { companyId: company.id } });
  await prisma.feedRawMaterialUsage.deleteMany({ where: { companyId: company.id } });
  await prisma.feedProductionBatch.deleteMany({ where: { companyId: company.id } });
  await prisma.feedProductionOrder.deleteMany({ where: { companyId: company.id } });
  await prisma.feedFormulaVersion.deleteMany({ where: { companyId: company.id } });
  await prisma.feedFormulaIngredient.deleteMany({ where: { companyId: company.id } });
  await prisma.feedFormula.deleteMany({ where: { companyId: company.id } });

  const layerFormula = await prisma.feedFormula.create({
    data: {
      companyId: company.id,
      branchId: accraBranch.id,
      finishedProductId: layerFeed.id,
      code: "FF-LAYER-MASH-001",
      name: "Commercial Layer Mash",
      feedType: "LAYER_MASH",
      targetBatchKg: 100,
      status: "ACTIVE",
      currentVersionNo: 1,
      createdById: superAdmin.id,
      ingredients: {
        create: [
          { companyId: company.id, ingredientId: maize.id, quantityKg: 58, unitCost: 3.5, sortOrder: 1 },
          { companyId: company.id, ingredientId: soyaCake.id, quantityKg: 24, unitCost: 5.2, sortOrder: 2 },
          { companyId: company.id, ingredientId: wheatBran.id, quantityKg: 18, unitCost: 2.1, sortOrder: 3 }
        ]
      }
    },
    include: { ingredients: { include: { ingredient: true } } }
  });

  const broilerFormula = await prisma.feedFormula.create({
    data: {
      companyId: company.id,
      branchId: accraBranch.id,
      finishedProductId: broilerFinisher.id,
      code: "FF-BROILER-FIN-001",
      name: "Broiler Finisher Mash",
      feedType: "BROILER_FINISHER",
      targetBatchKg: 100,
      status: "ACTIVE",
      currentVersionNo: 1,
      createdById: superAdmin.id,
      ingredients: {
        create: [
          { companyId: company.id, ingredientId: maize.id, quantityKg: 62, unitCost: 3.5, sortOrder: 1 },
          { companyId: company.id, ingredientId: soyaCake.id, quantityKg: 28, unitCost: 5.2, sortOrder: 2 },
          { companyId: company.id, ingredientId: wheatBran.id, quantityKg: 10, unitCost: 2.1, sortOrder: 3 }
        ]
      }
    },
    include: { ingredients: { include: { ingredient: true } } }
  });

  const formulaCost = (formula: typeof layerFormula) => formula.ingredients.reduce((sum, ingredient) => sum + Number(ingredient.quantityKg) * Number(ingredient.unitCost), 0);
  const layerCost = formulaCost(layerFormula);
  const broilerCost = formulaCost(broilerFormula);
  const [layerFormulaVersion] = await Promise.all([
    prisma.feedFormulaVersion.create({
      data: {
        companyId: company.id,
        formulaId: layerFormula.id,
        versionNo: 1,
        status: "ACTIVE",
        ingredientSnapshot: layerFormula.ingredients.map((ingredient) => ({
          sku: ingredient.ingredient.sku,
          name: ingredient.ingredient.name,
          quantityKg: Number(ingredient.quantityKg),
          unitCost: Number(ingredient.unitCost)
        })),
        costPer100Kg: layerCost,
        costPer50KgBag: layerCost / 2,
        notes: "Initial commercial layer mash formula",
        createdById: superAdmin.id
      }
    }),
    prisma.feedFormulaVersion.create({
      data: {
        companyId: company.id,
        formulaId: broilerFormula.id,
        versionNo: 1,
        status: "ACTIVE",
        ingredientSnapshot: broilerFormula.ingredients.map((ingredient) => ({
          sku: ingredient.ingredient.sku,
          name: ingredient.ingredient.name,
          quantityKg: Number(ingredient.quantityKg),
          unitCost: Number(ingredient.unitCost)
        })),
        costPer100Kg: broilerCost,
        costPer50KgBag: broilerCost / 2,
        notes: "Initial broiler finisher formula",
        createdById: superAdmin.id
      }
    })
  ]);

  const feedOrder = await prisma.feedProductionOrder.create({
    data: {
      companyId: company.id,
      branchId: accraBranch.id,
      productionSiteId: productionSites[0].id,
      formulaId: layerFormula.id,
      formulaVersionId: layerFormulaVersion.id,
      finishedProductId: layerFeed.id,
      orderNumber: "FPO-2026-0001",
      plannedQuantityKg: 2500,
      scheduledDate: metricDate(1),
      status: "COMPLETED",
      approvedById: superAdmin.id,
      approvedAt: metricDate(1),
      createdById: superAdmin.id
    }
  });

  const feedBatch = await prisma.feedProductionBatch.create({
    data: {
      companyId: company.id,
      branchId: accraBranch.id,
      productionSiteId: productionSites[0].id,
      productionOrderId: feedOrder.id,
      finishedProductId: layerFeed.id,
      batchNumber: "FB-2026-0001",
      producedQuantityKg: 2460,
      wastageKg: 40,
      productionDate: metricDate(0),
      status: "POSTED",
      createdById: superAdmin.id
    }
  });

  const feedUsage = [
    { rawMaterial: maize, quantityKg: 1450, unitCost: 3.5, wastageKg: 18 },
    { rawMaterial: soyaCake, quantityKg: 600, unitCost: 5.2, wastageKg: 12 },
    { rawMaterial: wheatBran, quantityKg: 450, unitCost: 2.1, wastageKg: 10 }
  ];

  await prisma.feedRawMaterialUsage.createMany({
    data: feedUsage.map((usage) => ({
      companyId: company.id,
      branchId: accraBranch.id,
      productionSiteId: productionSites[0].id,
      productionBatchId: feedBatch.id,
      rawMaterialId: usage.rawMaterial.id,
      quantityKg: usage.quantityKg,
      unitCost: usage.unitCost,
      wastageKg: usage.wastageKg,
      createdById: superAdmin.id
    }))
  });

  await prisma.feedQualityCheck.create({
    data: {
      companyId: company.id,
      branchId: accraBranch.id,
      productionSiteId: productionSites[0].id,
      productionBatchId: feedBatch.id,
      moisturePercent: 11.8,
      proteinPercent: 17.6,
      textureNotes: "Uniform mash, no foreign material observed",
      status: "APPROVED",
      checkedById: superAdmin.id,
      approvedById: superAdmin.id,
      approvedAt: metricDate(0)
    }
  });

  await prisma.feedPackagingRecord.create({
    data: {
      companyId: company.id,
      branchId: accraBranch.id,
      productionSiteId: productionSites[0].id,
      productionBatchId: feedBatch.id,
      packageSizeKg: 50,
      packageCount: 49,
      labelPrinted: true,
      packagedAt: metricDate(0),
      createdById: superAdmin.id
    }
  });

  const rawMaterialCost = feedUsage.reduce((sum, usage) => sum + usage.quantityKg * usage.unitCost, 0);
  await prisma.feedProductionCost.create({
    data: {
      companyId: company.id,
      branchId: accraBranch.id,
      productionSiteId: productionSites[0].id,
      productionBatchId: feedBatch.id,
      rawMaterialCost,
      laborCost: 820,
      packagingCost: 540,
      overheadCost: 460,
      expectedSalesValue: 16200,
      createdById: superAdmin.id
    }
  });

  await prisma.finishedFeedStock.create({
    data: {
      companyId: company.id,
      branchId: accraBranch.id,
      productionSiteId: productionSites[0].id,
      warehouseId: warehouses[2].id,
      productionBatchId: feedBatch.id,
      productId: layerFeed.id,
      quantityKg: 2460,
      bag50KgCount: 49,
      unitCost: (rawMaterialCost + 820 + 540 + 460) / 2460
    }
  });

  const internalTransfer = await prisma.feedInternalTransfer.create({
    data: {
      companyId: company.id,
      branchId: accraBranch.id,
      productionBatchId: feedBatch.id,
      productId: layerFeed.id,
      fromWarehouseId: warehouses[2].id,
      toFarmId: farms[0].id,
      toPoultryHouseId: poultryHouses[0].id,
      quantityKg: 500,
      status: "COMPLETED",
      transferDate: metricDate(0),
      notes: "Seed transfer to Layer House A",
      createdById: superAdmin.id
    }
  });

  for (const usage of feedUsage) {
    await prisma.stockMovement.create({
      data: {
        companyId: company.id,
        branchId: accraBranch.id,
        productId: usage.rawMaterial.id,
        fromWarehouseId: warehouses[0].id,
        productionSiteId: productionSites[0].id,
        uomId: kg.id,
        movementType: "PRODUCTION_INPUT",
        quantity: usage.quantityKg,
        unitCost: usage.unitCost,
        referenceType: "FeedProductionBatch",
        referenceId: feedBatch.id,
        notes: `Raw material issued for ${feedBatch.batchNumber}`,
        createdById: superAdmin.id
      }
    });
  }

  await prisma.stockMovement.create({
    data: {
      companyId: company.id,
      branchId: accraBranch.id,
      productId: layerFeed.id,
      toWarehouseId: warehouses[2].id,
      warehouseId: warehouses[2].id,
      productionSiteId: productionSites[0].id,
      uomId: kg.id,
      movementType: "PRODUCTION_OUTPUT",
      quantity: 2460,
      unitCost: (rawMaterialCost + 820 + 540 + 460) / 2460,
      referenceType: "FeedProductionBatch",
      referenceId: feedBatch.id,
      notes: `Finished feed produced from ${feedBatch.batchNumber}`,
      createdById: superAdmin.id
    }
  });

  await prisma.stockMovement.create({
    data: {
      companyId: company.id,
      branchId: accraBranch.id,
      productId: layerFeed.id,
      fromWarehouseId: warehouses[2].id,
      toFarmId: farms[0].id,
      farmId: farms[0].id,
      uomId: kg.id,
      movementType: "TRANSFER",
      quantity: 500,
      referenceType: "FeedInternalTransfer",
      referenceId: internalTransfer.id,
      notes: "Internal feed transfer to layer farm",
      createdById: superAdmin.id
    }
  });

  await prisma.stockMovement.deleteMany({
    where: { companyId: company.id, referenceType: { in: ["SoyaBeanIntake", "SoyaProcessingBatch", "SoyaInternalTransfer", "SoyaSalesLink"] } }
  });
  await prisma.soyaSalesLink.deleteMany({ where: { companyId: company.id } });
  await prisma.soyaInternalTransfer.deleteMany({ where: { companyId: company.id } });
  await prisma.soyaProductionCost.deleteMany({ where: { companyId: company.id } });
  await prisma.soyaQualityCheck.deleteMany({ where: { companyId: company.id } });
  await prisma.soyaWasteRecord.deleteMany({ where: { companyId: company.id } });
  await prisma.soyaCakeOutput.deleteMany({ where: { companyId: company.id } });
  await prisma.soyaOilOutput.deleteMany({ where: { companyId: company.id } });
  await prisma.soyaProcessingBatch.deleteMany({ where: { companyId: company.id } });
  await prisma.soyaBeanIntake.deleteMany({ where: { companyId: company.id } });

  const soyaBeanInventory = await prisma.inventoryItem.upsert({
    where: { companyId_warehouseId_productId: { companyId: company.id, warehouseId: warehouses[3].id, productId: soyaBeans.id } },
    update: { quantityOnHand: 9000 },
    create: {
      companyId: company.id,
      branchId: kumasiBranch.id,
      warehouseId: warehouses[3].id,
      productionSiteId: productionSites[1].id,
      productId: soyaBeans.id,
      uomId: kg.id,
      reorderLevel: 2000,
      quantityOnHand: 9000
    }
  });

  const soyaOilInventory = await prisma.inventoryItem.upsert({
    where: { companyId_warehouseId_productId: { companyId: company.id, warehouseId: warehouses[3].id, productId: soyaOil.id } },
    update: { quantityOnHand: 1350 },
    create: {
      companyId: company.id,
      branchId: kumasiBranch.id,
      warehouseId: warehouses[3].id,
      productionSiteId: productionSites[1].id,
      productId: soyaOil.id,
      uomId: litre.id,
      reorderLevel: 250,
      quantityOnHand: 1350
    }
  });

  const soyaCakeInventory = await prisma.inventoryItem.upsert({
    where: { companyId_warehouseId_productId: { companyId: company.id, warehouseId: warehouses[3].id, productId: soyaCake.id } },
    update: { quantityOnHand: 3300 },
    create: {
      companyId: company.id,
      branchId: kumasiBranch.id,
      warehouseId: warehouses[3].id,
      productionSiteId: productionSites[1].id,
      productId: soyaCake.id,
      uomId: kg.id,
      reorderLevel: 600,
      quantityOnHand: 3300
    }
  });

  const feedWarehouseCakeInventory = await prisma.inventoryItem.upsert({
    where: { companyId_warehouseId_productId: { companyId: company.id, warehouseId: warehouses[2].id, productId: soyaCake.id } },
    update: { quantityOnHand: 850 },
    create: {
      companyId: company.id,
      branchId: accraBranch.id,
      warehouseId: warehouses[2].id,
      productionSiteId: productionSites[0].id,
      productId: soyaCake.id,
      uomId: kg.id,
      reorderLevel: 800,
      quantityOnHand: 850
    }
  });

  const soyaIntake = await prisma.soyaBeanIntake.create({
    data: {
      companyId: company.id,
      branchId: kumasiBranch.id,
      productionSiteId: productionSites[1].id,
      warehouseId: warehouses[3].id,
      productId: soyaBeans.id,
      receiptNumber: "SBI-2026-0001",
      supplierName: "Northern Grain Aggregators",
      quantityKg: 8000,
      unitCost: 4.1,
      totalCost: 32800,
      moisturePercent: 10.7,
      qualityStatus: "APPROVED",
      receivedAt: metricDate(3),
      notes: "Clean beans received for June processing",
      createdById: superAdmin.id
    }
  });

  const soyaBatch = await prisma.soyaProcessingBatch.create({
    data: {
      companyId: company.id,
      branchId: kumasiBranch.id,
      productionSiteId: productionSites[1].id,
      intakeId: soyaIntake.id,
      beanProductId: soyaBeans.id,
      batchNumber: "SPB-2026-0001",
      beansUsedKg: 5000,
      processingDate: metricDate(1),
      status: "POSTED",
      notes: "Seed soya processing batch",
      createdById: superAdmin.id
    }
  });

  await prisma.soyaOilOutput.create({
    data: {
      companyId: company.id,
      branchId: kumasiBranch.id,
      productionSiteId: productionSites[1].id,
      productionBatchId: soyaBatch.id,
      warehouseId: warehouses[3].id,
      productId: soyaOil.id,
      quantityLitres: 920,
      unitCost: 9.8,
      createdById: superAdmin.id
    }
  });

  await prisma.soyaCakeOutput.create({
    data: {
      companyId: company.id,
      branchId: kumasiBranch.id,
      productionSiteId: productionSites[1].id,
      productionBatchId: soyaBatch.id,
      warehouseId: warehouses[3].id,
      productId: soyaCake.id,
      quantityKg: 3650,
      unitCost: 5.1,
      createdById: superAdmin.id
    }
  });

  await prisma.soyaWasteRecord.create({
    data: {
      companyId: company.id,
      branchId: kumasiBranch.id,
      productionSiteId: productionSites[1].id,
      productionBatchId: soyaBatch.id,
      quantityKg: 430,
      reason: "Hull, moisture loss, and press residue",
      createdById: superAdmin.id
    }
  });

  await prisma.soyaQualityCheck.create({
    data: {
      companyId: company.id,
      branchId: kumasiBranch.id,
      productionSiteId: productionSites[1].id,
      productionBatchId: soyaBatch.id,
      moisturePercent: 9.4,
      oilPurityPercent: 97.8,
      cakeProteinPercent: 45.2,
      status: "APPROVED",
      notes: "Oil clarity and cake protein within standard",
      checkedById: superAdmin.id,
      approvedById: superAdmin.id,
      approvedAt: metricDate(1),
      checkedAt: metricDate(1)
    }
  });

  await prisma.soyaProductionCost.create({
    data: {
      companyId: company.id,
      branchId: kumasiBranch.id,
      productionSiteId: productionSites[1].id,
      productionBatchId: soyaBatch.id,
      rawBeanCost: 20500,
      laborCost: 1850,
      packagingCost: 1260,
      overheadCost: 940,
      expectedOilSalesValue: 18400,
      expectedCakeSalesValue: 23725,
      createdById: superAdmin.id
    }
  });

  const soyaTransfer = await prisma.soyaInternalTransfer.create({
    data: {
      companyId: company.id,
      branchId: kumasiBranch.id,
      productionSiteId: productionSites[1].id,
      productionBatchId: soyaBatch.id,
      productId: soyaCake.id,
      outputType: "CAKE",
      fromWarehouseId: warehouses[3].id,
      toWarehouseId: warehouses[2].id,
      toProductionSiteId: productionSites[0].id,
      quantity: 850,
      status: "COMPLETED",
      transferDate: metricDate(0),
      notes: "Soya cake moved to feed mill raw material inventory",
      createdById: superAdmin.id
    }
  });

  const soyaOilSale = await prisma.soyaSalesLink.create({
    data: {
      companyId: company.id,
      branchId: kumasiBranch.id,
      productionSiteId: productionSites[1].id,
      productionBatchId: soyaBatch.id,
      productId: soyaOil.id,
      warehouseId: warehouses[3].id,
      outputType: "OIL",
      customerName: "Accra Food Processors",
      quantity: 260,
      unitPrice: 22,
      totalAmount: 5720,
      status: "POSTED",
      saleDate: metricDate(0),
      createdById: superAdmin.id
    }
  });

  const soyaCakeSale = await prisma.soyaSalesLink.create({
    data: {
      companyId: company.id,
      branchId: kumasiBranch.id,
      productionSiteId: productionSites[1].id,
      productionBatchId: soyaBatch.id,
      productId: soyaCake.id,
      warehouseId: warehouses[3].id,
      outputType: "CAKE",
      customerName: "Livestock Feed Trader",
      quantity: 500,
      unitPrice: 7.1,
      totalAmount: 3550,
      status: "POSTED",
      saleDate: metricDate(0),
      createdById: superAdmin.id
    }
  });

  await prisma.stockMovement.createMany({
    data: [
      {
        companyId: company.id,
        branchId: kumasiBranch.id,
        productId: soyaBeans.id,
        inventoryItemId: soyaBeanInventory.id,
        toWarehouseId: warehouses[3].id,
        warehouseId: warehouses[3].id,
        productionSiteId: productionSites[1].id,
        uomId: kg.id,
        movementType: "PURCHASE_RECEIPT",
        quantity: 8000,
        unitCost: 4.1,
        referenceType: "SoyaBeanIntake",
        referenceId: soyaIntake.id,
        notes: "Soya bean intake receipt",
        createdById: superAdmin.id
      },
      {
        companyId: company.id,
        branchId: kumasiBranch.id,
        productId: soyaBeans.id,
        inventoryItemId: soyaBeanInventory.id,
        fromWarehouseId: warehouses[3].id,
        productionSiteId: productionSites[1].id,
        uomId: kg.id,
        movementType: "PRODUCTION_INPUT",
        quantity: 5000,
        unitCost: 4.1,
        referenceType: "SoyaProcessingBatch",
        referenceId: soyaBatch.id,
        notes: "Soya beans issued for processing",
        createdById: superAdmin.id
      },
      {
        companyId: company.id,
        branchId: kumasiBranch.id,
        productId: soyaOil.id,
        inventoryItemId: soyaOilInventory.id,
        toWarehouseId: warehouses[3].id,
        warehouseId: warehouses[3].id,
        productionSiteId: productionSites[1].id,
        uomId: litre.id,
        movementType: "PRODUCTION_OUTPUT",
        quantity: 920,
        unitCost: 9.8,
        referenceType: "SoyaProcessingBatch",
        referenceId: soyaBatch.id,
        notes: "Soya oil output received",
        createdById: superAdmin.id
      },
      {
        companyId: company.id,
        branchId: kumasiBranch.id,
        productId: soyaCake.id,
        inventoryItemId: soyaCakeInventory.id,
        toWarehouseId: warehouses[3].id,
        warehouseId: warehouses[3].id,
        productionSiteId: productionSites[1].id,
        uomId: kg.id,
        movementType: "PRODUCTION_OUTPUT",
        quantity: 3650,
        unitCost: 5.1,
        referenceType: "SoyaProcessingBatch",
        referenceId: soyaBatch.id,
        notes: "Soya cake output received",
        createdById: superAdmin.id
      },
      {
        companyId: company.id,
        branchId: kumasiBranch.id,
        productId: soyaCake.id,
        inventoryItemId: soyaCakeInventory.id,
        fromWarehouseId: warehouses[3].id,
        toWarehouseId: warehouses[2].id,
        toProductionSiteId: productionSites[0].id,
        uomId: kg.id,
        movementType: "TRANSFER",
        quantity: 850,
        unitCost: 5.1,
        referenceType: "SoyaInternalTransfer",
        referenceId: soyaTransfer.id,
        notes: "Soya cake transfer to feed mill",
        createdById: superAdmin.id
      },
      {
        companyId: company.id,
        branchId: accraBranch.id,
        productId: soyaCake.id,
        inventoryItemId: feedWarehouseCakeInventory.id,
        toWarehouseId: warehouses[2].id,
        warehouseId: warehouses[2].id,
        productionSiteId: productionSites[0].id,
        uomId: kg.id,
        movementType: "TRANSFER",
        quantity: 850,
        unitCost: 5.1,
        referenceType: "SoyaInternalTransfer",
        referenceId: soyaTransfer.id,
        notes: "Soya cake received from soya processing",
        createdById: superAdmin.id
      },
      {
        companyId: company.id,
        branchId: kumasiBranch.id,
        productId: soyaOil.id,
        inventoryItemId: soyaOilInventory.id,
        fromWarehouseId: warehouses[3].id,
        warehouseId: warehouses[3].id,
        productionSiteId: productionSites[1].id,
        uomId: litre.id,
        movementType: "SALE_DISPATCH",
        quantity: 260,
        unitCost: 22,
        referenceType: "SoyaSalesLink",
        referenceId: soyaOilSale.id,
        notes: "External soya oil sale",
        createdById: superAdmin.id
      },
      {
        companyId: company.id,
        branchId: kumasiBranch.id,
        productId: soyaCake.id,
        inventoryItemId: soyaCakeInventory.id,
        fromWarehouseId: warehouses[3].id,
        warehouseId: warehouses[3].id,
        productionSiteId: productionSites[1].id,
        uomId: kg.id,
        movementType: "SALE_DISPATCH",
        quantity: 500,
        unitCost: 7.1,
        referenceType: "SoyaSalesLink",
        referenceId: soyaCakeSale.id,
        notes: "External soya cake sale",
        createdById: superAdmin.id
      }
    ]
  });

  await prisma.dashboardAlert.deleteMany({ where: { companyId: company.id } });
  await prisma.dashboardMetricSnapshot.deleteMany({ where: { companyId: company.id } });

  const metricRows: Prisma.DashboardMetricSnapshotCreateManyInput[] = [];
  const addMetric = (input: Omit<Prisma.DashboardMetricSnapshotCreateManyInput, "companyId">) => {
    metricRows.push({ companyId: company.id, ...input });
  };

  const farmDailyBase = [
    { farm: farms[0], branch: accraBranch, birds: 11840, flocks: 3, eggs: 9100, mortality: 14, feedConsumed: 2250, performance: 93.5 },
    { farm: farms[1], branch: accraBranch, birds: 17620, flocks: 4, eggs: 0, mortality: 23, feedConsumed: 3180, performance: 89.2 },
    { farm: farms[2], branch: kumasiBranch, birds: 5480, flocks: 2, eggs: 2470, mortality: 6, feedConsumed: 1040, performance: 91.8 }
  ];

  for (const item of farmDailyBase) {
    addMetric({
      branchId: item.branch.id,
      farmId: item.farm.id,
      businessUnit: BusinessUnit.POULTRY,
      metricKey: DashboardMetricKey.TOTAL_BIRDS,
      metricDate: metricDate(0),
      value: item.birds,
      unit: "birds"
    });
    addMetric({
      branchId: item.branch.id,
      farmId: item.farm.id,
      businessUnit: BusinessUnit.POULTRY,
      metricKey: DashboardMetricKey.ACTIVE_FLOCK_BATCHES,
      metricDate: metricDate(0),
      value: item.flocks,
      unit: "batches"
    });
    addMetric({
      branchId: item.branch.id,
      farmId: item.farm.id,
      businessUnit: BusinessUnit.POULTRY,
      metricKey: DashboardMetricKey.FEED_CONSUMED,
      metricDate: metricDate(0),
      value: item.feedConsumed,
      unit: "kg"
    });
    addMetric({
      branchId: item.branch.id,
      farmId: item.farm.id,
      businessUnit: BusinessUnit.POULTRY,
      metricKey: DashboardMetricKey.FARM_PERFORMANCE_INDEX,
      metricDate: metricDate(0),
      label: item.farm.name,
      value: item.performance,
      unit: "%"
    });
  }

  for (let day = 0; day < 30; day += 1) {
    for (const [index, item] of farmDailyBase.entries()) {
      addMetric({
        branchId: item.branch.id,
        farmId: item.farm.id,
        businessUnit: BusinessUnit.POULTRY,
        metricKey: DashboardMetricKey.EGG_PRODUCTION,
        metricDate: metricDate(day),
        value: Math.max(0, item.eggs + (index + 1) * 90 - day * 18 + (day % 5) * 55),
        unit: "eggs"
      });
      addMetric({
        branchId: item.branch.id,
        farmId: item.farm.id,
        businessUnit: BusinessUnit.POULTRY,
        metricKey: DashboardMetricKey.MORTALITY,
        metricDate: metricDate(day),
        value: item.mortality + (day % 4) + index,
        unit: "birds"
      });
    }

    addMetric({
      branchId: accraBranch.id,
      productionSiteId: productionSites[0].id,
      warehouseId: warehouses[2].id,
      businessUnit: BusinessUnit.FEED_MILL,
      metricKey: DashboardMetricKey.FEED_PRODUCED,
      metricDate: metricDate(day),
      value: 18500 + (day % 6) * 850,
      unit: "kg"
    });
    addMetric({
      branchId: kumasiBranch.id,
      productionSiteId: productionSites[1].id,
      businessUnit: BusinessUnit.SOYA_PROCESSING,
      metricKey: DashboardMetricKey.SOYA_BEANS_PROCESSED,
      metricDate: metricDate(day),
      value: 8200 + (day % 4) * 620,
      unit: "kg"
    });
    addMetric({
      branchId: kumasiBranch.id,
      productionSiteId: productionSites[1].id,
      businessUnit: BusinessUnit.SOYA_PROCESSING,
      metricKey: DashboardMetricKey.SOYA_OIL_PRODUCED,
      metricDate: metricDate(day),
      value: 1420 + (day % 4) * 95,
      unit: "L"
    });
    addMetric({
      branchId: kumasiBranch.id,
      productionSiteId: productionSites[1].id,
      businessUnit: BusinessUnit.SOYA_PROCESSING,
      metricKey: DashboardMetricKey.SOYA_CAKE_PRODUCED,
      metricDate: metricDate(day),
      value: 5710 + (day % 4) * 440,
      unit: "kg"
    });
    addMetric({
      branchId: day % 3 === 0 ? kumasiBranch.id : accraBranch.id,
      businessUnit: BusinessUnit.SALES,
      metricKey: DashboardMetricKey.SALES,
      metricDate: metricDate(day),
      value: 98000 + (day % 7) * 6200,
      unit: "GHS"
    });
  }

  for (const row of [
    { branch: accraBranch, value: 94.1 },
    { branch: kumasiBranch, value: 88.7 }
  ]) {
    addMetric({
      branchId: row.branch.id,
      businessUnit: BusinessUnit.FINANCE,
      metricKey: DashboardMetricKey.BRANCH_PERFORMANCE_INDEX,
      metricDate: metricDate(0),
      label: row.branch.name,
      value: row.value,
      unit: "%"
    });
  }

  for (const row of [
    { warehouse: warehouses[0], category: rawCategory, value: 188500 },
    { warehouse: warehouses[2], category: finishedCategory, value: 126300 },
    { warehouse: warehouses[1], category: finishedCategory, value: 73400 }
  ]) {
    addMetric({
      branchId: row.warehouse.branchId,
      warehouseId: row.warehouse.id,
      productCategoryId: row.category.id,
      businessUnit: BusinessUnit.INVENTORY,
      metricKey: DashboardMetricKey.CURRENT_INVENTORY_VALUE,
      metricDate: metricDate(0),
      label: row.category.name,
      value: row.value,
      unit: "GHS"
    });
  }

  for (const row of [
    { product: maize, value: 24800 },
    { product: layerFeed, value: 46200 },
    { product: soyaOil, value: 31800 }
  ]) {
    addMetric({
      branchId: row.product.branchId,
      productId: row.product.id,
      businessUnit: BusinessUnit.FINANCE,
      metricKey: DashboardMetricKey.GROSS_PROFIT,
      metricDate: metricDate(0),
      label: row.product.name,
      value: row.value,
      unit: "GHS"
    });
  }

  for (const row of [
    { businessUnit: BusinessUnit.SALES, metricKey: DashboardMetricKey.OUTSTANDING_CUSTOMER_DEBT, value: 142800, unit: "GHS" },
    { businessUnit: BusinessUnit.PROCUREMENT, metricKey: DashboardMetricKey.SUPPLIER_DEBT, value: 96800, unit: "GHS" },
    { businessUnit: BusinessUnit.INVENTORY, metricKey: DashboardMetricKey.LOW_STOCK_ALERTS, value: 7, unit: "alerts" },
    { businessUnit: BusinessUnit.FEED_MILL, metricKey: DashboardMetricKey.PENDING_PRODUCTION_ORDERS, value: 5, unit: "orders" },
    { businessUnit: BusinessUnit.PROCUREMENT, metricKey: DashboardMetricKey.PENDING_PURCHASE_APPROVALS, value: 9, unit: "approvals" },
    { businessUnit: BusinessUnit.MAINTENANCE, metricKey: DashboardMetricKey.MACHINE_MAINTENANCE_ALERTS, value: 4, unit: "alerts" },
    { businessUnit: BusinessUnit.AI_DECISION_SUPPORT, metricKey: DashboardMetricKey.AI_ALERTS, value: 6, unit: "alerts" }
  ]) {
    addMetric({
      branchId: accraBranch.id,
      businessUnit: row.businessUnit,
      metricKey: row.metricKey,
      metricDate: metricDate(0),
      value: row.value,
      unit: row.unit
    });
  }

  await prisma.dashboardMetricSnapshot.createMany({ data: metricRows });

  await prisma.dashboardAlert.createMany({
    data: [
      {
        companyId: company.id,
        branchId: accraBranch.id,
        farmId: farms[0].id,
        businessUnit: BusinessUnit.POULTRY,
        severity: "WARNING",
        title: "Layer Farm egg output variance",
        message: "Egg production is 4.8% below the seven-day moving average.",
        occurredAt: new Date()
      },
      {
        companyId: company.id,
        branchId: accraBranch.id,
        warehouseId: warehouses[0].id,
        businessUnit: BusinessUnit.INVENTORY,
        severity: "CRITICAL",
        title: "Raw maize stock approaching reorder point",
        message: "Main warehouse maize cover is below four production days.",
        occurredAt: new Date()
      },
      {
        companyId: company.id,
        branchId: accraBranch.id,
        productionSiteId: productionSites[0].id,
        businessUnit: BusinessUnit.MAINTENANCE,
        severity: "WARNING",
        title: "Pellet mill service due",
        message: "Scheduled maintenance is due within 36 hours.",
        occurredAt: new Date()
      },
      {
        companyId: company.id,
        branchId: kumasiBranch.id,
        productionSiteId: productionSites[1].id,
        businessUnit: BusinessUnit.AI_DECISION_SUPPORT,
        severity: "INFO",
        title: "Soya margin forecast improving",
        message: "AI forecast shows a 6% gross margin lift if current oil yield is sustained.",
        occurredAt: new Date()
      }
    ]
  });

  const aiAlerts = [
    {
      id: "a1a11111-1111-4111-8111-111111111101",
      branchId: accraBranch.id,
      farmId: farms[0].id,
      category: "MORTALITY_ANOMALY",
      severity: "HIGH",
      title: "Mortality in Layer Farm, House 2 increased above normal",
      message: "Mortality in Farm A, House 2 increased above normal. Last 3-day average is above the 14-day baseline and needs veterinary review.",
      requiredPermission: "poultry.read",
      entityType: "PoultryHouse",
      entityId: "demo-house-layer-2",
      entityName: "Layer House 2"
    },
    {
      id: "a1a11111-1111-4111-8111-111111111102",
      branchId: accraBranch.id,
      farmId: farms[0].id,
      category: "EGG_PRODUCTION_DROP",
      severity: "MEDIUM",
      title: "Egg production dropped by 15% this week",
      message: "Egg production dropped by 15% this week compared with the previous weekly average. Check lighting, feed intake, stress, and disease signals.",
      requiredPermission: "poultry.read",
      entityType: "Farm",
      entityId: farms[0].id,
      entityName: farms[0].name
    },
    {
      id: "a1a11111-1111-4111-8111-111111111103",
      branchId: accraBranch.id,
      farmId: farms[1].id,
      category: "FEED_CONSUMPTION_ANOMALY",
      severity: "MEDIUM",
      title: "Broiler feed consumption is below normal",
      message: "Feed consumption in Broiler Farm fell below the expected range. Low appetite may signal health, water, or feed quality issues.",
      requiredPermission: "poultry.read",
      entityType: "Farm",
      entityId: farms[1].id,
      entityName: farms[1].name
    },
    {
      id: "a1a11111-1111-4111-8111-111111111104",
      branchId: accraBranch.id,
      warehouseId: warehouses[0].id,
      category: "LOW_STOCK_PREDICTION",
      severity: "CRITICAL",
      title: "Maize stock may run out in 6 days",
      message: "Maize stock may run out in 6 days based on recent production usage. Raise purchase requests or transfer stock.",
      requiredPermission: "inventory.read",
      entityType: "InventoryItem",
      entityId: "demo-maize-stock",
      entityName: "Maize"
    },
    {
      id: "a1a11111-1111-4111-8111-111111111105",
      branchId: accraBranch.id,
      productionSiteId: productionSites[0].id,
      category: "FEED_DEMAND_FORECAST",
      severity: "MEDIUM",
      title: "Layer mash demand forecast increasing",
      message: "Layer mash demand is forecast to rise over the next 7 days based on flock feed consumption trends.",
      requiredPermission: "feed.read",
      entityType: "Product",
      entityId: "demo-layer-mash",
      entityName: "Layer Mash"
    },
    {
      id: "a1a11111-1111-4111-8111-111111111106",
      branchId: accraBranch.id,
      category: "CUSTOMER_REORDER_PREDICTION",
      severity: "LOW",
      title: "ABC Farms may reorder layer mash this week",
      message: "Customer ABC Farms may reorder layer mash this week based on prior purchase interval and recent sales history.",
      requiredPermission: "sales.read",
      entityType: "Customer",
      entityId: "demo-customer-abc-farms",
      entityName: "ABC Farms"
    },
    {
      id: "a1a11111-1111-4111-8111-111111111107",
      branchId: accraBranch.id,
      category: "SMART_PRICING",
      severity: "LOW",
      title: "Smart price review recommended for eggs",
      message: "Egg demand and inventory movement suggest room for a controlled price review without increasing stock holding risk.",
      requiredPermission: "sales.read",
      entityType: "Product",
      entityId: "demo-eggs",
      entityName: "Eggs"
    },
    {
      id: "a1a11111-1111-4111-8111-111111111108",
      branchId: kumasiBranch.id,
      productionSiteId: productionSites[1].id,
      category: "SOYA_YIELD_ANOMALY",
      severity: "HIGH",
      title: "Soya oil yield is below expected level",
      message: "Soya oil yield is below expected level. Review moisture, expeller pressure, and raw bean quality before the next batch.",
      requiredPermission: "soya.read",
      entityType: "ProductionSite",
      entityId: productionSites[1].id,
      entityName: productionSites[1].name
    },
    {
      id: "a1a11111-1111-4111-8111-111111111109",
      branchId: accraBranch.id,
      productionSiteId: productionSites[0].id,
      category: "MACHINE_MAINTENANCE",
      severity: "MEDIUM",
      title: "Mixer 1 maintenance is due soon",
      message: "Mixer 1 maintenance is due soon. Schedule preventive maintenance before production downtime risk increases.",
      requiredPermission: "maintenance.read",
      entityType: "Machine",
      entityId: "demo-mixer-1",
      entityName: "Mixer 1"
    },
    {
      id: "a1a11111-1111-4111-8111-111111111110",
      branchId: accraBranch.id,
      category: "CUSTOMER_DEBT_RISK",
      severity: "CRITICAL",
      title: "Customer XYZ has exceeded credit limit",
      message: "Customer XYZ has exceeded credit limit. Pause credit sales until payment or management approval is recorded.",
      requiredPermission: "sales.read",
      entityType: "Customer",
      entityId: "demo-customer-xyz",
      entityName: "Customer XYZ"
    },
    {
      id: "a1a11111-1111-4111-8111-111111111111",
      branchId: accraBranch.id,
      category: "SUPPLIER_DELAY_RISK",
      severity: "HIGH",
      title: "Supplier delivery delay risk for maize",
      message: "Supplier delivery is late against expected lead time. Alternative sourcing may be required to avoid maize stock-out.",
      requiredPermission: "procurement.read",
      entityType: "Supplier",
      entityId: "demo-maize-supplier",
      entityName: "Maize Supplier"
    },
    {
      id: "a1a11111-1111-4111-8111-111111111112",
      branchId: accraBranch.id,
      category: "SALES_FORECAST",
      severity: "MEDIUM",
      title: "Sales forecast shows slower weekly demand",
      message: "Sales forecast shows slower weekly demand than the prior period. Review customer engagement and price list performance.",
      requiredPermission: "sales.read",
      entityType: "Company",
      entityId: company.id,
      entityName: company.name
    }
  ] as const;

  for (const alert of aiAlerts) {
    await prisma.aiAlert.upsert({
      where: { id: alert.id },
      update: {
        branchId: alert.branchId,
        farmId: "farmId" in alert ? alert.farmId : undefined,
        warehouseId: "warehouseId" in alert ? alert.warehouseId : undefined,
        productionSiteId: "productionSiteId" in alert ? alert.productionSiteId : undefined,
        category: alert.category as any,
        severity: alert.severity as any,
        status: "UNREAD",
        title: alert.title,
        message: alert.message,
        requiredPermission: alert.requiredPermission,
        entityType: alert.entityType,
        entityId: alert.entityId,
        entityName: alert.entityName
      },
      create: {
        companyId: company.id,
        branchId: alert.branchId,
        farmId: "farmId" in alert ? alert.farmId : undefined,
        warehouseId: "warehouseId" in alert ? alert.warehouseId : undefined,
        productionSiteId: "productionSiteId" in alert ? alert.productionSiteId : undefined,
        category: alert.category as any,
        severity: alert.severity as any,
        status: "UNREAD",
        title: alert.title,
        message: alert.message,
        requiredPermission: alert.requiredPermission,
        entityType: alert.entityType,
        entityId: alert.entityId,
        entityName: alert.entityName,
        metadata: { seeded: true }
      }
    });
  }

  const aiForecasts = [
    ["f0f11111-1111-4111-8111-111111111101", "LOW_STOCK_PREDICTION", "InventoryItem", "demo-maize-stock", "Maize stock-out prediction", 6, "days_to_stockout", 0.82],
    ["f0f11111-1111-4111-8111-111111111102", "FEED_DEMAND_FORECAST", "Product", "demo-layer-mash", "Layer mash demand next 7 days", 12800, "kg", 0.76],
    ["f0f11111-1111-4111-8111-111111111103", "SALES_FORECAST", "Company", company.id, "Sales forecast next 30 days", 215000, "GHS", 0.71],
    ["f0f11111-1111-4111-8111-111111111104", "CUSTOMER_REORDER_PREDICTION", "Customer", "demo-customer-abc-farms", "ABC Farms reorder probability", 0.74, "probability", 0.68],
    ["f0f11111-1111-4111-8111-111111111105", "SMART_PRICING", "Product", "demo-eggs", "Recommended egg tray price", 36, "GHS", 0.64],
    ["f0f11111-1111-4111-8111-111111111106", "SOYA_YIELD_ANOMALY", "ProductionSite", productionSites[1].id, "Expected soya oil yield", 17.5, "percent", 0.73],
    ["f0f11111-1111-4111-8111-111111111107", "MACHINE_MAINTENANCE", "Machine", "demo-mixer-1", "Mixer 1 days until maintenance", 3, "days_until_due", 0.84]
  ] as const;

  for (const [id, category, entityType, entityId, entityName, forecastValue, unit, confidence] of aiForecasts) {
    await prisma.aiForecast.upsert({
      where: { id },
      update: {
        category: category as any,
        entityType,
        entityId,
        entityName,
        forecastDate: new Date(Date.now() + 7 * 86400000),
        forecastValue,
        unit,
        confidence,
        metadata: { seeded: true }
      },
      create: {
        id,
        companyId: company.id,
        category: category as any,
        entityType,
        entityId,
        entityName,
        forecastDate: new Date(Date.now() + 7 * 86400000),
        forecastValue,
        unit,
        confidence,
        metadata: { seeded: true }
      }
    });
  }

  await upsertSystemSetting(company.id, "inventory.costingMethod", "FIFO", "Default inventory costing method");
  await upsertSystemSetting(company.id, "security.accessMode", "ASSIGNED_SCOPE_ONLY", "Users access assigned branches, farms, warehouses, and production sites unless executive/admin");

  // ─── Finance Seed Data ────────────────────────────────────────────────────

  const mainBankAccount = await prisma.bankAccount.upsert({
    where: { id: "ba111111-1111-4111-8111-111111111101" },
    update: {},
    create: {
      id: "ba111111-1111-4111-8111-111111111101",
      companyId: company.id,
      accountName: "Jokas Main Account",
      accountNumber: "1234567890",
      bankName: "GCB Bank",
      branchName: "Accra Central",
      accountType: "CURRENT",
      openingBalance: 150000,
      currentBalance: 150000
    }
  });

  const mobileMoney = await prisma.bankAccount.upsert({
    where: { id: "ba111111-1111-4111-8111-111111111102" },
    update: {},
    create: {
      id: "ba111111-1111-4111-8111-111111111102",
      companyId: company.id,
      accountName: "MTN MoMo Business",
      accountNumber: "0241234567",
      bankName: "MTN Mobile Money",
      accountType: "MOBILE_MONEY",
      openingBalance: 20000,
      currentBalance: 20000
    }
  });

  const expenseCategories = await Promise.all([
    prisma.expenseCategory.upsert({
      where: { companyId_code: { companyId: company.id, code: "FEED-MAT" } },
      update: {},
      create: { companyId: company.id, name: "Feed Raw Materials", code: "FEED-MAT", description: "Raw material purchases for feed production" }
    }),
    prisma.expenseCategory.upsert({
      where: { companyId_code: { companyId: company.id, code: "UTILITIES" } },
      update: {},
      create: { companyId: company.id, name: "Utilities", code: "UTILITIES", description: "Electricity, water, fuel" }
    }),
    prisma.expenseCategory.upsert({
      where: { companyId_code: { companyId: company.id, code: "TRANSPORT" } },
      update: {},
      create: { companyId: company.id, name: "Transport & Logistics", code: "TRANSPORT", description: "Vehicle fuel, driver allowances, logistics" }
    }),
    prisma.expenseCategory.upsert({
      where: { companyId_code: { companyId: company.id, code: "MAINTAIN" } },
      update: {},
      create: { companyId: company.id, name: "Maintenance & Repairs", code: "MAINTAIN", description: "Equipment and infrastructure repairs" }
    }),
    prisma.expenseCategory.upsert({
      where: { companyId_code: { companyId: company.id, code: "VET-MED" } },
      update: {},
      create: { companyId: company.id, name: "Veterinary & Medication", code: "VET-MED", description: "Vaccines, drugs, and vet fees" }
    }),
    prisma.expenseCategory.upsert({
      where: { companyId_code: { companyId: company.id, code: "ADMIN" } },
      update: {},
      create: { companyId: company.id, name: "Admin & Office", code: "ADMIN", description: "Stationery, internet, office supplies" }
    }),
    prisma.expenseCategory.upsert({
      where: { companyId_code: { companyId: company.id, code: "CHICKS" } },
      update: {},
      create: { companyId: company.id, name: "Chick Purchases", code: "CHICKS", description: "Day-old chick purchases" }
    })
  ]);

  const chartAccounts = await Promise.all([
    prisma.account.upsert({
      where: { companyId_code: { companyId: company.id, code: "1000" } },
      update: {},
      create: { companyId: company.id, code: "1000", name: "Cash and Bank", type: "ASSET" }
    }),
    prisma.account.upsert({
      where: { companyId_code: { companyId: company.id, code: "1100" } },
      update: {},
      create: { companyId: company.id, code: "1100", name: "Accounts Receivable", type: "ASSET" }
    }),
    prisma.account.upsert({
      where: { companyId_code: { companyId: company.id, code: "1200" } },
      update: {},
      create: { companyId: company.id, code: "1200", name: "Inventory", type: "ASSET" }
    }),
    prisma.account.upsert({
      where: { companyId_code: { companyId: company.id, code: "2000" } },
      update: {},
      create: { companyId: company.id, code: "2000", name: "Accounts Payable", type: "LIABILITY" }
    }),
    prisma.account.upsert({
      where: { companyId_code: { companyId: company.id, code: "3000" } },
      update: {},
      create: { companyId: company.id, code: "3000", name: "Owner Equity", type: "EQUITY" }
    }),
    prisma.account.upsert({
      where: { companyId_code: { companyId: company.id, code: "4000" } },
      update: {},
      create: { companyId: company.id, code: "4000", name: "Sales Revenue", type: "REVENUE" }
    }),
    prisma.account.upsert({
      where: { companyId_code: { companyId: company.id, code: "4100" } },
      update: {},
      create: { companyId: company.id, code: "4100", name: "Other Income", type: "REVENUE" }
    }),
    prisma.account.upsert({
      where: { companyId_code: { companyId: company.id, code: "5000" } },
      update: {},
      create: { companyId: company.id, code: "5000", name: "Cost of Goods Sold", type: "EXPENSE" }
    }),
    prisma.account.upsert({
      where: { companyId_code: { companyId: company.id, code: "5100" } },
      update: {},
      create: { companyId: company.id, code: "5100", name: "Operating Expenses", type: "EXPENSE" }
    }),
    prisma.account.upsert({
      where: { companyId_code: { companyId: company.id, code: "5200" } },
      update: {},
      create: { companyId: company.id, code: "5200", name: "Payroll Expenses", type: "EXPENSE" }
    })
  ]);

  const now = new Date();
  function daysAgo(n: number) { const d = new Date(now); d.setDate(d.getDate() - n); return d; }

  await Promise.all([
    prisma.expense.upsert({
      where: { companyId_reference: { companyId: company.id, reference: "EXP-2025-0001" } },
      update: {},
      create: {
        companyId: company.id,
        reference: "EXP-2025-0001",
        categoryId: expenseCategories[0].id,
        description: "Maize purchase — 10 tonnes for feed production",
        amount: 12500,
        expenseDate: daysAgo(15),
        paymentMethod: "BANK_TRANSFER",
        vendorName: "Accra Grain Suppliers Ltd",
        branchId: accraBranch.id,
        bankAccountId: mainBankAccount.id,
        status: "APPROVED",
        approvalRequired: true,
        submittedById: superAdmin.id,
        approvedById: superAdmin.id,
        approvedAt: daysAgo(14)
      }
    }),
    prisma.expense.upsert({
      where: { companyId_reference: { companyId: company.id, reference: "EXP-2025-0002" } },
      update: {},
      create: {
        companyId: company.id,
        reference: "EXP-2025-0002",
        categoryId: expenseCategories[1].id,
        description: "Electricity bill — Feed Mill June",
        amount: 3200,
        expenseDate: daysAgo(10),
        paymentMethod: "BANK_TRANSFER",
        vendorName: "ECG Ghana",
        branchId: accraBranch.id,
        bankAccountId: mainBankAccount.id,
        status: "APPROVED",
        submittedById: superAdmin.id,
        approvedById: superAdmin.id,
        approvedAt: daysAgo(9)
      }
    }),
    prisma.expense.upsert({
      where: { companyId_reference: { companyId: company.id, reference: "EXP-2025-0003" } },
      update: {},
      create: {
        companyId: company.id,
        reference: "EXP-2025-0003",
        categoryId: expenseCategories[4].id,
        description: "Poultry vaccines — Newcastle & Gumboro",
        amount: 1850,
        expenseDate: daysAgo(5),
        paymentMethod: "CASH",
        vendorName: "VetCare Ghana",
        branchId: accraBranch.id,
        status: "PENDING",
        submittedById: superAdmin.id
      }
    })
  ]);

  await Promise.all([
    prisma.revenue.upsert({
      where: { companyId_reference: { companyId: company.id, reference: "REV-2025-0001" } },
      update: {},
      create: {
        companyId: company.id,
        reference: "REV-2025-0001",
        source: "PRODUCT_SALES",
        description: "Egg sales — Layer Farm June 1st batch",
        amount: 28000,
        revenueDate: daysAgo(12),
        paymentMethod: "BANK_TRANSFER",
        customerName: "Accra Fresh Markets",
        bankAccountId: mainBankAccount.id,
        branchId: accraBranch.id
      }
    }),
    prisma.revenue.upsert({
      where: { companyId_reference: { companyId: company.id, reference: "REV-2025-0002" } },
      update: {},
      create: {
        companyId: company.id,
        reference: "REV-2025-0002",
        source: "PRODUCT_SALES",
        description: "Broiler sales — 500 birds @ GHS 85",
        amount: 42500,
        revenueDate: daysAgo(7),
        paymentMethod: "MOBILE_MONEY",
        customerName: "Kumasi Poultry Traders",
        bankAccountId: mobileMoney.id,
        branchId: accraBranch.id
      }
    }),
    prisma.revenue.upsert({
      where: { companyId_reference: { companyId: company.id, reference: "REV-2025-0003" } },
      update: {},
      create: {
        companyId: company.id,
        reference: "REV-2025-0003",
        source: "PRODUCT_SALES",
        description: "Feed sales — 20 x 50kg bags",
        amount: 6400,
        revenueDate: daysAgo(3),
        paymentMethod: "CASH",
        customerName: "Smallholder Farm Coop",
        branchId: accraBranch.id
      }
    })
  ]);

  await Promise.all([
    prisma.supplierPayment.upsert({
      where: { companyId_reference: { companyId: company.id, reference: "SP-2025-0001" } },
      update: {},
      create: {
        companyId: company.id,
        reference: "SP-2025-0001",
        supplierName: "Accra Grain Suppliers Ltd",
        amount: 12500,
        paymentDate: daysAgo(14),
        paymentMethod: "BANK_TRANSFER",
        description: "Payment for maize purchase EXP-2025-0001",
        purchaseOrderRef: "PO-2025-001",
        bankAccountId: mainBankAccount.id
      }
    }),
    prisma.supplierPayment.upsert({
      where: { companyId_reference: { companyId: company.id, reference: "SP-2025-0002" } },
      update: {},
      create: {
        companyId: company.id,
        reference: "SP-2025-0002",
        supplierName: "Soya Beans Direct Ghana",
        amount: 18000,
        paymentDate: daysAgo(8),
        paymentMethod: "BANK_TRANSFER",
        description: "Soya bean delivery — 6 tonnes",
        bankAccountId: mainBankAccount.id
      }
    })
  ]);

  await Promise.all([
    prisma.customerPayment.upsert({
      where: { companyId_reference: { companyId: company.id, reference: "CP-2025-0001" } },
      update: {},
      create: {
        companyId: company.id,
        reference: "CP-2025-0001",
        customerName: "Accra Fresh Markets",
        amount: 28000,
        paymentDate: daysAgo(11),
        paymentMethod: "BANK_TRANSFER",
        description: "Full payment for egg batch REV-2025-0001",
        invoiceRef: "INV-2025-001",
        bankAccountId: mainBankAccount.id
      }
    })
  ]);

  await Promise.all([
    prisma.payrollRecord.upsert({
      where: { companyId_reference: { companyId: company.id, reference: "PAY-2025-0001" } },
      update: {},
      create: {
        companyId: company.id,
        reference: "PAY-2025-0001",
        period: "2025-05",
        periodStart: new Date("2025-05-01"),
        periodEnd: new Date("2025-05-31"),
        employeeName: "Kwame Asante",
        employeeCode: "EMP-001",
        basicSalary: 3500,
        allowances: 500,
        deductions: 0,
        grossPay: 4000,
        taxDeduction: 320,
        ssnit: 200,
        netPay: 3480,
        status: "PAID",
        paymentDate: daysAgo(20),
        paymentMethod: "BANK_TRANSFER",
        bankAccountId: mainBankAccount.id,
        branchId: accraBranch.id
      }
    }),
    prisma.payrollRecord.upsert({
      where: { companyId_reference: { companyId: company.id, reference: "PAY-2025-0002" } },
      update: {},
      create: {
        companyId: company.id,
        reference: "PAY-2025-0002",
        period: "2025-06",
        periodStart: new Date("2025-06-01"),
        periodEnd: new Date("2025-06-30"),
        employeeName: "Ama Boateng",
        employeeCode: "EMP-002",
        basicSalary: 2800,
        allowances: 400,
        deductions: 0,
        grossPay: 3200,
        taxDeduction: 256,
        ssnit: 160,
        netPay: 2784,
        status: "APPROVED",
        branchId: accraBranch.id
      }
    })
  ]);

  const pctBalance = 5000;
  await prisma.pettyCashTransaction.upsert({
    where: { companyId_reference: { companyId: company.id, reference: "PCT-2025-0001" } },
    update: {},
    create: {
      companyId: company.id,
      reference: "PCT-2025-0001",
      type: "FUNDING",
      amount: 5000,
      description: "Initial petty cash float — Accra HQ",
      transactionDate: daysAgo(30),
      branchId: accraBranch.id,
      balance: pctBalance,
      requestedById: superAdmin.id
    }
  });

  await prisma.pettyCashTransaction.upsert({
    where: { companyId_reference: { companyId: company.id, reference: "PCT-2025-0002" } },
    update: {},
    create: {
      companyId: company.id,
      reference: "PCT-2025-0002",
      type: "DISBURSEMENT",
      amount: 250,
      description: "Office stationery and printing",
      transactionDate: daysAgo(5),
      categoryId: expenseCategories[5].id,
      branchId: accraBranch.id,
      balance: pctBalance - 250,
      requestedById: superAdmin.id
    }
  });

  await prisma.auditLog.create({
    data: {
      companyId: company.id,
      branchId: accraBranch.id,
      actorUserId: superAdmin.id,
      action: "CREATE",
      entityType: "SeedData",
      entityId: company.id,
      summary: "Seeded core ERP schema demo data",
      metadata: {
        branches: branches.map((branch) => branch.code),
        farms: farms.map((farm) => farm.code),
        warehouses: warehouses.map((warehouse) => warehouse.code),
        productionSites: productionSites.map((site) => site.code),
        roles: roles.map(([name]) => name),
        superAdminUsers
      }
    }
  });

  // ─── Procurement Seed Data ────────────────────────────────────────────────

  // Supplier categories
  const supplierCatFeed = await prisma.supplierCategory.upsert({
    where: { companyId_code: { companyId: company.id, code: "FEED-SUP" } },
    update: {},
    create: { companyId: company.id, code: "FEED-SUP", name: "Feed & Raw Materials", description: "Suppliers of feed ingredients and raw materials", createdById: superAdmin.id }
  });

  const supplierCatVet = await prisma.supplierCategory.upsert({
    where: { companyId_code: { companyId: company.id, code: "VET-SUP" } },
    update: {},
    create: { companyId: company.id, code: "VET-SUP", name: "Veterinary & Medicines", description: "Vet drugs, vaccines and equipment", createdById: superAdmin.id }
  });

  const supplierCatEquip = await prisma.supplierCategory.upsert({
    where: { companyId_code: { companyId: company.id, code: "EQUIP-SUP" } },
    update: {},
    create: { companyId: company.id, code: "EQUIP-SUP", name: "Equipment & Machinery", description: "Farm and processing equipment suppliers", createdById: superAdmin.id }
  });

  // Suppliers
  const supplier1 = await prisma.supplier.upsert({
    where: { companyId_code: { companyId: company.id, code: "SUP-001" } },
    update: {},
    create: {
      companyId: company.id, code: "SUP-001", name: "Akate Feed Ingredients Ltd", categoryId: supplierCatFeed.id,
      contactPerson: "Kwame Akate", phone: "0244000001", email: "info@akate.com",
      address: "Industrial Area, Accra", taxId: "C0012345678", bankName: "GCB Bank",
      bankAccount: "1234567890", paymentTermsDays: 30, status: "ACTIVE", leadTimeDays: 7,
      createdById: superAdmin.id
    }
  });

  const supplier2 = await prisma.supplier.upsert({
    where: { companyId_code: { companyId: company.id, code: "SUP-002" } },
    update: {},
    create: {
      companyId: company.id, code: "SUP-002", name: "VetCare Ghana Ltd", categoryId: supplierCatVet.id,
      contactPerson: "Dr. Ama Mensah", phone: "0244000002", email: "vetcare@ghana.com",
      address: "Ring Road, Kumasi", taxId: "C0098765432", paymentTermsDays: 14, status: "ACTIVE", leadTimeDays: 3,
      createdById: superAdmin.id
    }
  });

  const supplier3 = await prisma.supplier.upsert({
    where: { companyId_code: { companyId: company.id, code: "SUP-003" } },
    update: {},
    create: {
      companyId: company.id, code: "SUP-003", name: "AgriEquip Solutions", categoryId: supplierCatEquip.id,
      contactPerson: "Kofi Boateng", phone: "0244000003", email: "info@agriequip.com",
      address: "Spintex Road, Accra", paymentTermsDays: 45, status: "ACTIVE", leadTimeDays: 14,
      createdById: superAdmin.id
    }
  });

  // Purchase Request
  const purchaseRequest1 = await prisma.purchaseRequest.upsert({
    where: { companyId_reference: { companyId: company.id, reference: "PR-2025-0001" } },
    update: {},
    create: {
      companyId: company.id, reference: "PR-2025-0001",
      title: "Monthly Feed Ingredients Purchase",
      requestedById: superAdmin.id, branchId: accraBranch.id,
      requiredDate: daysAgo(-7),
      status: "APPROVED", totalEstimate: 45000,
      approvedById: superAdmin.id, approvedAt: daysAgo(3),
      createdById: superAdmin.id,
      items: {
        create: [
          { productName: "Soybean Meal 50kg bags", quantity: 200, uomCode: "BAG", estimatedUnitCost: 120, sequence: 1 },
          { productName: "Maize Grain", quantity: 500, uomCode: "KG", estimatedUnitCost: 3.5, sequence: 2 },
          { productName: "Fish Meal 25kg bags", quantity: 50, uomCode: "BAG", estimatedUnitCost: 280, sequence: 3 }
        ]
      }
    }
  });

  // Purchase Order
  const po1 = await prisma.purchaseOrder.upsert({
    where: { companyId_reference: { companyId: company.id, reference: "PO-2025-0001" } },
    update: {},
    create: {
      companyId: company.id, reference: "PO-2025-0001",
      supplierId: supplier1.id, purchaseRequestId: purchaseRequest1.id,
      orderDate: daysAgo(5), expectedDelivery: daysAgo(-2),
      status: "SENT_TO_SUPPLIER", subtotal: 43500, totalAmount: 43500, currency: "GHS",
      paymentTermsDays: 30, approvedById: superAdmin.id, approvedAt: daysAgo(4),
      createdById: superAdmin.id,
      items: {
        create: [
          { productName: "Soybean Meal 50kg bags", quantity: 200, unitCost: 118, lineTotal: 23600, uomCode: "BAG", sequence: 1 },
          { productName: "Maize Grain", quantity: 500, unitCost: 3.4, lineTotal: 1700, uomCode: "KG", sequence: 2 },
          { productName: "Fish Meal 25kg bags", quantity: 50, unitCost: 364, lineTotal: 18200, uomCode: "BAG", sequence: 3 }
        ]
      }
    }
  });

  // Supplier Invoice
  const inv1 = await prisma.supplierInvoice.upsert({
    where: { companyId_reference: { companyId: company.id, reference: "SINV-2025-0001" } },
    update: {},
    create: {
      companyId: company.id, reference: "SINV-2025-0001", supplierId: supplier2.id,
      invoiceNumber: "VC-INV-2024-0892", invoiceDate: daysAgo(10),
      dueDate: daysAgo(-4), subtotal: 8500, taxAmount: 0, totalAmount: 8500,
      paidAmount: 0, balanceDue: 8500, status: "PENDING",
      notes: "Vaccines and veterinary drugs Q4 2024",
      createdById: superAdmin.id
    }
  });

  // Performance records
  await prisma.supplierPerformanceRecord.upsert({
    where: { companyId_supplierId_period: { companyId: company.id, supplierId: supplier1.id, period: "2025-Q1" } },
    update: {},
    create: {
      companyId: company.id, supplierId: supplier1.id, period: "2025-Q1",
      rating: "GOOD", onTimeDelivery: true, qualityScore: 85,
      priceCompetitiveness: 78, responsiveness: 90,
      totalOrders: 8, lateDeliveries: 1, rejectedItems: 0,
      notes: "Reliable supplier, minor delay in February",
      reviewedById: superAdmin.id, createdById: superAdmin.id
    }
  });

  // Price history
  const priceHistoryCount = await prisma.supplierPriceHistory.count({ where: { companyId: company.id } });
  if (priceHistoryCount === 0) {
    await prisma.supplierPriceHistory.createMany({
      data: [
        { companyId: company.id, supplierId: supplier1.id, productName: "Soybean Meal 50kg bags", unitPrice: 118, currency: "GHS", effectiveDate: daysAgo(30), notes: "Q1 2025 agreed price", createdById: superAdmin.id },
        { companyId: company.id, supplierId: supplier1.id, productName: "Maize Grain", unitPrice: 3.4, currency: "GHS", effectiveDate: daysAgo(30), notes: "Current maize market price", createdById: superAdmin.id },
        { companyId: company.id, supplierId: supplier2.id, productName: "Newcastle Vaccine (100-dose vial)", unitPrice: 45, currency: "GHS", effectiveDate: daysAgo(60), notes: "Prev price", createdById: superAdmin.id },
        { companyId: company.id, supplierId: supplier2.id, productName: "Newcastle Vaccine (100-dose vial)", unitPrice: 48, currency: "GHS", effectiveDate: daysAgo(10), notes: "Current Q1 2025 price", createdById: superAdmin.id }
      ]
    });
  }

  // ─── HR Seed ────────────────────────────────────────────────────────────────

  // Employee Roles
  const rolePoultryWorker = await prisma.employeeRole.upsert({
    where: { companyId_code: { companyId: company.id, code: "EMP-ROLE-PW" } },
    update: {},
    create: { companyId: company.id, code: "EMP-ROLE-PW", name: "Poultry Worker", description: "Responsible for daily poultry farm activities", createdById: superAdmin.id }
  });

  const roleFeedOperator = await prisma.employeeRole.upsert({
    where: { companyId_code: { companyId: company.id, code: "EMP-ROLE-FO" } },
    update: {},
    create: { companyId: company.id, code: "EMP-ROLE-FO", name: "Feed Mill Operator", description: "Operates feed production machinery", createdById: superAdmin.id }
  });

  const roleDriver = await prisma.employeeRole.upsert({
    where: { companyId_code: { companyId: company.id, code: "EMP-ROLE-DR" } },
    update: {},
    create: { companyId: company.id, code: "EMP-ROLE-DR", name: "Driver / Logistics", description: "Transports produce and supplies", createdById: superAdmin.id }
  });

  // Shifts
  const morningShift = await prisma.shift.upsert({
    where: { companyId_code: { companyId: company.id, code: "SHIFT-MORN" } },
    update: {},
    create: { companyId: company.id, code: "SHIFT-MORN", name: "Morning Shift", startTime: "06:00", endTime: "14:00", branchId: ids.accraBranch, isActive: true, createdById: superAdmin.id }
  });

  const afternoonShift = await prisma.shift.upsert({
    where: { companyId_code: { companyId: company.id, code: "SHIFT-AFTN" } },
    update: {},
    create: { companyId: company.id, code: "SHIFT-AFTN", name: "Afternoon Shift", startTime: "14:00", endTime: "22:00", branchId: ids.accraBranch, isActive: true, createdById: superAdmin.id }
  });

  // Employees
  const emp1 = await prisma.employee.upsert({
    where: { companyId_code: { companyId: company.id, code: "EMP-001" } },
    update: {},
    create: {
      companyId: company.id, code: "EMP-001", firstName: "Kwabena", lastName: "Asante", fullName: "Kwabena Asante",
      phone: "0244000001", email: "k.asante@jokasfarms.com", gender: "MALE",
      nationalId: "GHA-000001-1", startDate: daysAgo(365), status: "ACTIVE",
      employeeRoleId: rolePoultryWorker.id, branchId: ids.accraBranch, farmId: ids.layerFarm,
      basicSalary: 1800, bankName: "GCB Bank", bankAccount: "1234567890",
      ssnitNumber: "P00001234", tinNumber: "C0000001234",
      emergencyContactName: "Abena Asante", emergencyContactPhone: "0244000002",
      createdById: superAdmin.id
    }
  });

  const emp2 = await prisma.employee.upsert({
    where: { companyId_code: { companyId: company.id, code: "EMP-002" } },
    update: {},
    create: {
      companyId: company.id, code: "EMP-002", firstName: "Akosua", lastName: "Mensah", fullName: "Akosua Mensah",
      phone: "0244000003", gender: "FEMALE",
      nationalId: "GHA-000002-2", startDate: daysAgo(200), status: "ACTIVE",
      employeeRoleId: roleFeedOperator.id, branchId: ids.accraBranch,
      basicSalary: 2200, bankName: "Ecobank", bankAccount: "0987654321",
      ssnitNumber: "P00002345", tinNumber: "C0000002345",
      emergencyContactName: "Kofi Mensah", emergencyContactPhone: "0244000004",
      createdById: superAdmin.id
    }
  });

  const emp3 = await prisma.employee.upsert({
    where: { companyId_code: { companyId: company.id, code: "EMP-003" } },
    update: {},
    create: {
      companyId: company.id, code: "EMP-003", firstName: "Emmanuel", lastName: "Boateng", fullName: "Emmanuel Boateng",
      phone: "0244000005", gender: "MALE",
      nationalId: "GHA-000003-3", startDate: daysAgo(90), status: "ACTIVE",
      employeeRoleId: roleDriver.id, branchId: ids.kumasiBranch,
      basicSalary: 1600,
      createdById: superAdmin.id
    }
  });

  // Attendance records (last 3 days for emp1 and emp2)
  for (const daysBack of [2, 1, 0]) {
    const date = daysAgo(daysBack);
    const dateStr = date.toISOString().slice(0, 10);
    await prisma.attendanceRecord.upsert({
      where: { companyId_employeeId_date: { companyId: company.id, employeeId: emp1.id, date: new Date(dateStr) } },
      update: {},
      create: {
        companyId: company.id, employeeId: emp1.id, date: new Date(dateStr),
        status: daysBack === 1 ? "LATE" : "PRESENT",
        checkInTime: new Date(`${dateStr}T06:${daysBack === 1 ? "25" : "00"}:00`),
        checkOutTime: new Date(`${dateStr}T14:00:00`),
        hoursWorked: daysBack === 1 ? 7.6 : 8.0,
        shiftId: morningShift.id, recordedById: superAdmin.id
      }
    });
    await prisma.attendanceRecord.upsert({
      where: { companyId_employeeId_date: { companyId: company.id, employeeId: emp2.id, date: new Date(dateStr) } },
      update: {},
      create: {
        companyId: company.id, employeeId: emp2.id, date: new Date(dateStr),
        status: "PRESENT",
        checkInTime: new Date(`${dateStr}T14:00:00`),
        checkOutTime: new Date(`${dateStr}T22:00:00`),
        hoursWorked: 8.0,
        shiftId: afternoonShift.id, recordedById: superAdmin.id
      }
    });
  }

  // Tasks
  let task1 = await prisma.task.findFirst({ where: { companyId: company.id, title: "Clean Layer House A" } });
  if (!task1) {
    task1 = await prisma.task.create({
      data: {
        companyId: company.id, title: "Clean Layer House A", description: "Deep cleaning of Layer House A including disinfection",
        taskType: "Cleaning", priority: "HIGH", status: "IN_PROGRESS",
        dueDate: daysAgo(-1), branchId: ids.accraBranch, farmId: ids.layerFarm,
        createdById: superAdmin.id
      }
    });
  }

  let task2 = await prisma.task.findFirst({ where: { companyId: company.id, title: "Feed Mill Equipment Check" } });
  if (!task2) {
    task2 = await prisma.task.create({
      data: {
        companyId: company.id, title: "Feed Mill Equipment Check", description: "Weekly equipment inspection and lubrication",
        taskType: "Maintenance Check", priority: "MEDIUM", status: "OPEN",
        dueDate: daysAgo(-3), createdById: superAdmin.id
      }
    });
  }

  // Task assignments
  if (task1) {
    const assignCount = await prisma.taskAssignment.count({ where: { taskId: task1.id, employeeId: emp1.id } });
    if (assignCount === 0) {
      await prisma.taskAssignment.create({
        data: { companyId: company.id, taskId: task1.id, employeeId: emp1.id, status: "IN_PROGRESS", assignedById: superAdmin.id }
      });
    }
  }

  if (task2) {
    const assignCount = await prisma.taskAssignment.count({ where: { taskId: task2.id, employeeId: emp2.id } });
    if (assignCount === 0) {
      await prisma.taskAssignment.create({
        data: { companyId: company.id, taskId: task2.id, employeeId: emp2.id, status: "ASSIGNED", assignedById: superAdmin.id }
      });
    }
  }

  // Payroll record
  await prisma.payrollRecord.upsert({
    where: { companyId_reference: { companyId: company.id, reference: "PAY-2025-0001" } },
    update: {},
    create: {
      companyId: company.id, reference: "PAY-2025-0001",
      employeeId: emp1.id, employeeName: emp1.fullName, employeeCode: emp1.code,
      period: "2025-01", periodStart: new Date("2025-01-01"), periodEnd: new Date("2025-01-31"),
      basicSalary: 1800, allowances: 200, deductions: 0,
      grossPay: 2000, taxDeduction: 240, ssnit: 110, netPay: 1650,
      paymentMethod: "BANK_TRANSFER", status: "APPROVED",
      notes: "January 2025 salary for Kwabena Asante",
      createdById: superAdmin.id
    }
  });

  // Training records
  const trainCount = await prisma.trainingRecord.count({ where: { companyId: company.id } });
  if (trainCount === 0) {
    await prisma.trainingRecord.createMany({
      data: [
        { companyId: company.id, employeeId: emp1.id, title: "Poultry Biosecurity Fundamentals", trainer: "Dr. Abena Owusu", trainingDate: daysAgo(60), durationHours: 8, outcome: "PASSED", certificate: "CERT-BIOSEC-2025-001", createdById: superAdmin.id },
        { companyId: company.id, employeeId: emp2.id, title: "Feed Mill Safety & Operations", trainer: "Mr. Kofi Mensah", trainingDate: daysAgo(45), durationHours: 16, outcome: "PASSED", createdById: superAdmin.id },
        { companyId: company.id, employeeId: emp3.id, title: "Defensive Driving for Farm Logistics", trainer: "DVLA Accredited Trainer", trainingDate: daysAgo(30), durationHours: 12, outcome: "PASSED", certificate: "CERT-DRV-2025-003", createdById: superAdmin.id }
      ]
    });
  }

  // HR Performance records
  await prisma.hRPerformanceRecord.upsert({
    where: { companyId_employeeId_period: { companyId: company.id, employeeId: emp1.id, period: "2025-Q1" } },
    update: {},
    create: {
      companyId: company.id, employeeId: emp1.id, period: "2025-Q1",
      overallRating: "MEETS_EXPECTATIONS",
      attendanceScore: 88, taskCompletionScore: 92, qualityScore: 85, teamworkScore: 90,
      comments: "Consistently reliable worker, minor attendance issue in February resolved",
      goals: "Achieve zero late arrivals in Q2; complete advanced biosecurity training",
      status: "ACKNOWLEDGED", reviewerId: superAdmin.id, createdById: superAdmin.id
    }
  });

  // ─── Quality Control Seed ────────────────────────────────────────────────────

  // Templates
  const tmplRawMaterial = await prisma.qualityCheckTemplate.upsert({
    where: { companyId_code: { companyId: company.id, code: "QT-RM-001" } },
    update: {},
    create: {
      companyId: company.id, code: "QT-RM-001", name: "Raw Material Intake Inspection",
      checkType: "RAW_MATERIAL", isActive: true,
      description: "Standard inspection for incoming raw materials (feed ingredients)",
      createdById: superAdmin.id,
      parameters: {
        create: [
          { companyId: company.id, paramCode: "RM-MOISTURE", name: "Moisture Content", paramType: "PERCENTAGE", unit: "%", minValue: 0, maxValue: 14, isRequired: true, sortOrder: 0, createdById: superAdmin.id },
          { companyId: company.id, paramCode: "RM-FOREIGN", name: "Foreign Matter", paramType: "BOOLEAN", isRequired: true, sortOrder: 1, notes: "Pass = No foreign matter detected", createdById: superAdmin.id },
          { companyId: company.id, paramCode: "RM-AFLATOXIN", name: "Aflatoxin Level", paramType: "NUMERIC", unit: "ppb", minValue: 0, maxValue: 10, isRequired: true, sortOrder: 2, createdById: superAdmin.id },
          { companyId: company.id, paramCode: "RM-PROTEIN", name: "Crude Protein", paramType: "PERCENTAGE", unit: "%", minValue: 45, maxValue: 55, isRequired: false, sortOrder: 3, createdById: superAdmin.id },
        ],
      },
    },
    include: { parameters: true },
  });

  const tmplFeed = await prisma.qualityCheckTemplate.upsert({
    where: { companyId_code: { companyId: company.id, code: "QT-FP-001" } },
    update: {},
    create: {
      companyId: company.id, code: "QT-FP-001", name: "Feed Production Quality Check",
      checkType: "FEED_PRODUCTION", isActive: true,
      description: "Quality check for completed feed production batches",
      createdById: superAdmin.id,
      parameters: {
        create: [
          { companyId: company.id, paramCode: "FP-PELLET", name: "Pellet Durability Index", paramType: "PERCENTAGE", unit: "%", minValue: 85, maxValue: 100, isRequired: true, sortOrder: 0, createdById: superAdmin.id },
          { companyId: company.id, paramCode: "FP-MOISTURE", name: "Moisture Content", paramType: "PERCENTAGE", unit: "%", minValue: 0, maxValue: 12, isRequired: true, sortOrder: 1, createdById: superAdmin.id },
          { companyId: company.id, paramCode: "FP-PROTEIN", name: "Crude Protein", paramType: "PERCENTAGE", unit: "%", minValue: 18, maxValue: 22, isRequired: true, sortOrder: 2, createdById: superAdmin.id },
          { companyId: company.id, paramCode: "FP-APPEARANCE", name: "Visual Appearance", paramType: "BOOLEAN", isRequired: true, sortOrder: 3, notes: "Pass = No discolouration, mould or clumping", createdById: superAdmin.id },
        ],
      },
    },
    include: { parameters: true },
  });

  const tmplGRN = await prisma.qualityCheckTemplate.upsert({
    where: { companyId_code: { companyId: company.id, code: "QT-GR-001" } },
    update: {},
    create: {
      companyId: company.id, code: "QT-GR-001", name: "Goods Received Inspection",
      checkType: "GOODS_RECEIVED", isActive: true,
      description: "Inspection for goods received from suppliers",
      createdById: superAdmin.id,
      parameters: {
        create: [
          { companyId: company.id, paramCode: "GR-QTY", name: "Quantity Correct", paramType: "BOOLEAN", isRequired: true, sortOrder: 0, createdById: superAdmin.id },
          { companyId: company.id, paramCode: "GR-PACKAGING", name: "Packaging Intact", paramType: "BOOLEAN", isRequired: true, sortOrder: 1, createdById: superAdmin.id },
          { companyId: company.id, paramCode: "GR-EXPIRY", name: "Expiry Date Acceptable", paramType: "BOOLEAN", isRequired: true, sortOrder: 2, createdById: superAdmin.id },
          { companyId: company.id, paramCode: "GR-CONDITION", name: "General Condition Score", paramType: "NUMERIC", unit: "/10", minValue: 7, maxValue: 10, isRequired: true, sortOrder: 3, createdById: superAdmin.id },
        ],
      },
    },
    include: { parameters: true },
  });

  // Quality Checks
  const qcCount = await prisma.qualityCheck.count({ where: { companyId: company.id } });

  const qc1 = await prisma.qualityCheck.upsert({
    where: { companyId_reference: { companyId: company.id, reference: "QC-2025-0001" } },
    update: {},
    create: {
      companyId: company.id, reference: "QC-2025-0001",
      checkType: "RAW_MATERIAL",
      templateId: tmplRawMaterial.id,
      batchNumber: "RM-BATCH-2025-001",
      status: "PASSED",
      decision: "APPROVED",
      passedParameters: 4, totalParameters: 4, overallScore: 100,
      inspectorId: superAdmin.id,
      approvedById: superAdmin.id,
      checkedAt: daysAgo(15), approvedAt: daysAgo(15),
      branchId: ids.accraBranch,
      summary: "All raw material parameters within acceptable range",
      notes: "Soybean meal batch from Akate Agro — excellent quality",
      createdById: superAdmin.id,
    },
  });

  // Results for qc1
  if (tmplRawMaterial.parameters.length > 0) {
    const resultData = [
      { paramCode: "RM-MOISTURE", actualValue: "11.2", passed: true },
      { paramCode: "RM-FOREIGN", actualValue: "true", passed: true },
      { paramCode: "RM-AFLATOXIN", actualValue: "3.5", passed: true },
      { paramCode: "RM-PROTEIN", actualValue: "48.6", passed: true },
    ];
    for (const rd of resultData) {
      const param = tmplRawMaterial.parameters.find((p) => p.paramCode === rd.paramCode);
      if (!param) continue;
      const existing = await prisma.qualityInspectionResult.findFirst({ where: { checkId: qc1.id, parameterId: param.id } });
      if (!existing) {
        await prisma.qualityInspectionResult.create({
          data: { companyId: company.id, checkId: qc1.id, parameterId: param.id, actualValue: rd.actualValue, passed: rd.passed }
        });
      }
    }
  }

  // Approved batch for qc1
  await prisma.approvedBatch.upsert({
    where: { companyId_reference: { companyId: company.id, reference: "APB-2025-0001" } },
    update: {},
    create: {
      companyId: company.id, reference: "APB-2025-0001", checkId: qc1.id,
      referenceType: "RawMaterial", batchNumber: "RM-BATCH-2025-001",
      quantity: 500, unitOfMeasure: "kg",
      approvedById: superAdmin.id, approvalNotes: "All parameters passed. Cleared for production.",
      createdById: superAdmin.id,
    },
  }).catch(() => undefined);

  const qc2 = await prisma.qualityCheck.upsert({
    where: { companyId_reference: { companyId: company.id, reference: "QC-2025-0002" } },
    update: {},
    create: {
      companyId: company.id, reference: "QC-2025-0002",
      checkType: "RAW_MATERIAL",
      templateId: tmplRawMaterial.id,
      batchNumber: "RM-BATCH-2025-002",
      status: "FAILED",
      decision: "REJECTED",
      passedParameters: 2, totalParameters: 4, overallScore: 50,
      inspectorId: superAdmin.id,
      approvedById: superAdmin.id,
      checkedAt: daysAgo(8), approvedAt: daysAgo(8),
      branchId: ids.accraBranch,
      notes: "High aflatoxin level and moisture content exceeded limits",
      createdById: superAdmin.id,
    },
  });

  // Rejected batch for qc2
  const rejBatch = await prisma.rejectedBatch.upsert({
    where: { companyId_reference: { companyId: company.id, reference: "RJB-2025-0001" } },
    update: {},
    create: {
      companyId: company.id, reference: "RJB-2025-0001", checkId: qc2.id,
      referenceType: "RawMaterial", batchNumber: "RM-BATCH-2025-002",
      rejectionReason: "Aflatoxin level (18ppb) exceeded maximum allowable limit (10ppb). Moisture content (16.5%) above accepted range.",
      disposalMethod: "RETURN_TO_SUPPLIER",
      quantity: 1000, unitOfMeasure: "kg", estimatedValue: 3500,
      createdById: superAdmin.id,
    },
  }).catch(async () => prisma.rejectedBatch.findFirst({ where: { companyId: company.id, reference: "RJB-2025-0001" } }));

  // Feed production QC
  const qc3 = await prisma.qualityCheck.upsert({
    where: { companyId_reference: { companyId: company.id, reference: "QC-2025-0003" } },
    update: {},
    create: {
      companyId: company.id, reference: "QC-2025-0003",
      checkType: "FEED_PRODUCTION",
      templateId: tmplFeed.id,
      batchNumber: "FP-BATCH-2025-010",
      status: "CONDITIONALLY_PASSED",
      decision: "CONDITIONALLY_APPROVED",
      passedParameters: 3, totalParameters: 4, overallScore: 75,
      inspectorId: superAdmin.id,
      checkedAt: daysAgo(3),
      branchId: ids.accraBranch,
      notes: "Conditions: Pellet durability marginally below spec. Approved for immediate use. Not for long-term storage.",
      createdById: superAdmin.id,
    },
  });

  // Corrective action linked to rejected batch
  if (rejBatch) {
    await prisma.correctiveAction.upsert({
      where: { companyId_reference: { companyId: company.id, reference: "CA-2025-0001" } },
      update: {},
      create: {
        companyId: company.id, reference: "CA-2025-0001",
        checkId: qc2.id,
        rejectedBatchId: rejBatch.id,
        title: "Supplier Aflatoxin Control Audit",
        description: "Conduct audit of Akate Agro's storage and handling practices to identify source of aflatoxin contamination in batch RM-BATCH-2025-002.",
        rootCause: "Suspected inadequate storage conditions at supplier warehouse leading to mould growth and aflatoxin production.",
        preventiveMeasure: "Require supplier to submit storage compliance certificate. Increase incoming inspection frequency for next 3 deliveries.",
        priority: "HIGH",
        status: "OPEN",
        dueDate: daysAgo(-7),
        createdById: superAdmin.id,
      },
    });
  }

  // Lab report
  await prisma.labReportUpload.upsert({
    where: { companyId_reportNumber: { companyId: company.id, reportNumber: "LAB-2025-0089" } },
    update: {},
    create: {
      companyId: company.id, checkId: qc2.id,
      reportNumber: "LAB-2025-0089",
      labName: "Ghana Standards Authority Laboratory",
      reportDate: daysAgo(7),
      fileType: "PDF",
      summary: "Aflatoxin total: 18ppb (LIMIT: 10ppb). Moisture: 16.5% (LIMIT: 14%). Batch FAILS food safety standards.",
      findings: "B1 Aflatoxin: 12ppb, B2 Aflatoxin: 6ppb. Elevated moisture indicates poor storage. Foreign matter: NIL. Crude protein: 46.2% (PASS).",
      recommendations: "Batch must not enter food production chain. Return to supplier or destroy. Inspect supplier storage facility.",
      uploadedById: superAdmin.id,
    },
  });
}

main()
  .then(async () => prisma.$disconnect())
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });

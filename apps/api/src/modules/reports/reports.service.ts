import { ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { AuthenticatedUser, PERMISSIONS, PermissionKey } from "@jokas/shared";
import { Prisma } from "@prisma/client";
import { AuditService } from "../audit/audit.service";
import { PrismaService } from "../prisma/prisma.service";
import { ReportQueryDto } from "./dto/report-query.dto";

type RequestContext = {
  ipAddress?: string;
  userAgent?: string;
};

type ReportCategory = "Poultry" | "Feed" | "Soya" | "Inventory" | "Sales and Finance";

type Column = {
  key: string;
  label: string;
  type?: "text" | "number" | "money" | "date" | "percent";
};

type ReportDefinition = {
  id: string;
  title: string;
  category: ReportCategory;
  description: string;
  permission: PermissionKey;
  model: string;
  dateField?: string;
  productField?: string;
  customerField?: string;
  supplierField?: string;
  columns: Column[];
  map: (row: Record<string, unknown>) => Record<string, unknown>;
  filter?: (row: Record<string, unknown>) => boolean;
  chart?: { labelKey: string; valueKey: string; title: string };
};

type ReportResult = {
  definition: Omit<ReportDefinition, "map" | "filter">;
  rows: Record<string, unknown>[];
  totals: Record<string, number>;
  chart?: { title: string; labels: string[]; values: number[] };
};

const REPORTS: ReportDefinition[] = [
  report("poultry.daily", "Daily Poultry Report", "Poultry", PERMISSIONS.POULTRY_READ, "dailyPoultryRecord", "recordDate", [
    col("recordDate", "Date", "date"), col("farmId", "Farm"), col("poultryHouseId", "House"), col("flockBatchId", "Flock"), col("openingBirdCount", "Opening Birds", "number"), col("mortalityCount", "Mortality", "number"), col("culledCount", "Culls", "number"), col("feedConsumedKg", "Feed Kg", "number"), col("totalEggs", "Eggs", "number"), col("status", "Status")
  ], (row) => row, { labelKey: "recordDate", valueKey: "totalEggs", title: "Eggs by day" }),
  report("poultry.flock-performance", "Flock Performance Report", "Poultry", PERMISSIONS.POULTRY_READ, "flockBatch", "startDate", [
    col("code", "Code"), col("name", "Flock"), col("birdType", "Bird Type"), col("farmId", "Farm"), col("poultryHouseId", "House"), col("openingBirdCount", "Opening Birds", "number"), col("startDate", "Start Date", "date"), col("status", "Status")
  ], (row) => row, { labelKey: "name", valueKey: "openingBirdCount", title: "Flock size" }),
  report("poultry.mortality", "Mortality Report", "Poultry", PERMISSIONS.POULTRY_READ, "mortalityRecord", "recordDate", [
    col("recordDate", "Date", "date"), col("farmId", "Farm"), col("poultryHouseId", "House"), col("flockBatchId", "Flock"), col("birdCount", "Birds", "number"), col("isCulling", "Culling"), col("reason", "Reason"), col("status", "Status")
  ], (row) => row, { labelKey: "recordDate", valueKey: "birdCount", title: "Mortality trend" }),
  report("poultry.egg-production", "Egg Production Report", "Poultry", PERMISSIONS.POULTRY_READ, "eggProductionRecord", "recordDate", [
    col("recordDate", "Date", "date"), col("farmId", "Farm"), col("poultryHouseId", "House"), col("flockBatchId", "Flock"), col("goodEggs", "Good", "number"), col("crackedEggs", "Cracked", "number"), col("dirtyEggs", "Dirty", "number"), col("brokenEggs", "Broken", "number"), col("rejectedEggs", "Rejected", "number")
  ], (row) => ({ ...row, totalEggs: n(row.goodEggs) + n(row.crackedEggs) + n(row.dirtyEggs) + n(row.brokenEggs) + n(row.rejectedEggs) }), { labelKey: "recordDate", valueKey: "totalEggs", title: "Total eggs" }),
  report("poultry.feed-consumption", "Feed Consumption Report", "Poultry", PERMISSIONS.POULTRY_READ, "feedConsumptionRecord", "recordDate", [
    col("recordDate", "Date", "date"), col("farmId", "Farm"), col("flockBatchId", "Flock"), col("feedProductId", "Feed Product"), col("quantityKg", "Quantity Kg", "number"), col("costAmount", "Cost", "money"), col("status", "Status")
  ], (row) => row, { labelKey: "recordDate", valueKey: "quantityKg", title: "Feed consumed" }, "feedProductId"),
  report("poultry.vaccination", "Vaccination Report", "Poultry", PERMISSIONS.HEALTH_READ, "vaccinationRecord", "vaccinationDate", [
    col("vaccinationDate", "Date", "date"), col("farmId", "Farm"), col("flockBatchId", "Flock"), col("vaccineName", "Vaccine"), col("dose", "Dose"), col("nextDueDate", "Next Due", "date"), col("status", "Status")
  ], (row) => row),
  report("poultry.medication", "Medication Report", "Poultry", PERMISSIONS.HEALTH_READ, "medicationRecord", "startDate", [
    col("startDate", "Start", "date"), col("endDate", "End", "date"), col("farmId", "Farm"), col("flockBatchId", "Flock"), col("medicationName", "Medication"), col("dosage", "Dosage"), col("route", "Route"), col("status", "Status")
  ], (row) => row),
  report("poultry.profitability", "Poultry Profitability Report", "Poultry", PERMISSIONS.FINANCE_READ, "poultryCostRecord", "costDate", [
    col("costDate", "Date", "date"), col("farmId", "Farm"), col("flockBatchId", "Flock"), col("costType", "Cost Type"), col("amount", "Cost", "money"), col("description", "Description"), col("status", "Status")
  ], (row) => row, { labelKey: "costType", valueKey: "amount", title: "Poultry costs" }),
  report("poultry.farm-comparison", "Farm Comparison Report", "Poultry", PERMISSIONS.POULTRY_READ, "dailyPoultryRecord", "recordDate", [
    col("farmId", "Farm"), col("mortalityCount", "Mortality", "number"), col("feedConsumedKg", "Feed Kg", "number"), col("totalEggs", "Eggs", "number")
  ], (row) => row, { labelKey: "farmId", valueKey: "totalEggs", title: "Farm production comparison" }),

  report("feed.production", "Feed Production Report", "Feed", PERMISSIONS.FEED_READ, "feedProductionBatch", "productionDate", [
    col("productionDate", "Date", "date"), col("productionSiteId", "Production Site"), col("batchNumber", "Batch"), col("finishedProductId", "Product"), col("producedQuantityKg", "Produced Kg", "number"), col("wastageKg", "Wastage Kg", "number"), col("status", "Status")
  ], (row) => row, { labelKey: "batchNumber", valueKey: "producedQuantityKg", title: "Feed produced" }, "finishedProductId"),
  report("feed.formula-costing", "Formula Costing Report", "Feed", PERMISSIONS.FEED_READ, "feedFormulaVersion", "createdAt", [
    col("formulaId", "Formula"), col("versionNo", "Version", "number"), col("status", "Status"), col("costPer100Kg", "Cost / 100kg", "money"), col("costPer50KgBag", "Cost / 50kg", "money"), col("createdAt", "Created", "date")
  ], (row) => row, { labelKey: "formulaId", valueKey: "costPer100Kg", title: "Formula cost" }),
  report("feed.raw-material-usage", "Raw Material Usage Report", "Feed", PERMISSIONS.FEED_READ, "feedRawMaterialUsage", "createdAt", [
    col("createdAt", "Date", "date"), col("productionSiteId", "Production Site"), col("productionBatchId", "Batch"), col("rawMaterialId", "Raw Material"), col("quantityKg", "Quantity Kg", "number"), col("unitCost", "Unit Cost", "money"), col("wastageKg", "Wastage Kg", "number")
  ], (row) => row, { labelKey: "rawMaterialId", valueKey: "quantityKg", title: "Raw material usage" }, "rawMaterialId"),
  report("feed.finished-stock", "Finished Feed Stock Report", "Feed", PERMISSIONS.FEED_READ, "finishedFeedStock", "createdAt", [
    col("createdAt", "Date", "date"), col("productionSiteId", "Production Site"), col("warehouseId", "Warehouse"), col("productId", "Product"), col("quantityKg", "Quantity Kg", "number"), col("bag50KgCount", "50kg Bags", "number"), col("unitCost", "Unit Cost", "money")
  ], (row) => row, { labelKey: "productId", valueKey: "quantityKg", title: "Finished feed stock" }),
  report("feed.quality", "Feed Quality Report", "Feed", PERMISSIONS.QUALITY_READ, "feedQualityCheck", "checkedAt", [
    col("checkedAt", "Checked", "date"), col("productionSiteId", "Production Site"), col("productionBatchId", "Batch"), col("moisturePercent", "Moisture %", "percent"), col("proteinPercent", "Protein %", "percent"), col("status", "Status"), col("textureNotes", "Notes")
  ], (row) => row),
  report("feed.profitability", "Feed Profitability Report", "Feed", PERMISSIONS.FINANCE_READ, "feedProductionCost", "createdAt", [
    col("createdAt", "Date", "date"), col("productionSiteId", "Production Site"), col("productionBatchId", "Batch"), col("rawMaterialCost", "Raw Material", "money"), col("laborCost", "Labor", "money"), col("packagingCost", "Packaging", "money"), col("overheadCost", "Overhead", "money"), col("expectedSalesValue", "Expected Sales", "money"), col("grossMargin", "Gross Margin", "money")
  ], (row) => ({ ...row, grossMargin: n(row.expectedSalesValue) - n(row.rawMaterialCost) - n(row.laborCost) - n(row.packagingCost) - n(row.overheadCost) }), { labelKey: "productionBatchId", valueKey: "grossMargin", title: "Feed margin" }),

  report("soya.bean-intake", "Soya Beans Intake Report", "Soya", PERMISSIONS.SOYA_READ, "soyaBeanIntake", "receivedAt", [
    col("receivedAt", "Received", "date"), col("productionSiteId", "Production Site"), col("warehouseId", "Warehouse"), col("supplierName", "Supplier"), col("quantityKg", "Quantity Kg", "number"), col("unitCost", "Unit Cost", "money"), col("totalCost", "Total Cost", "money"), col("moisturePercent", "Moisture %", "percent"), col("qualityStatus", "Quality")
  ], (row) => row, { labelKey: "supplierName", valueKey: "quantityKg", title: "Bean intake" }, "productId"),
  report("soya.oil-production", "Soya Oil Production Report", "Soya", PERMISSIONS.SOYA_READ, "soyaOilOutput", "createdAt", [
    col("createdAt", "Date", "date"), col("productionSiteId", "Production Site"), col("warehouseId", "Warehouse"), col("productId", "Product"), col("quantityLitres", "Litres", "number"), col("unitCost", "Unit Cost", "money")
  ], (row) => row, { labelKey: "createdAt", valueKey: "quantityLitres", title: "Oil output" }),
  report("soya.cake-production", "Soya Cake Production Report", "Soya", PERMISSIONS.SOYA_READ, "soyaCakeOutput", "createdAt", [
    col("createdAt", "Date", "date"), col("productionSiteId", "Production Site"), col("warehouseId", "Warehouse"), col("productId", "Product"), col("quantityKg", "Quantity Kg", "number"), col("unitCost", "Unit Cost", "money")
  ], (row) => row, { labelKey: "createdAt", valueKey: "quantityKg", title: "Cake output" }),
  report("soya.yield", "Soya Yield Report", "Soya", PERMISSIONS.SOYA_READ, "soyaProcessingBatch", "processingDate", [
    col("processingDate", "Date", "date"), col("productionSiteId", "Production Site"), col("batchNumber", "Batch"), col("beansUsedKg", "Beans Used Kg", "number"), col("status", "Status")
  ], (row) => row, { labelKey: "batchNumber", valueKey: "beansUsedKg", title: "Beans processed" }),
  report("soya.wastage", "Soya Wastage Report", "Soya", PERMISSIONS.SOYA_READ, "soyaWasteRecord", "createdAt", [
    col("createdAt", "Date", "date"), col("productionSiteId", "Production Site"), col("productionBatchId", "Batch"), col("quantityKg", "Wastage Kg", "number"), col("reason", "Reason")
  ], (row) => row, { labelKey: "productionBatchId", valueKey: "quantityKg", title: "Soya wastage" }),
  report("soya.profitability", "Soya Profitability Report", "Soya", PERMISSIONS.FINANCE_READ, "soyaProductionCost", "createdAt", [
    col("createdAt", "Date", "date"), col("productionSiteId", "Production Site"), col("productionBatchId", "Batch"), col("rawBeanCost", "Raw Beans", "money"), col("laborCost", "Labor", "money"), col("packagingCost", "Packaging", "money"), col("overheadCost", "Overhead", "money"), col("expectedOilSalesValue", "Oil Sales", "money"), col("expectedCakeSalesValue", "Cake Sales", "money"), col("grossMargin", "Gross Margin", "money")
  ], (row) => ({ ...row, grossMargin: n(row.expectedOilSalesValue) + n(row.expectedCakeSalesValue) - n(row.rawBeanCost) - n(row.laborCost) - n(row.packagingCost) - n(row.overheadCost) }), { labelKey: "productionBatchId", valueKey: "grossMargin", title: "Soya margin" }),

  report("inventory.stock-balance", "Stock Balance Report", "Inventory", PERMISSIONS.INVENTORY_READ, "inventoryItem", "updatedAt", [
    col("warehouseId", "Warehouse"), col("farmId", "Farm"), col("productionSiteId", "Production Site"), col("productId", "Product"), col("quantityOnHand", "On Hand", "number"), col("reorderLevel", "Reorder Level", "number"), col("status", "Status")
  ], (row) => row, { labelKey: "productId", valueKey: "quantityOnHand", title: "Stock balance" }),
  report("inventory.stock-movement", "Stock Movement Report", "Inventory", PERMISSIONS.INVENTORY_READ, "stockMovement", "createdAt", [
    col("createdAt", "Date", "date"), col("warehouseId", "Warehouse"), col("productId", "Product"), col("movementType", "Movement"), col("quantity", "Quantity", "number"), col("unitCost", "Unit Cost", "money"), col("referenceType", "Reference")
  ], (row) => row, { labelKey: "movementType", valueKey: "quantity", title: "Stock movements" }),
  report("inventory.low-stock", "Low Stock Report", "Inventory", PERMISSIONS.INVENTORY_READ, "inventoryItem", "updatedAt", [
    col("warehouseId", "Warehouse"), col("productId", "Product"), col("quantityOnHand", "On Hand", "number"), col("reorderLevel", "Reorder Level", "number"), col("status", "Status")
  ], (row) => row, { labelKey: "productId", valueKey: "quantityOnHand", title: "Low stock" }, undefined, (row) => n(row.quantityOnHand) <= n(row.reorderLevel)),
  report("inventory.expiry", "Expiry Report", "Inventory", PERMISSIONS.INVENTORY_READ, "stockBatch", "expiryDate", [
    col("expiryDate", "Expiry", "date"), col("warehouseId", "Warehouse"), col("productId", "Product"), col("batchNumber", "Batch"), col("quantityRemaining", "Remaining", "number"), col("unitCost", "Unit Cost", "money"), col("status", "Status")
  ], (row) => row, { labelKey: "batchNumber", valueKey: "quantityRemaining", title: "Expiring stock" }),
  report("inventory.valuation", "Inventory Valuation Report", "Inventory", PERMISSIONS.FINANCE_READ, "inventoryItem", "updatedAt", [
    col("warehouseId", "Warehouse"), col("productId", "Product"), col("quantityOnHand", "On Hand", "number"), col("estimatedValue", "Estimated Value", "money"), col("status", "Status")
  ], (row) => ({ ...row, estimatedValue: n(row.quantityOnHand) }), { labelKey: "productId", valueKey: "estimatedValue", title: "Inventory value" }),
  report("inventory.warehouse-comparison", "Warehouse Comparison Report", "Inventory", PERMISSIONS.INVENTORY_READ, "inventoryItem", "updatedAt", [
    col("warehouseId", "Warehouse"), col("productId", "Product"), col("quantityOnHand", "On Hand", "number"), col("status", "Status")
  ], (row) => row, { labelKey: "warehouseId", valueKey: "quantityOnHand", title: "Warehouse stock comparison" }),

  report("sales.sales", "Sales Report", "Sales and Finance", PERMISSIONS.SALES_READ, "salesOrder", "orderDate", [
    col("orderDate", "Date", "date"), col("branchId", "Branch"), col("warehouseId", "Warehouse"), col("customerId", "Customer"), col("orderNumber", "Order"), col("status", "Status"), col("totalAmount", "Total", "money"), col("paidAmount", "Paid", "money"), col("balanceDue", "Balance", "money")
  ], (row) => row, { labelKey: "orderDate", valueKey: "totalAmount", title: "Sales trend" }, undefined, undefined, "customerId"),
  report("sales.customer-statement", "Customer Statement", "Sales and Finance", PERMISSIONS.SALES_READ, "customerStatement", "entryDate", [
    col("entryDate", "Date", "date"), col("branchId", "Branch"), col("customerId", "Customer"), col("entryType", "Type"), col("debit", "Debit", "money"), col("credit", "Credit", "money"), col("balance", "Balance", "money"), col("description", "Description")
  ], (row) => row, { labelKey: "entryDate", valueKey: "balance", title: "Customer balance" }, undefined, undefined, "customerId"),
  report("sales.debtors", "Debtors Report", "Sales and Finance", PERMISSIONS.FINANCE_READ, "invoice", "invoiceDate", [
    col("invoiceDate", "Invoice Date", "date"), col("dueDate", "Due Date", "date"), col("branchId", "Branch"), col("customerId", "Customer"), col("invoiceNumber", "Invoice"), col("status", "Status"), col("totalAmount", "Total", "money"), col("paidAmount", "Paid", "money"), col("balanceDue", "Balance", "money")
  ], (row) => row, { labelKey: "customerId", valueKey: "balanceDue", title: "Customer debt" }, undefined, (row) => n(row.balanceDue) > 0, "customerId"),
  report("finance.supplier-payment", "Supplier Payment Report", "Sales and Finance", PERMISSIONS.FINANCE_READ, "supplierPayment", "paymentDate", [
    col("paymentDate", "Date", "date"), col("supplierName", "Supplier"), col("reference", "Reference"), col("paymentMethod", "Method"), col("amount", "Amount", "money"), col("purchaseOrderRef", "Purchase Order"), col("description", "Description")
  ], (row) => row, { labelKey: "supplierName", valueKey: "amount", title: "Supplier payments" }),
  report("finance.expense", "Expense Report", "Sales and Finance", PERMISSIONS.FINANCE_READ, "expense", "expenseDate", [
    col("expenseDate", "Date", "date"), col("branchId", "Branch"), col("reference", "Reference"), col("description", "Description"), col("vendorName", "Vendor"), col("paymentMethod", "Method"), col("status", "Status"), col("amount", "Amount", "money")
  ], (row) => row, { labelKey: "expenseDate", valueKey: "amount", title: "Expenses" }),
  report("finance.profit-loss", "Profit and Loss Report", "Sales and Finance", PERMISSIONS.FINANCE_READ, "profitLossReport", "periodEnd", [
    col("title", "Title"), col("periodStart", "Start", "date"), col("periodEnd", "End", "date"), col("totalRevenue", "Revenue", "money"), col("totalExpenses", "Expenses", "money"), col("grossProfit", "Gross Profit", "money"), col("netProfit", "Net Profit", "money")
  ], (row) => row, { labelKey: "title", valueKey: "netProfit", title: "Net profit" }),
  report("finance.cash-flow", "Cash Flow Report", "Sales and Finance", PERMISSIONS.FINANCE_READ, "cashFlowReport", "periodEnd", [
    col("title", "Title"), col("periodStart", "Start", "date"), col("periodEnd", "End", "date"), col("openingBalance", "Opening", "money"), col("operatingCashFlow", "Operating", "money"), col("investingCashFlow", "Investing", "money"), col("financingCashFlow", "Financing", "money"), col("netCashFlow", "Net Cash Flow", "money"), col("closingBalance", "Closing", "money")
  ], (row) => row, { labelKey: "title", valueKey: "netCashFlow", title: "Net cash flow" }),
  report("finance.product-margin", "Product Margin Report", "Sales and Finance", PERMISSIONS.FINANCE_READ, "productProfitability", "periodEnd", [
    col("productName", "Product"), col("productCode", "Code"), col("periodStart", "Start", "date"), col("periodEnd", "End", "date"), col("unitsSold", "Units Sold", "number"), col("totalRevenue", "Revenue", "money"), col("totalCost", "Cost", "money"), col("grossProfit", "Gross Profit", "money"), col("margin", "Margin %", "percent")
  ], (row) => row, { labelKey: "productName", valueKey: "grossProfit", title: "Product gross profit" })
];

const MODEL_FIELDS: Record<string, string[]> = {
  dailyPoultryRecord: ["companyId", "branchId", "farmId", "poultryHouseId", "flockBatchId", "deletedAt"],
  flockBatch: ["companyId", "branchId", "farmId", "poultryHouseId", "deletedAt"],
  mortalityRecord: ["companyId", "branchId", "farmId", "poultryHouseId", "flockBatchId", "deletedAt"],
  eggProductionRecord: ["companyId", "branchId", "farmId", "poultryHouseId", "flockBatchId", "deletedAt"],
  feedConsumptionRecord: ["companyId", "branchId", "farmId", "poultryHouseId", "flockBatchId", "feedProductId", "deletedAt"],
  vaccinationRecord: ["companyId", "branchId", "farmId", "poultryHouseId", "flockBatchId", "deletedAt"],
  medicationRecord: ["companyId", "branchId", "farmId", "poultryHouseId", "flockBatchId", "deletedAt"],
  poultryCostRecord: ["companyId", "branchId", "farmId", "poultryHouseId", "flockBatchId", "deletedAt"],
  feedProductionBatch: ["companyId", "branchId", "productionSiteId", "finishedProductId", "deletedAt"],
  feedFormulaVersion: ["companyId", "formulaId"],
  feedRawMaterialUsage: ["companyId", "branchId", "productionSiteId", "rawMaterialId", "deletedAt"],
  finishedFeedStock: ["companyId", "branchId", "productionSiteId", "warehouseId", "productId", "deletedAt"],
  feedQualityCheck: ["companyId", "branchId", "productionSiteId", "deletedAt"],
  feedProductionCost: ["companyId", "branchId", "productionSiteId", "deletedAt"],
  soyaBeanIntake: ["companyId", "branchId", "productionSiteId", "warehouseId", "productId", "deletedAt"],
  soyaOilOutput: ["companyId", "branchId", "productionSiteId", "warehouseId", "productId", "deletedAt"],
  soyaCakeOutput: ["companyId", "branchId", "productionSiteId", "warehouseId", "productId", "deletedAt"],
  soyaProcessingBatch: ["companyId", "branchId", "productionSiteId", "beanProductId", "deletedAt"],
  soyaWasteRecord: ["companyId", "branchId", "productionSiteId", "deletedAt"],
  soyaQualityCheck: ["companyId", "branchId", "productionSiteId", "deletedAt"],
  soyaProductionCost: ["companyId", "branchId", "productionSiteId", "deletedAt"],
  inventoryItem: ["companyId", "branchId", "farmId", "warehouseId", "productionSiteId", "productId", "deletedAt"],
  stockMovement: ["companyId", "branchId", "farmId", "warehouseId", "productionSiteId", "productId"],
  stockBatch: ["companyId", "branchId", "farmId", "warehouseId", "productionSiteId", "productId", "deletedAt"],
  salesOrder: ["companyId", "branchId", "warehouseId", "customerId", "deletedAt"],
  customerStatement: ["companyId", "branchId", "customerId"],
  invoice: ["companyId", "branchId", "customerId", "deletedAt"],
  supplierPayment: ["companyId", "deletedAt"],
  expense: ["companyId", "branchId", "deletedAt"],
  profitLossReport: ["companyId", "deletedAt"],
  cashFlowReport: ["companyId", "deletedAt"],
  productProfitability: ["companyId", "deletedAt"]
};

@Injectable()
export class ReportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService
  ) {}

  catalog(user: AuthenticatedUser) {
    return { data: REPORTS.filter((definition) => this.canView(user, definition)).map(this.publicDefinition) };
  }

  async options(user: AuthenticatedUser) {
    const scope = user.hasGlobalAccess ? {} : { id: { in: user.branchIds } };
    const [companies, branches, farms, warehouses, productionSites, products, customers, suppliers] = await Promise.all([
      this.prisma.company.findMany({ where: { id: user.companyId, deletedAt: null }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
      this.prisma.branch.findMany({ where: { companyId: user.companyId, deletedAt: null, ...scope }, select: { id: true, code: true, name: true }, orderBy: { name: "asc" } }),
      this.prisma.farm.findMany({ where: { companyId: user.companyId, deletedAt: null, ...(user.hasGlobalAccess ? {} : { id: { in: user.farmIds } }) }, select: { id: true, code: true, name: true, branchId: true }, orderBy: { name: "asc" } }),
      this.prisma.warehouse.findMany({ where: { companyId: user.companyId, deletedAt: null, ...(user.hasGlobalAccess ? {} : { id: { in: user.warehouseIds } }) }, select: { id: true, code: true, name: true, branchId: true }, orderBy: { name: "asc" } }),
      this.prisma.productionSite.findMany({ where: { companyId: user.companyId, deletedAt: null, ...(user.hasGlobalAccess ? {} : { id: { in: user.productionSiteIds } }) }, select: { id: true, code: true, name: true, branchId: true }, orderBy: { name: "asc" } }),
      this.prisma.product.findMany({ where: { companyId: user.companyId, deletedAt: null }, select: { id: true, sku: true, name: true }, orderBy: { name: "asc" }, take: 250 }),
      this.prisma.customer.findMany({ where: { companyId: user.companyId, deletedAt: null, ...(user.hasGlobalAccess ? {} : { branchId: { in: user.branchIds } }) }, select: { id: true, code: true, name: true }, orderBy: { name: "asc" }, take: 250 }),
      this.prisma.supplier.findMany({ where: { companyId: user.companyId, deletedAt: null }, select: { id: true, code: true, name: true }, orderBy: { name: "asc" }, take: 250 })
    ]);
    return { data: { companies, branches, farms, warehouses, productionSites, products, customers, suppliers } };
  }

  async run(id: string, user: AuthenticatedUser, query: ReportQueryDto): Promise<{ data: ReportResult }> {
    const definition = this.getDefinition(id, user);
    const delegate = this.delegate(definition.model);
    const rows = await delegate.findMany({
      where: this.where(definition, user, query),
      orderBy: definition.dateField ? { [definition.dateField]: "desc" } : { createdAt: "desc" },
      take: 1000
    });
    const mappedRows = rows.map((row: Record<string, unknown>) => this.normalize(definition.map(row))).filter((row: Record<string, unknown>) => definition.filter?.(row) ?? true);
    const resolvedRows = await this.resolveIds(definition.columns, mappedRows);
    const totals = this.totals(definition.columns, resolvedRows);
    const chart = this.chart(definition, resolvedRows);
    return { data: { definition: this.publicDefinition(definition), rows: resolvedRows, totals, chart } };
  }

  async export(id: string, format: "csv" | "xls" | "pdf" | "html", user: AuthenticatedUser, query: ReportQueryDto, context: RequestContext) {
    const result = (await this.run(id, user, query)).data;
    await this.audit.write({
      companyId: user.companyId,
      actorUserId: user.id,
      action: "EXPORT",
      entityType: "Report",
      entityId: id,
      summary: `Exported ${result.definition.title} as ${format.toUpperCase()}`,
      ipAddress: context.ipAddress,
      userAgent: context.userAgent
    });
    if (format === "pdf") return this.pdf(result);
    if (format === "xls") return this.excel(result);
    if (format === "html") return this.html(result);
    return this.csv(result);
  }

  private getDefinition(id: string, user: AuthenticatedUser) {
    const definition = REPORTS.find((reportDefinition) => reportDefinition.id === id);
    if (!definition) throw new NotFoundException("Report was not found.");
    if (!this.canView(user, definition)) throw new ForbiddenException("You do not have permission to view this report.");
    return definition;
  }

  private canView(user: AuthenticatedUser, definition: ReportDefinition) {
    return user.permissions.includes(definition.permission) || user.permissions.includes(PERMISSIONS.REPORTS_EXPORT) || user.hasGlobalAccess;
  }

  private publicDefinition(definition: ReportDefinition) {
    const { map, filter, ...publicDefinition } = definition;
    void map;
    void filter;
    return publicDefinition;
  }

  private delegate(model: string) {
    const delegate = (this.prisma as unknown as Record<string, { findMany: (args: Record<string, unknown>) => Promise<Record<string, unknown>[]> }>)[model];
    if (!delegate) throw new NotFoundException(`Report source ${model} was not found.`);
    return delegate;
  }

  private where(definition: ReportDefinition, user: AuthenticatedUser, query: ReportQueryDto): Record<string, unknown> {
    const fields = MODEL_FIELDS[definition.model] ?? ["companyId"];
    const where: Record<string, unknown> = { companyId: user.companyId };
    if (fields.includes("deletedAt")) where.deletedAt = null;
    if (query.companyId && query.companyId !== user.companyId) throw new ForbiddenException("You do not have access to this company.");
    this.scope(where, fields, "branchId", query.branchId, user.branchIds, user);
    this.scope(where, fields, "farmId", query.farmId, user.farmIds, user);
    this.scope(where, fields, "warehouseId", query.warehouseId, user.warehouseIds, user);
    this.scope(where, fields, "productionSiteId", query.productionSiteId, user.productionSiteIds, user);
    if (!user.hasGlobalAccess) {
      const or = [
        fields.includes("branchId") ? { branchId: { in: user.branchIds } } : undefined,
        fields.includes("farmId") ? { farmId: { in: user.farmIds } } : undefined,
        fields.includes("warehouseId") ? { warehouseId: { in: user.warehouseIds } } : undefined,
        fields.includes("productionSiteId") ? { productionSiteId: { in: user.productionSiteIds } } : undefined
      ].filter(Boolean);
      if (or.length > 0) where.OR = or;
    }
    if (definition.productField && query.productId && fields.includes(definition.productField)) where[definition.productField] = query.productId;
    if (definition.customerField && query.customerId && fields.includes(definition.customerField)) where[definition.customerField] = query.customerId;
    if (definition.supplierField && query.supplierId && fields.includes(definition.supplierField)) where[definition.supplierField] = query.supplierId;
    if (definition.dateField && (query.startDate || query.endDate)) {
      where[definition.dateField] = {
        gte: query.startDate ? new Date(query.startDate) : undefined,
        lte: query.endDate ? new Date(`${query.endDate}T23:59:59.999Z`) : undefined
      };
    }
    return where;
  }

  private scope(where: Record<string, unknown>, fields: string[], field: string, requested: string | undefined, allowed: string[], user: AuthenticatedUser) {
    if (!requested) return;
    if (!user.hasGlobalAccess && allowed.length > 0 && !allowed.includes(requested)) throw new ForbiddenException(`You do not have access to this ${field.replace("Id", "")}.`);
    if (fields.includes(field)) where[field] = requested;
  }

  private async resolveIds(columns: Column[], rows: Record<string, unknown>[]): Promise<Record<string, unknown>[]> {
    const ID_MODELS: Record<string, { model: string; nameField: string }> = {
      farmId:           { model: "farm",           nameField: "name" },
      poultryHouseId:   { model: "poultryHouse",   nameField: "name" },
      flockBatchId:     { model: "flockBatch",      nameField: "code" },
      productionSiteId: { model: "productionSite",  nameField: "name" },
      warehouseId:      { model: "warehouse",       nameField: "name" },
      branchId:         { model: "branch",          nameField: "name" },
      customerId:       { model: "customer",        nameField: "name" },
      productId:        { model: "product",         nameField: "name" },
      feedProductId:    { model: "product",         nameField: "name" },
      rawMaterialId:    { model: "product",         nameField: "name" },
      finishedProductId:{ model: "product",         nameField: "name" },
      formulaId:        { model: "feedFormula",     nameField: "name" },
    };

    const idColumns = columns.map((c) => c.key).filter((key) => key in ID_MODELS);
    if (idColumns.length === 0 || rows.length === 0) return rows;

    const idSets: Record<string, Set<string>> = {};
    for (const col of idColumns) idSets[col] = new Set();
    for (const row of rows) {
      for (const col of idColumns) {
        const val = row[col];
        if (typeof val === "string" && val) idSets[col].add(val);
      }
    }

    const nameMaps: Record<string, Map<string, string>> = {};
    await Promise.all(
      idColumns.map(async (col) => {
        const ids = [...idSets[col]];
        if (ids.length === 0) return;
        const { model, nameField } = ID_MODELS[col];
        const delegate = (this.prisma as unknown as Record<string, { findMany: (a: unknown) => Promise<Record<string, unknown>[]> }>)[model];
        if (!delegate) return;
        const records = await delegate.findMany({ where: { id: { in: ids } }, select: { id: true, [nameField]: true } }).catch(() => [] as Record<string, unknown>[]);
        const m = new Map<string, string>();
        for (const r of records) m.set(r.id as string, (r[nameField] as string) ?? (r.id as string));
        nameMaps[col] = m;
      })
    );

    return rows.map((row) => {
      const out = { ...row };
      for (const col of idColumns) {
        const val = out[col];
        if (typeof val === "string" && nameMaps[col]?.has(val)) out[col] = nameMaps[col].get(val);
      }
      return out;
    });
  }

  private normalize(row: Record<string, unknown>) {
    return Object.fromEntries(Object.entries(row).map(([key, value]) => [key, this.value(value)]));
  }

  private value(value: unknown): unknown {
    if (value instanceof Prisma.Decimal) return value.toNumber();
    if (value instanceof Date) return value.toISOString().slice(0, 10);
    if (Array.isArray(value)) return value.length;
    if (value && typeof value === "object") return JSON.stringify(value);
    return value;
  }

  private totals(columns: Column[], rows: Record<string, unknown>[]) {
    const totals: Record<string, number> = {};
    for (const column of columns) {
      if (column.type === "number" || column.type === "money" || column.type === "percent") {
        totals[column.key] = rows.reduce((sum, row) => sum + n(row[column.key]), 0);
      }
    }
    return totals;
  }

  private chart(definition: ReportDefinition, rows: Record<string, unknown>[]) {
    if (!definition.chart) return undefined;
    const buckets = new Map<string, number>();
    for (const row of rows) {
      const label = String(row[definition.chart.labelKey] ?? "Unassigned");
      buckets.set(label, (buckets.get(label) ?? 0) + n(row[definition.chart.valueKey]));
    }
    const entries = [...buckets.entries()].slice(0, 12);
    return { title: definition.chart.title, labels: entries.map(([label]) => label), values: entries.map(([, value]) => value) };
  }

  private csv(reportResult: ReportResult) {
    const header = reportResult.definition.columns.map((column) => column.label);
    const rows = reportResult.rows.map((row) => reportResult.definition.columns.map((column) => row[column.key] ?? ""));
    return [header, ...rows].map((row) => row.map((value) => `"${String(value).replace(/"/g, '""')}"`).join(",")).join("\n");
  }

  private excel(reportResult: ReportResult) {
    const rows = [
      reportResult.definition.columns.map((column) => column.label),
      ...reportResult.rows.map((row) => reportResult.definition.columns.map((column) => row[column.key] ?? ""))
    ];
    return `<?xml version="1.0"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
<Worksheet ss:Name="${xml(reportResult.definition.title).slice(0, 31)}"><Table>
${rows.map((row) => `<Row>${row.map((value) => `<Cell><Data ss:Type="${typeof value === "number" ? "Number" : "String"}">${xml(String(value))}</Data></Cell>`).join("")}</Row>`).join("\n")}
</Table></Worksheet></Workbook>`;
  }

  private html(reportResult: ReportResult) {
    const headers = reportResult.definition.columns.map((column) => `<th>${html(column.label)}</th>`).join("");
    const rows = reportResult.rows.map((row) => `<tr>${reportResult.definition.columns.map((column) => `<td>${html(String(row[column.key] ?? ""))}</td>`).join("")}</tr>`).join("");
    return `<!doctype html><html><head><title>${html(reportResult.definition.title)}</title><style>body{font-family:Arial,sans-serif;margin:32px;color:#17202a}table{border-collapse:collapse;width:100%;font-size:12px}th,td{border:1px solid #d8dee4;padding:6px;text-align:left}th{background:#f3f4f6}@media print{button{display:none}}</style></head><body><button onclick="window.print()">Print</button><h1>${html(reportResult.definition.title)}</h1><p>${html(reportResult.definition.description)}</p><table><thead><tr>${headers}</tr></thead><tbody>${rows}</tbody></table></body></html>`;
  }

  private pdf(reportResult: ReportResult) {
    const lines = [reportResult.definition.title, reportResult.definition.description, "", reportResult.definition.columns.map((column) => column.label).join(" | "), ...reportResult.rows.slice(0, 40).map((row) => reportResult.definition.columns.map((column) => String(row[column.key] ?? "")).join(" | "))];
    const content = lines.flatMap((line, index) => [`BT /F1 9 Tf 36 ${790 - index * 16} Td (${pdfEscape(line.slice(0, 120))}) Tj ET`]).join("\n");
    const objects = [
      "<< /Type /Catalog /Pages 2 0 R >>",
      "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
      "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
      "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
      `<< /Length ${Buffer.byteLength(content)} >>\nstream\n${content}\nendstream`
    ];
    let pdf = "%PDF-1.4\n";
    const offsets = [0];
    objects.forEach((object, index) => {
      offsets.push(Buffer.byteLength(pdf));
      pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
    });
    const xref = Buffer.byteLength(pdf);
    pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.slice(1).map((offset) => `${String(offset).padStart(10, "0")} 00000 n `).join("\n")}\ntrailer << /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
    return Buffer.from(pdf);
  }
}

function report(id: string, title: string, category: ReportCategory, permission: PermissionKey, model: string, dateField: string | undefined, columns: Column[], map: (row: Record<string, unknown>) => Record<string, unknown>, chart?: ReportDefinition["chart"], productField?: string, filter?: ReportDefinition["filter"], customerField?: string, supplierField?: string): ReportDefinition {
  return { id, title, category, permission, model, dateField, columns, map, chart, productField, filter, customerField, supplierField, description: `${title} with date range, company, branch, farm, warehouse, production site, product, customer, and supplier filters where applicable.` };
}

function col(key: string, label: string, type: Column["type"] = "text"): Column {
  return { key, label, type };
}

function n(value: unknown) {
  return Number(value ?? 0);
}

function xml(value: string) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function html(value: string) {
  return xml(value).replace(/'/g, "&#39;");
}

function pdfEscape(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

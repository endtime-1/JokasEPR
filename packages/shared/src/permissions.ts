// ─── Finance v2 ("fin") permissions ──────────────────────────────────────────
// Separate from the legacy finance.read / finance.manage pair. Format:
// fin.<area>.<action>. Not every area has every action (e.g. the dashboard is
// view-only); the list below is the single source of truth, and the API sync
// (permission-sync.service.ts) and the web menu both derive from it.
export const FIN_PERMISSIONS = {
  FIN_DASHBOARD_VIEW: "fin.dashboard.view",

  FIN_SALES_VIEW: "fin.sales.view",
  FIN_SALES_CREATE: "fin.sales.create",
  FIN_SALES_APPROVE: "fin.sales.approve",
  FIN_SALES_POST: "fin.sales.post",
  FIN_SALES_VOID: "fin.sales.void",

  FIN_PURCHASES_VIEW: "fin.purchases.view",
  FIN_PURCHASES_CREATE: "fin.purchases.create",
  FIN_PURCHASES_APPROVE: "fin.purchases.approve",
  FIN_PURCHASES_POST: "fin.purchases.post",
  FIN_PURCHASES_VOID: "fin.purchases.void",

  FIN_BANKING_VIEW: "fin.banking.view",
  FIN_BANKING_CREATE: "fin.banking.create",
  FIN_BANKING_APPROVE: "fin.banking.approve",
  FIN_BANKING_POST: "fin.banking.post",
  FIN_BANKING_VOID: "fin.banking.void",

  FIN_POS_VIEW: "fin.pos.view",
  FIN_POS_CREATE: "fin.pos.create",
  FIN_POS_APPROVE: "fin.pos.approve",
  FIN_POS_POST: "fin.pos.post",
  FIN_POS_VOID: "fin.pos.void",

  FIN_PAYROLL_VIEW: "fin.payroll.view",
  FIN_PAYROLL_CREATE: "fin.payroll.create",
  FIN_PAYROLL_APPROVE: "fin.payroll.approve",
  FIN_PAYROLL_POST: "fin.payroll.post",
  FIN_PAYROLL_VOID: "fin.payroll.void",

  FIN_ACCOUNTING_VIEW: "fin.accounting.view",
  FIN_ACCOUNTING_CREATE: "fin.accounting.create",
  FIN_ACCOUNTING_APPROVE: "fin.accounting.approve",
  FIN_ACCOUNTING_POST: "fin.accounting.post",
  FIN_ACCOUNTING_VOID: "fin.accounting.void",
  FIN_ACCOUNTING_SETTINGS: "fin.accounting.settings",

  FIN_REPORTS_VIEW: "fin.reports.view",
  FIN_REPORTS_EXPORT: "fin.reports.export",

  FIN_ITEMS_VIEW: "fin.items.view",
  FIN_ITEMS_CREATE: "fin.items.create",
  FIN_ITEMS_POST: "fin.items.post",
  FIN_ITEMS_VOID: "fin.items.void",
  FIN_ITEMS_IMPORT: "fin.items.import",

  FIN_CONTACTS_VIEW: "fin.contacts.view",
  FIN_CONTACTS_CREATE: "fin.contacts.create",
  FIN_CONTACTS_IMPORT: "fin.contacts.import",

  FIN_SETTINGS_VIEW: "fin.settings.view",
  FIN_SETTINGS_SETTINGS: "fin.settings.settings"
} as const;

/** [key, description] for every fin.* permission, grouped for the roles screen. */
export const FIN_PERMISSION_CATALOG: ReadonlyArray<readonly [string, string]> = [
  ["fin.dashboard.view", "Finance: view the finance dashboard"],
  ...(["sales", "purchases", "banking", "pos", "payroll"] as const).flatMap((area) => [
    [`fin.${area}.view`, `Finance: view ${area}`],
    [`fin.${area}.create`, `Finance: create ${area} records (drafts)`],
    [`fin.${area}.approve`, `Finance: approve ${area} records`],
    [`fin.${area}.post`, `Finance: post ${area} records to the ledger`],
    [`fin.${area}.void`, `Finance: void / reverse ${area} records`]
  ] as const),
  ["fin.accounting.view", "Finance: view chart of accounts, journals, trial balance"],
  ["fin.accounting.create", "Finance: create draft journals"],
  ["fin.accounting.approve", "Finance: approve journals"],
  ["fin.accounting.post", "Finance: post journals to the ledger"],
  ["fin.accounting.void", "Finance: reverse posted journals"],
  ["fin.accounting.settings", "Finance: edit the chart of accounts, apply the template, lock periods"],
  ["fin.reports.view", "Finance: view finance reports"],
  ["fin.reports.export", "Finance: export finance reports"],
  ["fin.items.view", "Finance: view items and stock"],
  ["fin.items.create", "Finance: create and edit items"],
  ["fin.items.post", "Finance: post stock movements"],
  ["fin.items.void", "Finance: reverse stock movements"],
  ["fin.items.import", "Finance: import items and opening stock from CSV"],
  ["fin.contacts.view", "Finance: view customers and suppliers"],
  ["fin.contacts.create", "Finance: create and edit customers and suppliers"],
  ["fin.contacts.import", "Finance: import contacts from CSV"],
  ["fin.settings.view", "Finance: view finance settings and the finance audit log"],
  ["fin.settings.settings", "Finance: change business details, currency, fiscal year, numbering"]
];

export const PERMISSIONS = {
  ...FIN_PERMISSIONS,
  PLATFORM_READ: "platform.read",
  PLATFORM_MANAGE: "platform.manage",
  IDENTITY_READ: "identity.read",
  IDENTITY_MANAGE: "identity.manage",
  INVENTORY_READ: "inventory.read",
  INVENTORY_MANAGE: "inventory.manage",
  POULTRY_READ: "poultry.read",
  POULTRY_MANAGE: "poultry.manage",
  POULTRY_RECORD: "poultry.record",
  POULTRY_SUPERVISE: "poultry.supervise",
  FEED_READ: "feed.read",
  FEED_MANAGE: "feed.manage",
  SOYA_READ: "soya.read",
  SOYA_MANAGE: "soya.manage",
  FINANCE_READ: "finance.read",
  FINANCE_MANAGE: "finance.manage",
  SALES_READ: "sales.read",
  SALES_MANAGE: "sales.manage",
  EGG_SALES_READ: "egg-sales.read",
  EGG_SALES_MANAGE: "egg-sales.manage",
  PROCUREMENT_READ: "procurement.read",
  PROCUREMENT_MANAGE: "procurement.manage",
  MARKET_PLANNING_READ: "market-planning.read",
  MARKET_PLANNING_MANAGE: "market-planning.manage",
  MARKET_PLANNING_SUBMIT: "market-planning.submit",
  HR_READ: "hr.read",
  HR_MANAGE: "hr.manage",
  MAINTENANCE_READ: "maintenance.read",
  MAINTENANCE_MANAGE: "maintenance.manage",
  QUALITY_READ: "quality.read",
  QUALITY_MANAGE: "quality.manage",
  HEALTH_READ: "health.read",
  HEALTH_MANAGE: "health.manage",
  REPORTS_EXPORT: "reports.export",
  SETTINGS_MANAGE: "settings.manage",
  AUDIT_READ: "audit.read",
  AI_READ: "ai.read",
  ALERTS_READ: "alerts.read",
  ALERTS_MANAGE: "alerts.manage",
  QUICKBOOKS_READ: "quickbooks.read",
  QUICKBOOKS_MANAGE: "quickbooks.manage",
  EXECUTIVE_READ: "executive.read"
} as const;

export type PermissionKey = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

export const MODULE_PERMISSIONS: Record<string, PermissionKey[]> = {
  Platform: [PERMISSIONS.PLATFORM_READ, PERMISSIONS.PLATFORM_MANAGE],
  Identity: [PERMISSIONS.IDENTITY_READ, PERMISSIONS.IDENTITY_MANAGE],
  Inventory: [PERMISSIONS.INVENTORY_READ, PERMISSIONS.INVENTORY_MANAGE],
  Poultry: [PERMISSIONS.POULTRY_READ, PERMISSIONS.POULTRY_MANAGE, PERMISSIONS.POULTRY_RECORD, PERMISSIONS.POULTRY_SUPERVISE],
  "Feed Production": [PERMISSIONS.FEED_READ, PERMISSIONS.FEED_MANAGE],
  "Soya Processing": [PERMISSIONS.SOYA_READ, PERMISSIONS.SOYA_MANAGE],
  Finance: [PERMISSIONS.FINANCE_READ, PERMISSIONS.FINANCE_MANAGE],
  "Finance (new)": Object.values(FIN_PERMISSIONS) as PermissionKey[],
  Sales: [PERMISSIONS.SALES_READ, PERMISSIONS.SALES_MANAGE],
  "Egg Sales": [PERMISSIONS.EGG_SALES_READ, PERMISSIONS.EGG_SALES_MANAGE],
  Procurement: [PERMISSIONS.PROCUREMENT_READ, PERMISSIONS.PROCUREMENT_MANAGE],
  "Market Planning": [PERMISSIONS.MARKET_PLANNING_READ, PERMISSIONS.MARKET_PLANNING_SUBMIT, PERMISSIONS.MARKET_PLANNING_MANAGE],
  HR: [PERMISSIONS.HR_READ, PERMISSIONS.HR_MANAGE],
  Maintenance: [PERMISSIONS.MAINTENANCE_READ, PERMISSIONS.MAINTENANCE_MANAGE],
  "Quality Control": [PERMISSIONS.QUALITY_READ, PERMISSIONS.QUALITY_MANAGE],
  "Vet and Health": [PERMISSIONS.HEALTH_READ, PERMISSIONS.HEALTH_MANAGE],
  Reports: [PERMISSIONS.REPORTS_EXPORT],
  Settings: [PERMISSIONS.SETTINGS_MANAGE],
  Audit: [PERMISSIONS.AUDIT_READ],
  "AI Assistant": [PERMISSIONS.AI_READ],
  "Alerts": [PERMISSIONS.ALERTS_READ, PERMISSIONS.ALERTS_MANAGE],
  "QuickBooks": [PERMISSIONS.QUICKBOOKS_READ, PERMISSIONS.QUICKBOOKS_MANAGE],
  "Executive": [PERMISSIONS.EXECUTIVE_READ]
};

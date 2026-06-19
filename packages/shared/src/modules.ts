export const ERP_MODULES = [
  "platform",
  "identity",
  "poultry",
  "feed-production",
  "soya-processing",
  "inventory",
  "sales",
  "finance",
  "procurement",
  "hr",
  "maintenance",
  "quality-control",
  "marketing",
  "ai-decision-support",
  "reports",
  "audit"
] as const;

export type ErpModuleKey = (typeof ERP_MODULES)[number];

export const MODULE_LABELS: Record<ErpModuleKey, string> = {
  platform: "Platform",
  identity: "Identity and Access",
  poultry: "Poultry Operations",
  "feed-production": "Feed Production",
  "soya-processing": "Soya Processing",
  inventory: "Inventory and Warehouses",
  sales: "Sales and Customers",
  finance: "Finance and Accounting",
  procurement: "Procurement and Suppliers",
  hr: "HR, Workers, and Tasks",
  maintenance: "Machine and Maintenance",
  "quality-control": "Quality Control",
  marketing: "Marketing Insights",
  "ai-decision-support": "AI Alerts and Forecasting",
  reports: "Reports",
  audit: "Audit Logs"
};

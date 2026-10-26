"use client";

import {
  ArrowLeftRight, BellRing, Bird, Boxes, ChartBar, CircleCheckBig, ClipboardList, Factory, FileDown, FileText,
  FlaskConical, HeartPulse, LayoutDashboard, MapPinned, PackageSearch, Receipt, ShoppingBag, ShoppingCart, Sprout, Store,
  Target, Truck, Users, Bot, Wallet
} from "lucide-react";
import { ModuleNav, type ModuleNavGroup } from "./module-nav";

// Every module's navigation lives here so they all look and behave the same.

export const POULTRY_GROUPS: ModuleNavGroup[] = [
  { label: "Flock", icon: Bird, items: [
    { href: "/poultry", label: "Dashboard", exact: true }, { href: "/poultry/farms", label: "Farm overview" },
    { href: "/poultry/houses", label: "Houses & pens" }, { href: "/poultry/batches", label: "Batches" } ] },
  { label: "Operations", icon: ClipboardList, items: [
    { href: "/poultry/daily-records", label: "Daily entry" }, { href: "/poultry/feed-store", label: "Feed store" } ] },
  // Day-to-day logging goes through Daily entry; these are for reviewing or fixing one kind of record.
  { label: "Records", icon: FileText, items: [
    { href: "/poultry/egg-production", label: "Egg records" }, { href: "/poultry/feed-consumption", label: "Feed records" },
    { href: "/poultry/bird-weight", label: "Weight records" }, { href: "/poultry/mortality", label: "Mortality records" } ] },
  { label: "Health", icon: HeartPulse, items: [
    { href: "/poultry/health-observations", label: "Health" }, { href: "/poultry/medication", label: "Medications" },
    { href: "/poultry/vaccination", label: "Vaccinations" } ] },
  { label: "Commercial", icon: Store, items: [
    { href: "/poultry/transfers", label: "Transfers" }, { href: "/poultry/costs", label: "Costs" }, { href: "/poultry/reports", label: "Reports" } ] },
];

export const INVENTORY_GROUPS: ModuleNavGroup[] = [
  { label: "Overview", icon: LayoutDashboard, items: [
    { href: "/inventory", label: "Dashboard", exact: true }, { href: "/inventory/items", label: "Items" }, { href: "/inventory/movements", label: "Movements" } ] },
  { label: "Operations", icon: ArrowLeftRight, items: [
    { href: "/inventory/stock-in", label: "Stock in" }, { href: "/inventory/stock-out", label: "Stock out" },
    { href: "/inventory/transfers", label: "Transfers" }, { href: "/inventory/adjustments", label: "Adjustments" } ] },
  { label: "Alerts", icon: BellRing, items: [
    { href: "/inventory/low-stock", label: "Low stock" }, { href: "/inventory/expiry-alerts", label: "Expiry alerts" } ] },
  { label: "Reports", icon: ChartBar, items: [
    { href: "/inventory/valuation", label: "Valuation" }, { href: "/inventory/reports", label: "Reports" } ] },
  { label: "Locations", icon: MapPinned, items: [
    { href: "/inventory/warehouses", label: "Warehouses" }, { href: "/inventory/farms", label: "Farms" },
    { href: "/inventory/production-sites", label: "Production sites" }, { href: "/inventory/locations", label: "Storage locations" },
    { href: "/inventory/warehouse-cleanup", label: "Warehouse cleanup" } ] },
];

export const FEED_GROUPS: ModuleNavGroup[] = [
  { label: "Overview", icon: LayoutDashboard, items: [
    { href: "/feed-production", label: "Dashboard", exact: true }, { href: "/feed-production/formulas", label: "Formulas" },
    { href: "/feed-production/orders", label: "Orders" }, { href: "/feed-production/ingredients", label: "Ingredients" } ] },
  { label: "Production", icon: Factory, items: [
    { href: "/feed-production/batches", label: "Batches" }, { href: "/feed-production/quality-control", label: "Quality control" },
    { href: "/feed-production/raw-material-usage", label: "Raw materials" } ] },
  { label: "Stock", icon: Boxes, items: [
    { href: "/feed-production/finished-feed-inventory", label: "Finished stock" }, { href: "/feed-production/packaging-records", label: "Packaging" },
    { href: "/feed-production/internal-transfer", label: "Transfers" } ] },
  { label: "Reports", icon: FileDown, items: [{ href: "/feed-production/reports", label: "Reports" }] },
  { label: "Intelligence", icon: Bot, items: [{ href: "/feed-production/hipro-predictive", label: "Hi-Pro predictive" }] },
];

export const SOYA_GROUPS: ModuleNavGroup[] = [
  { label: "Overview", icon: LayoutDashboard, items: [
    { href: "/soya-processing", label: "Dashboard", exact: true }, { href: "/soya-processing/intakes", label: "Intakes" },
    { href: "/soya-processing/delivery-analysis", label: "Delivery analysis" } ] },
  { label: "Production", icon: Sprout, items: [
    { href: "/soya-processing/batches", label: "Batches" }, { href: "/soya-processing/quality-control", label: "Quality control" } ] },
  { label: "Stock", icon: PackageSearch, items: [
    { href: "/soya-processing/oil-stock", label: "Oil stock" }, { href: "/soya-processing/cake-stock", label: "Cake stock" },
    { href: "/soya-processing/internal-transfer", label: "Transfers" }, { href: "/soya-processing/sales", label: "Sales" } ] },
  { label: "Reports", icon: FileDown, items: [{ href: "/soya-processing/reports", label: "Reports" }] },
];

export const MARKET_PLANNING_GROUPS: ModuleNavGroup[] = [
  { label: "Overview", icon: LayoutDashboard, items: [
    { href: "/market-planning", label: "Dashboard", exact: true }, { href: "/market-planning/targets", label: "Targets" },
    { href: "/market-planning/markets", label: "Markets" } ] },
  { label: "Planning", icon: Target, items: [
    { href: "/market-planning/production-plans", label: "Production plans" }, { href: "/market-planning/mrp", label: "MRP" },
    { href: "/market-planning/availability", label: "Availability" } ] },
  { label: "Procurement", icon: ShoppingCart, items: [{ href: "/market-planning/recommendations", label: "Recommendations" }] },
  { label: "Execution", icon: ClipboardList, items: [{ href: "/market-planning/execution", label: "Execution" }] },
  { label: "Reports", icon: FileDown, items: [{ href: "/market-planning/reports", label: "Reports" }] },
];

const SALES_GROUPS: ModuleNavGroup[] = [
  { label: "Overview", icon: LayoutDashboard, items: [
    { href: "/sales", label: "Dashboard", exact: true }, { href: "/sales/field-visits", label: "Field visits" }, { href: "/sales/reports", label: "Reports" } ] },
  { label: "Customers", icon: Users, items: [
    { href: "/sales/customers", label: "Customers" }, { href: "/sales/customer-groups", label: "Customer groups" },
    { href: "/sales/statements", label: "Statements" }, { href: "/sales/debtors", label: "Debtors" } ] },
  { label: "Selling", icon: ShoppingBag, items: [
    { href: "/sales/quotes", label: "Quotes" }, { href: "/sales/orders", label: "Orders" }, { href: "/sales/delivery-notes", label: "Delivery notes" },
    { href: "/sales/returns", label: "Returns" }, { href: "/sales/price-lists", label: "Price lists" } ] },
  { label: "Money", icon: Receipt, items: [
    { href: "/sales/invoices", label: "Invoices" }, { href: "/sales/payments", label: "Payments" }, { href: "/sales/receipts", label: "Receipts" } ] },
];

const PROCUREMENT_GROUPS: ModuleNavGroup[] = [
  { label: "Overview", icon: LayoutDashboard, items: [{ href: "/procurement", label: "Dashboard", exact: true }] },
  { label: "Suppliers", icon: Truck, items: [
    { href: "/procurement/suppliers", label: "Suppliers" }, { href: "/procurement/supplier-categories", label: "Categories" },
    { href: "/procurement/performance", label: "Performance" }, { href: "/procurement/price-history", label: "Price history" } ] },
  { label: "Buying", icon: ShoppingCart, items: [
    { href: "/procurement/purchase-requests", label: "Requests" }, { href: "/procurement/purchase-orders", label: "Orders" }, { href: "/procurement/grns", label: "GRNs" } ] },
  { label: "Pay", icon: Wallet, items: [{ href: "/procurement/invoices", label: "Invoices" }, { href: "/procurement/payments", label: "Payments" }] },
];

export function SalesNav() {
  return <ModuleNav groups={SALES_GROUPS} ariaLabel="Sales sections" />;
}

export function ProcurementNav() {
  return <ModuleNav groups={PROCUREMENT_GROUPS} ariaLabel="Procurement sections" />;
}

/** The check-type tabs share one page and differ only by ?checkType, so `checkType` decides which is active. */
export function QualityNav({ checkType }: { checkType?: string } = {}) {
  const check = (t?: string) => (pathname: string) => pathname === "/quality/checks" && (checkType || undefined) === t;
  const groups: ModuleNavGroup[] = [
    { label: "Overview", icon: LayoutDashboard, items: [
      { href: "/quality", label: "Dashboard", exact: true }, { href: "/quality/templates", label: "Templates" } ] },
    { label: "Checks", icon: FlaskConical, items: [
      { href: "/quality/checks", label: "All checks", isActive: check(undefined) },
      { href: "/quality/checks?checkType=RAW_MATERIAL", label: "Raw material", isActive: check("RAW_MATERIAL") },
      { href: "/quality/checks?checkType=FEED_PRODUCTION", label: "Feed quality", isActive: check("FEED_PRODUCTION") },
      { href: "/quality/checks?checkType=SOYA_PROCESSING", label: "Soya quality", isActive: check("SOYA_PROCESSING") },
      { href: "/quality/checks?checkType=FINISHED_GOODS", label: "Finished goods", isActive: check("FINISHED_GOODS") },
      { href: "/quality/checks?checkType=GOODS_RECEIVED", label: "GRN checks", isActive: check("GOODS_RECEIVED") },
      { href: "/quality/checks?checkType=POULTRY_HEALTH", label: "Poultry health", isActive: check("POULTRY_HEALTH") } ] },
    { label: "Decisions", icon: CircleCheckBig, items: [
      { href: "/quality/rejected-batches", label: "Rejected" }, { href: "/quality/approved-batches", label: "Approved" },
      { href: "/quality/corrective-actions", label: "Corrective actions" } ] },
    { label: "Reports", icon: ChartBar, items: [
      { href: "/quality/lab-reports", label: "Lab reports" }, { href: "/quality/reports", label: "Reports" } ] },
  ];
  return <ModuleNav groups={groups} ariaLabel="Quality sections" />;
}


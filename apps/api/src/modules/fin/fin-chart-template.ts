import type { FinAccountType } from "@prisma/client";

/**
 * Account ROLES: the jobs the ledger needs an account to do. Postings ask for a role
 * ("receivable", "cogs", ...) and the company's chart says which account fills it, so
 * the code never depends on a hard-coded account number and a company can renumber freely.
 */
export const FIN_ACCOUNT_ROLES: Record<string, { label: string; type: FinAccountType }> = {
  cash: { label: "Cash on hand", type: "ASSET" },
  petty_cash: { label: "Petty cash", type: "ASSET" },
  bank: { label: "Main bank account", type: "ASSET" },
  mobile_money: { label: "Mobile money", type: "ASSET" },
  payment_clearing: { label: "Online payments clearing (held by the payment provider)", type: "ASSET" },
  receivable: { label: "Accounts receivable (customers owe us)", type: "ASSET" },
  supplier_advances: { label: "Supplier advances / prepayments", type: "ASSET" },
  inventory: { label: "Inventory (default)", type: "ASSET" },
  inventory_raw_materials: { label: "Inventory: raw materials", type: "ASSET" },
  inventory_finished_feed: { label: "Inventory: finished feed", type: "ASSET" },
  inventory_eggs: { label: "Inventory: eggs", type: "ASSET" },
  accumulated_depreciation: { label: "Accumulated depreciation", type: "ASSET" },
  payable: { label: "Accounts payable (we owe suppliers)", type: "LIABILITY" },
  salaries_payable: { label: "Salaries payable", type: "LIABILITY" },
  paye_payable: { label: "PAYE tax payable", type: "LIABILITY" },
  ssnit_payable: { label: "SSNIT payable", type: "LIABILITY" },
  customer_credit: { label: "Customer deposits and credits", type: "LIABILITY" },
  tax_payable: { label: "VAT / levies payable", type: "LIABILITY" },
  owner_capital: { label: "Owner's capital", type: "EQUITY" },
  retained_earnings: { label: "Retained earnings", type: "EQUITY" },
  opening_equity: { label: "Opening balance equity", type: "EQUITY" },
  sales: { label: "Sales revenue (default)", type: "REVENUE" },
  other_income: { label: "Other income", type: "REVENUE" },
  sales_returns: { label: "Sales returns and discounts", type: "REVENUE" },
  cogs: { label: "Cost of goods sold", type: "EXPENSE" },
  purchases: { label: "Purchases", type: "EXPENSE" },
  stock_adjustment: { label: "Stock adjustment gain / loss", type: "EXPENSE" },
  salaries_expense: { label: "Salaries and wages", type: "EXPENSE" },
  depreciation_expense: { label: "Depreciation expense", type: "EXPENSE" },
  general_expense: { label: "General expenses", type: "EXPENSE" },
  bank_charges: { label: "Bank and transfer charges", type: "EXPENSE" },
  provider_fees: { label: "Payment provider fees", type: "EXPENSE" }
};

export type FinTemplateAccount = {
  code: string;
  name: string;
  type: FinAccountType;
  /** Code of the header account this sits under. */
  parent?: string;
  /** false = header (groups accounts, cannot be posted to). */
  postable?: boolean;
  role?: string;
  /** false = created inactive (ready to switch on, e.g. VAT while the business does not charge it). */
  active?: boolean;
  description?: string;
};

const H = false; // header
const A = "ASSET" as const;
const L = "LIABILITY" as const;
const E = "EQUITY" as const;
const R = "REVENUE" as const;
const X = "EXPENSE" as const;

/** Poultry and feed-mill chart of accounts. Applied once to an empty chart; every account stays editable afterwards. */
export const FIN_CHART_TEMPLATE: FinTemplateAccount[] = [
  // ── Assets ──
  { code: "1000", name: "Assets", type: A, postable: H },
  { code: "1100", name: "Cash and Bank", type: A, parent: "1000", postable: H },
  { code: "1110", name: "Cash on Hand", type: A, parent: "1100", role: "cash" },
  { code: "1115", name: "Petty Cash", type: A, parent: "1100", role: "petty_cash" },
  { code: "1120", name: "Main Bank Account", type: A, parent: "1100", role: "bank", description: "Add one account per real bank account under 1100" },
  { code: "1130", name: "Mobile Money", type: A, parent: "1100", role: "mobile_money" },
  { code: "1140", name: "Online Payments Clearing", type: A, parent: "1100", role: "payment_clearing", description: "Card and mobile money paid online, held by the payment provider until it settles to your bank" },
  { code: "1200", name: "Receivables", type: A, parent: "1000", postable: H },
  { code: "1210", name: "Accounts Receivable", type: A, parent: "1200", role: "receivable", description: "Money customers owe us" },
  { code: "1220", name: "Staff Advances and Loans", type: A, parent: "1200" },
  { code: "1230", name: "Supplier Advances and Prepayments", type: A, parent: "1200", role: "supplier_advances" },
  { code: "1300", name: "Inventory", type: A, parent: "1000", postable: H },
  { code: "1310", name: "Raw Materials (Feed Ingredients)", type: A, parent: "1300", role: "inventory_raw_materials" },
  { code: "1320", name: "Finished Feed", type: A, parent: "1300", role: "inventory_finished_feed" },
  { code: "1330", name: "Eggs on Hand", type: A, parent: "1300", role: "inventory_eggs" },
  { code: "1340", name: "Day-Old Chicks", type: A, parent: "1300" },
  { code: "1350", name: "Veterinary Drugs and Vaccines", type: A, parent: "1300" },
  { code: "1360", name: "Packaging Materials", type: A, parent: "1300" },
  { code: "1370", name: "Soya Products (Cake and Oil)", type: A, parent: "1300" },
  { code: "1380", name: "Farm Supplies and Spares", type: A, parent: "1300" },
  { code: "1390", name: "General Inventory", type: A, parent: "1300", role: "inventory" },
  { code: "1400", name: "Prepayments and Other Current Assets", type: A, parent: "1000", postable: H },
  { code: "1410", name: "Prepaid Expenses", type: A, parent: "1400" },
  { code: "1420", name: "Withholding Tax Receivable", type: A, parent: "1400" },
  { code: "1500", name: "Biological Assets (Flock)", type: A, parent: "1000", postable: H },
  { code: "1510", name: "Growing Flock (Pullets and Broilers)", type: A, parent: "1500" },
  { code: "1520", name: "Laying Flock", type: A, parent: "1500" },
  { code: "1600", name: "Fixed Assets", type: A, parent: "1000", postable: H },
  { code: "1610", name: "Land", type: A, parent: "1600" },
  { code: "1620", name: "Poultry Houses and Buildings", type: A, parent: "1600" },
  { code: "1630", name: "Feed Mill Plant and Machinery", type: A, parent: "1600" },
  { code: "1640", name: "Farm Equipment", type: A, parent: "1600" },
  { code: "1650", name: "Motor Vehicles", type: A, parent: "1600" },
  { code: "1660", name: "Office Equipment", type: A, parent: "1600" },
  { code: "1690", name: "Accumulated Depreciation", type: A, parent: "1600", role: "accumulated_depreciation", description: "Contra-asset: normally carries a credit balance" },

  // ── Liabilities ──
  { code: "2000", name: "Liabilities", type: L, postable: H },
  { code: "2100", name: "Current Liabilities", type: L, parent: "2000", postable: H },
  { code: "2110", name: "Accounts Payable", type: L, parent: "2100", role: "payable", description: "Money we owe suppliers" },
  { code: "2120", name: "Accrued Expenses", type: L, parent: "2100" },
  { code: "2130", name: "Salaries Payable", type: L, parent: "2100", role: "salaries_payable" },
  { code: "2140", name: "PAYE Tax Payable", type: L, parent: "2100", role: "paye_payable" },
  { code: "2150", name: "SSNIT Payable", type: L, parent: "2100", role: "ssnit_payable" },
  { code: "2160", name: "Customer Deposits and Credits", type: L, parent: "2100", role: "customer_credit" },
  { code: "2180", name: "VAT and Levies Payable", type: L, parent: "2100", role: "tax_payable", active: false, description: "Inactive: the business does not charge VAT today" },
  { code: "2200", name: "Long-term Liabilities", type: L, parent: "2000", postable: H },
  { code: "2210", name: "Bank Loans", type: L, parent: "2200" },
  { code: "2220", name: "Owner and Director Loans", type: L, parent: "2200" },

  // ── Equity ──
  { code: "3000", name: "Equity", type: E, postable: H },
  { code: "3100", name: "Owner's Capital", type: E, parent: "3000", role: "owner_capital" },
  { code: "3200", name: "Retained Earnings", type: E, parent: "3000", role: "retained_earnings" },
  { code: "3300", name: "Owner's Drawings", type: E, parent: "3000" },
  { code: "3900", name: "Opening Balance Equity", type: E, parent: "3000", role: "opening_equity", description: "Balancing figure of the opening balances entry" },

  // ── Revenue ──
  { code: "4000", name: "Revenue", type: R, postable: H },
  { code: "4100", name: "Egg Sales", type: R, parent: "4000" },
  { code: "4110", name: "Spent Hen and Bird Sales", type: R, parent: "4000" },
  { code: "4120", name: "Layer Feed Sales", type: R, parent: "4000" },
  { code: "4130", name: "Broiler and Other Feed Sales", type: R, parent: "4000" },
  { code: "4200", name: "Soya Products Sales", type: R, parent: "4000" },
  { code: "4300", name: "Manure and By-product Sales", type: R, parent: "4000" },
  { code: "4400", name: "Service Income", type: R, parent: "4000" },
  { code: "4500", name: "General Sales", type: R, parent: "4000", role: "sales" },
  { code: "4800", name: "Other Income", type: R, parent: "4000", role: "other_income" },
  { code: "4900", name: "Sales Returns and Discounts", type: R, parent: "4000", role: "sales_returns", description: "Contra-revenue: normally carries a debit balance" },

  // ── Cost of sales ──
  { code: "5000", name: "Cost of Sales", type: X, postable: H },
  { code: "5100", name: "Cost of Goods Sold", type: X, parent: "5000", role: "cogs" },
  { code: "5110", name: "Cost of Feed Sold", type: X, parent: "5000" },
  { code: "5120", name: "Cost of Eggs Sold", type: X, parent: "5000" },
  { code: "5130", name: "Cost of Soya Products Sold", type: X, parent: "5000" },
  { code: "5200", name: "Purchases", type: X, parent: "5000", role: "purchases" },
  { code: "5300", name: "Stock Adjustments (Gain / Loss)", type: X, parent: "5000", role: "stock_adjustment" },
  { code: "5400", name: "Mortality and Culling Losses", type: X, parent: "5000" },
  { code: "5500", name: "Freight In", type: X, parent: "5000" },

  // ── Operating expenses ──
  { code: "6000", name: "Operating Expenses", type: X, postable: H },
  { code: "6100", name: "Flock Feed Consumption", type: X, parent: "6000" },
  { code: "6110", name: "Veterinary and Medication", type: X, parent: "6000" },
  { code: "6200", name: "Salaries and Wages", type: X, parent: "6000", role: "salaries_expense" },
  { code: "6210", name: "Casual Labour", type: X, parent: "6000" },
  { code: "6220", name: "Employer SSNIT Contribution", type: X, parent: "6000" },
  { code: "6300", name: "Electricity", type: X, parent: "6000" },
  { code: "6310", name: "Water", type: X, parent: "6000" },
  { code: "6320", name: "Fuel and Generator", type: X, parent: "6000" },
  { code: "6400", name: "Repairs and Maintenance", type: X, parent: "6000" },
  { code: "6410", name: "Transport and Delivery", type: X, parent: "6000" },
  { code: "6500", name: "Rent", type: X, parent: "6000" },
  { code: "6510", name: "Insurance", type: X, parent: "6000" },
  { code: "6600", name: "Depreciation", type: X, parent: "6000", role: "depreciation_expense" },
  { code: "6700", name: "Bank Charges", type: X, parent: "6000", role: "bank_charges", description: "Bank and mobile money charges, including transfer fees" },
  { code: "6720", name: "Payment Provider Fees", type: X, parent: "6000", role: "provider_fees", description: "Fees taken by the online payment provider" },
  { code: "6710", name: "Interest Expense", type: X, parent: "6000" },
  { code: "6800", name: "Marketing and Advertising", type: X, parent: "6000" },
  { code: "6810", name: "Professional and Licence Fees", type: X, parent: "6000" },
  { code: "6820", name: "Telephone and Internet", type: X, parent: "6000" },
  { code: "6830", name: "Office and Stationery", type: X, parent: "6000" },
  { code: "6840", name: "Taxes and Levies", type: X, parent: "6000" },
  { code: "6900", name: "General Expenses", type: X, parent: "6000", role: "general_expense" },
  { code: "6990", name: "Foreign Exchange Gain / Loss", type: X, parent: "6000" }
];

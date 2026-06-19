import { InventoryListPage } from "../../../components/inventory-pages";

export default function StockMovementHistoryPage() {
  return <InventoryListPage title="Stock Movement History" endpoint="/inventory/movements" subtitle="Audit trail of stock receipts, issues, transfers, production movements, and adjustments." />;
}

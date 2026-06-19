import { InventoryListPage } from "../../../components/inventory-pages";

export default function LowStockPage() {
  return <InventoryListPage title="Low Stock Alerts" endpoint="/inventory/low-stock" subtitle="Items at or below warehouse-specific reorder levels." />;
}

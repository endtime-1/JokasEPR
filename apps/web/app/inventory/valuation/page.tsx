import { InventoryListPage } from "../../../components/inventory-pages";

export default function InventoryValuationPage() {
  return <InventoryListPage title="Inventory Valuation Report" endpoint="/inventory/valuation" subtitle="FIFO value by warehouse, SKU, quantity, and unit cost." />;
}

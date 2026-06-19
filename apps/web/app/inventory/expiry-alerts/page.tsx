import { InventoryListPage } from "../../../components/inventory-pages";

export default function ExpiryAlertsPage() {
  return <InventoryListPage title="Expiry Alerts" endpoint="/inventory/expiry-alerts" subtitle="Batch and lot stock with expiry dates approaching." />;
}

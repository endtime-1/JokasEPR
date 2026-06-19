import { SalesListPage } from "../../../components/sales-pages";

export default function Page() {
  return <SalesListPage title="Receipts" endpoint="/sales/receipts" subtitle="Payment receipts generated from posted customer collections." />;
}


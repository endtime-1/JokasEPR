import { SalesListPage } from "../../../components/sales-pages";

export default function Page() {
  return <SalesListPage title="Debtors Report" endpoint="/sales/debtors" subtitle="Customers with outstanding credit balances." />;
}


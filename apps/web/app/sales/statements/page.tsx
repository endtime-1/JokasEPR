import { SalesListPage } from "../../../components/sales-pages";

export default function Page() {
  return <SalesListPage title="Customer Statements" endpoint="/sales/statements" subtitle="Invoice, payment, and return ledger entries by customer." />;
}


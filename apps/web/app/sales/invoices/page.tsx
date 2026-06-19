import { SalesListPage } from "../../../components/sales-pages";

export default function Page() {
  return <SalesListPage title="Invoices" endpoint="/sales/invoices" subtitle="Issued, partially paid, overdue, and paid customer invoices." />;
}


import { CustomerDetailsPage } from "../../../../components/sales-pages";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <CustomerDetailsPage id={id} />;
}


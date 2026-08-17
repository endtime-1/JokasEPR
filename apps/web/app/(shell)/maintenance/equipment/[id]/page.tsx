import { EquipmentDetailsPage } from "../../../../../components/maintenance-pages";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <EquipmentDetailsPage id={id} />;
}

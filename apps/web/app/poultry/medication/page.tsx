import { PoultryRecordPage } from "../../../components/poultry-pages";

export default function MedicationRecordsPage() {
  return <PoultryRecordPage title="Medication Records" type="medications" endpoint="/poultry/medication-records" health />;
}

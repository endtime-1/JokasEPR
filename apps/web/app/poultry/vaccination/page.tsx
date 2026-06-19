import { PoultryRecordPage } from "../../../components/poultry-pages";

export default function VaccinationRecordsPage() {
  return <PoultryRecordPage title="Vaccination Records" type="vaccinations" endpoint="/poultry/vaccination-records" health />;
}

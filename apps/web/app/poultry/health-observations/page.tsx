import { PoultryRecordPage } from "../../../components/poultry-pages";

export default function HealthObservationsPage() {
  return <PoultryRecordPage title="Health Observations" type="health" endpoint="/poultry/health-observations" health />;
}

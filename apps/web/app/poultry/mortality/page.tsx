import { PoultryRecordPage } from "../../../components/poultry-pages";

export default function MortalityRecordsPage() {
  return <PoultryRecordPage title="Mortality Records" type="mortality" endpoint="/poultry/mortality-records" />;
}

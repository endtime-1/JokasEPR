import { PoultryRecordPage } from "../../../components/poultry-pages";

export default function BirdWeightPage() {
  return <PoultryRecordPage title="Bird Weight Records" type="weights" endpoint="/poultry/bird-weight-records" />;
}

import { FeedRecordListPage } from "../../../components/feed-production-pages";

export default function RawMaterialUsagePage() {
  return <FeedRecordListPage title="Raw Material Usage" endpoint="/feed-production/raw-material-usage" subtitle="Raw material issue, cost, wastage, and batch usage records." />;
}

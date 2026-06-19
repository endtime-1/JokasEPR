import { MaintenanceListPage } from "../../../components/maintenance-pages";

export default function Page() {
  return <MaintenanceListPage title="Downtime Report" endpoint="/maintenance/downtime" subtitle="Machine and equipment downtime by asset, reason, duration, and status." />;
}


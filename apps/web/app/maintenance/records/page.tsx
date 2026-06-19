import { MaintenanceListPage } from "../../../components/maintenance-pages";

export default function Page() {
  return <MaintenanceListPage title="Repair Records" endpoint="/maintenance/records" subtitle="Completed preventive, corrective, inspection, calibration, and repair work." />;
}


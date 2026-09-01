import { Suspense } from "react";
import { ReportNavigatorPage } from "../../../components/report-navigator";

export default function Page() {
  return (
    <Suspense fallback={null}>
      <ReportNavigatorPage />
    </Suspense>
  );
}

import type { ReactNode } from "react";
import { ModuleNav } from "../../../components/module-nav";
import { MAINTENANCE_GROUPS } from "../../../components/module-navs";

export default function MaintenanceLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <ModuleNav groups={MAINTENANCE_GROUPS} ariaLabel="Maintenance sections" />
      {children}
    </>
  );
}

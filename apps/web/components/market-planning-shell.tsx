"use client";

import { ModuleNav } from "./module-nav";
import { MARKET_PLANNING_GROUPS } from "./module-navs";

export function MarketPlanningShell({ children }: { children: React.ReactNode }) {
  return (
    <>
      <ModuleNav groups={MARKET_PLANNING_GROUPS} />
      {children}
    </>
  );
}

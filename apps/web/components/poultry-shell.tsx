"use client";

import { ModuleNav } from "./module-nav";
import { POULTRY_GROUPS } from "./module-navs";

export function PoultryShell({ children }: { children: React.ReactNode }) {
  return (
    <>
      <ModuleNav groups={POULTRY_GROUPS} />
      {children}
    </>
  );
}

"use client";

import { ModuleNav } from "./module-nav";
import { SOYA_GROUPS } from "./module-navs";

export function SoyaProcessingShell({ children }: { children: React.ReactNode }) {
  return (
    <>
      <ModuleNav groups={SOYA_GROUPS} />
      {children}
    </>
  );
}

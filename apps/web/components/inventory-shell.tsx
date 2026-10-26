"use client";

import { ModuleNav } from "./module-nav";
import { INVENTORY_GROUPS } from "./module-navs";

export function InventoryShell({ children }: { children: React.ReactNode }) {
  return (
    <>
      <ModuleNav groups={INVENTORY_GROUPS} />
      {children}
    </>
  );
}

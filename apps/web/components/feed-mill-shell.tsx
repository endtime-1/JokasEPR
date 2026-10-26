"use client";

import { ModuleNav } from "./module-nav";
import { FEED_GROUPS } from "./module-navs";

export function FeedMillShell({ children }: { children: React.ReactNode }) {
  return (
    <>
      <ModuleNav groups={FEED_GROUPS} />
      {children}
    </>
  );
}

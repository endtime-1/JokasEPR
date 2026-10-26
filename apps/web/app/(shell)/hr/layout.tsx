import type { ReactNode } from "react";
import { HRNavBar } from "../../../components/hr-nav";

// One navigation bar for every HR page (it used to be repeated inside each of 23 pages).
export default function HRLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <HRNavBar />
      {children}
    </>
  );
}

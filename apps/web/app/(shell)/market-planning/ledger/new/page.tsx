"use client";
import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { LedgerPlanFormPage } from "../../../../../components/marketing-ledger-pages";

function Content() {
  const params = useSearchParams();
  return <LedgerPlanFormPage initialWeek={params.get("week") ?? undefined} initialMarketer={params.get("marketer") ?? undefined} />;
}

export default function Page() {
  return (
    <Suspense>
      <Content />
    </Suspense>
  );
}

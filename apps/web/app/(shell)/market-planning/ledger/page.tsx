"use client";
import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { LedgerWeekPage } from "../../../../components/marketing-ledger-pages";

function Content() {
  const params = useSearchParams();
  return <LedgerWeekPage initialWeek={params.get("week") ?? undefined} />;
}

export default function Page() {
  return (
    <Suspense>
      <Content />
    </Suspense>
  );
}

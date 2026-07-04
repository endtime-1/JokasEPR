"use client";
import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { QualityChecksPage } from "../../../components/quality-pages";

function ChecksContent() {
  const params = useSearchParams();
  return <QualityChecksPage filterType={params.get("checkType") ?? undefined} />;
}

export default function Page() {
  return (
    <Suspense>
      <ChecksContent />
    </Suspense>
  );
}

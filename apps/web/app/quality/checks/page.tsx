"use client";
import { useSearchParams } from "next/navigation";
import { QualityChecksPage } from "../../../components/quality-pages";

export default function Page() {
  const params = useSearchParams();
  return <QualityChecksPage filterType={params.get("checkType") ?? undefined} />;
}

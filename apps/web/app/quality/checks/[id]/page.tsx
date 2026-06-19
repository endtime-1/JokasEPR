"use client";
import { useParams } from "next/navigation";
import { QualityCheckDetailPage } from "../../../../components/quality-pages";

export default function Page() {
  const { id } = useParams<{ id: string }>();
  return <QualityCheckDetailPage id={id} />;
}

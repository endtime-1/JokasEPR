"use client";
import { useParams } from "next/navigation";
import { EmployeeDetailPage } from "../../../../components/hr-pages";

export default function Page() {
  const { id } = useParams<{ id: string }>();
  return <EmployeeDetailPage id={id} />;
}

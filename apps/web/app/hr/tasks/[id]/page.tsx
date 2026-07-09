"use client";
import { useParams } from "next/navigation";
import { TaskDetailPage } from "../../../../components/hr-pages";

export default function Page() {
  const { id } = useParams<{ id: string }>();
  return <TaskDetailPage id={id} />;
}

import { redirect } from "next/navigation";

// SchedulePage always renders its create form inline above the list — there
// is no separate create-only view to route to, unlike Machines/Equipment.
// This route used to duplicate the whole page byte-for-byte; redirect to the
// one real page instead of maintaining two copies that can drift apart.
export default function Page() {
  redirect("/maintenance/schedules");
}

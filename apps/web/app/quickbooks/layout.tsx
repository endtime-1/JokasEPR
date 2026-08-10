import { AppShell } from "../../components/app-shell";

export default function QuickbooksLayout({ children }: { children: React.ReactNode }) {
  return <AppShell>{children}</AppShell>;
}

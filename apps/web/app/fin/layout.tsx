import { FinShell } from "../../components/fin/fin-shell";

export default function FinLayout({ children }: { children: React.ReactNode }) {
  return <FinShell>{children}</FinShell>;
}

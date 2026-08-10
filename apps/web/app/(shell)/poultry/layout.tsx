import { PoultryShell } from "../../../components/poultry-shell";

export default function PoultryLayout({ children }: { children: React.ReactNode }) {
  return <PoultryShell>{children}</PoultryShell>;
}

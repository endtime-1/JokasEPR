import { SoyaProcessingShell } from "../../components/soya-processing-shell";

export default function SoyaProcessingLayout({ children }: { children: React.ReactNode }) {
  return <SoyaProcessingShell>{children}</SoyaProcessingShell>;
}

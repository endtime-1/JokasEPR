import { FeedMillShell } from "../../components/feed-mill-shell";

export default function FeedProductionLayout({ children }: { children: React.ReactNode }) {
  return <FeedMillShell>{children}</FeedMillShell>;
}

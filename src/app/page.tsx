import { DashboardShell } from "@/components/dashboard-shell";
import { getDashboardState } from "@/lib/marketing";

export const dynamic = "force-dynamic";

export default async function Home() {
  const dashboard = await getDashboardState();

  return <DashboardShell initialState={dashboard} />;
}

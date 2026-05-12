import { DashboardShell } from "@/components/dashboard-shell";
import { getDashboardState } from "@/lib/marketing";

export default async function Home() {
  const dashboard = await getDashboardState();

  return <DashboardShell initialState={dashboard} />;
}

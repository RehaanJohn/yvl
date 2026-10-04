import Dashboard from "../components/Dashboard";

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ demo?: string }>;
}) {
  const params = await searchParams;
  return <Dashboard initialRehearsal={params.demo === "1"} />;
}

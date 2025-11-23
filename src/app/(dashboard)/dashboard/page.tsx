export default function DashboardPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-heading-1 font-bold text-foreground">Dashboard</h1>
        <p className="text-body text-muted-foreground mt-2">
          Welcome to your dashboard. You have successfully logged in.
        </p>
      </div>
      <div
        data-testid="dashboard-content"
        className="rounded-lg border bg-card p-6"
      >
        <p className="text-body text-card-foreground">
          Your dashboard content will appear here.
        </p>
      </div>
    </div>
  );
}

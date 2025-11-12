export default function DashboardPage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-24">
      <div
        data-testid="dashboard-content"
        className="z-10 max-w-5xl w-full items-center justify-center font-mono text-sm"
      >
        <h1 className="text-4xl font-bold text-center mb-8">Dashboard</h1>
        <p className="text-center text-gray-600">
          Welcome to your dashboard. You have successfully logged in.
        </p>
      </div>
    </main>
  );
}

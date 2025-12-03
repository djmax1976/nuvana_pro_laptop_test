"use client";

/**
 * MyStore Terminal Dashboard Home Page
 *
 * @requirements
 * - AC #1: Dashboard home page for terminal operators
 */
export default function MyStoreDashboardPage() {
  return (
    <div className="space-y-6" data-testid="mystore-dashboard-page">
      <div className="space-y-1">
        <h1 className="text-heading-2 font-bold text-foreground">
          Terminal Dashboard
        </h1>
        <p className="text-muted-foreground">
          Select a terminal from the sidebar to begin operations.
        </p>
      </div>
    </div>
  );
}

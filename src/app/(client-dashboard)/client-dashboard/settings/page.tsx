"use client";

/**
 * Client Dashboard Settings Page
 * Displays settings and configuration options for the client owner
 *
 * Status: Coming Soon
 */

export default function SettingsPage() {
  return (
    <div className="space-y-6" data-testid="settings-page">
      {/* Page Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold">Settings</h1>
          <p className="text-sm text-muted-foreground mt-2">
            Manage your account settings and preferences
          </p>
        </div>
      </div>

      {/* Content Area - Coming Soon */}
      <div className="rounded-lg border border-dashed p-8 text-center">
        <p className="text-muted-foreground">Settings page coming soon</p>
      </div>
    </div>
  );
}

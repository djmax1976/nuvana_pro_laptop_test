"use client";

/**
 * Admin Shift Settings Page (Placeholder)
 * Future: Configuration for shift policies, variance thresholds, and system-wide shift settings
 */

import { Clock, Settings } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function AdminShiftSettingsPage() {
  return (
    <div className="space-y-6" data-testid="admin-shift-settings-page">
      {/* Page Header */}
      <div>
        <h1 className="text-2xl font-bold">Shift Settings</h1>
        <p className="text-sm text-muted-foreground mt-2">
          Configure shift policies and system-wide settings
        </p>
      </div>

      {/* Coming Soon Card */}
      <Card className="border-dashed">
        <CardHeader className="text-center pb-2">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-muted">
            <Clock className="h-8 w-8 text-muted-foreground" />
          </div>
          <CardTitle className="text-xl">Coming Soon</CardTitle>
        </CardHeader>
        <CardContent className="text-center">
          <p className="text-muted-foreground mb-6">
            Shift configuration and settings are under development.
          </p>
          <div className="grid gap-4 md:grid-cols-3 text-left max-w-2xl mx-auto">
            <div className="flex items-start gap-3 p-3 rounded-lg bg-muted/50">
              <Settings className="h-5 w-5 text-muted-foreground mt-0.5" />
              <div>
                <p className="font-medium text-sm">Variance Thresholds</p>
                <p className="text-xs text-muted-foreground">
                  Configure acceptable variance amounts and percentages
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3 p-3 rounded-lg bg-muted/50">
              <Settings className="h-5 w-5 text-muted-foreground mt-0.5" />
              <div>
                <p className="font-medium text-sm">Shift Policies</p>
                <p className="text-xs text-muted-foreground">
                  Set rules for shift duration and overlap
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3 p-3 rounded-lg bg-muted/50">
              <Settings className="h-5 w-5 text-muted-foreground mt-0.5" />
              <div>
                <p className="font-medium text-sm">Approval Workflows</p>
                <p className="text-xs text-muted-foreground">
                  Define variance approval requirements
                </p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

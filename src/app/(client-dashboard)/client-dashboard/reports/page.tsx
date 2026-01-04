"use client";

/**
 * Reports Index Page
 *
 * Main entry point for all report types.
 *
 * Phase 6: Frontend & Admin UI
 *
 * Security Considerations (FE-001: STATE_MANAGEMENT):
 * - Page title uses centralized context for consistent header display
 */

import Link from "next/link";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { CalendarDays, Calendar, CalendarRange, Clock } from "lucide-react";
import { usePageTitleEffect } from "@/contexts/PageTitleContext";

const reportTypes = [
  {
    title: "Shift Reports",
    description: "View individual shift details with X and Z reports",
    href: "/client-dashboard/reports/shifts",
    icon: Clock,
  },
  {
    title: "Daily Reports",
    description: "Day-by-day sales summaries with calendar navigation",
    href: "/client-dashboard/reports/daily",
    icon: CalendarDays,
  },
  {
    title: "Weekly Reports",
    description: "Weekly aggregated sales summaries and trends",
    href: "/client-dashboard/reports/weekly",
    icon: Calendar,
  },
  {
    title: "Monthly Reports",
    description: "Monthly aggregated summaries with weekly breakdown",
    href: "/client-dashboard/reports/monthly",
    icon: CalendarRange,
  },
];

export default function ReportsPage() {
  // Set page title in header (FE-001: STATE_MANAGEMENT)
  usePageTitleEffect("Reports");

  return (
    <div className="space-y-6" data-testid="client-reports-page">
      <div className="grid gap-4 md:grid-cols-2">
        {reportTypes.map((report) => {
          const Icon = report.icon;
          return (
            <Link key={report.href} href={report.href}>
              <Card className="h-full cursor-pointer transition-colors hover:bg-muted/50">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Icon className="h-5 w-5" />
                    {report.title}
                  </CardTitle>
                  <CardDescription>{report.description}</CardDescription>
                </CardHeader>
              </Card>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

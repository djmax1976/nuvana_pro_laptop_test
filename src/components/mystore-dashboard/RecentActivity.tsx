"use client";

import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";

/**
 * RecentActivity Component
 *
 * Displays an activity feed with avatar initials,
 * action description, time ago, and meta info
 *
 * Story: MyStore Dashboard Redesign
 */

// Sample activity data - will be replaced with real API data
const activities = [
  {
    id: "1",
    initials: "JD",
    title: "John Davis closed Shift #445",
    time: "32 minutes ago",
    meta: "$3,245.00",
    color: "primary" as const,
  },
  {
    id: "2",
    initials: "SM",
    title: "Sarah Miller opened current shift",
    time: "1 hour ago",
    meta: "Shift #446",
    color: "success" as const,
  },
  {
    id: "3",
    initials: "LP",
    title: "Lottery Pack #2847 activated",
    time: "1 hour ago",
    meta: "$5 Game",
    color: "warning" as const,
  },
  {
    id: "4",
    initials: "JD",
    title: "Cash drop performed",
    time: "2 hours ago",
    meta: "$500.00",
    color: "primary" as const,
  },
];

const avatarColors = {
  primary: "bg-primary/10 text-primary",
  success: "bg-success/10 text-success",
  warning: "bg-warning/10 text-warning",
};

export function RecentActivity() {
  return (
    <Card data-testid="recent-activity">
      <CardHeader className="flex flex-row items-center justify-between p-5 border-b">
        <CardTitle className="text-base font-semibold">
          Recent Activity
        </CardTitle>
        <span className="text-xs text-muted-foreground">Last 2 hours</span>
      </CardHeader>
      <CardContent className="p-5">
        <ul className="space-y-0">
          {activities.map((activity, index) => (
            <li
              key={activity.id}
              className={`flex gap-3 py-3.5 ${index < activities.length - 1 ? "border-b" : ""}`}
            >
              <div
                className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 text-sm font-semibold ${avatarColors[activity.color]}`}
              >
                {activity.initials}
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-medium text-foreground">
                  {activity.title}
                </div>
                <div className="text-xs text-muted-foreground">
                  {activity.time}
                </div>
              </div>
              <div className="font-mono text-xs text-primary whitespace-nowrap">
                {activity.meta}
              </div>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

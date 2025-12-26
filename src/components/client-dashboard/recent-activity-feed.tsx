"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

/**
 * Activity item type
 */
type ActivityType = "shift-close" | "shift-open" | "lottery" | "cash-drop";

/**
 * Color mapping for activity types
 */
const ACTIVITY_COLORS: Record<ActivityType, { bg: string; text: string }> = {
  "shift-close": { bg: "bg-primary/10", text: "text-primary" },
  "shift-open": { bg: "bg-green-500/10", text: "text-green-600" },
  lottery: { bg: "bg-orange-500/10", text: "text-orange-600" },
  "cash-drop": { bg: "bg-primary/10", text: "text-primary" },
};

interface ActivityItem {
  id: string;
  type: ActivityType;
  initials: string;
  title: string;
  time: string;
  meta?: string;
}

interface RecentActivityFeedProps {
  className?: string;
  activities?: ActivityItem[];
  timeLabel?: string;
}

/**
 * Default mock activities
 */
const DEFAULT_ACTIVITIES: ActivityItem[] = [
  {
    id: "1",
    type: "shift-close",
    initials: "JD",
    title: "John Davis closed Shift #445",
    time: "32 minutes ago",
    meta: "$3,245.00",
  },
  {
    id: "2",
    type: "shift-open",
    initials: "SM",
    title: "Sarah Miller opened current shift",
    time: "1 hour ago",
    meta: "Shift #446",
  },
  {
    id: "3",
    type: "lottery",
    initials: "LP",
    title: "Lottery Pack #2847 activated",
    time: "1 hour ago",
    meta: "$5 Game",
  },
  {
    id: "4",
    type: "cash-drop",
    initials: "JD",
    title: "Cash drop performed",
    time: "2 hours ago",
    meta: "$500.00",
  },
];

/**
 * RecentActivityFeed - Activity timeline feed
 *
 * @description Enterprise-grade activity feed with:
 * - Avatar initials with color coding
 * - Activity title and timestamp
 * - Meta information (amount, shift ID, etc.)
 *
 * @accessibility WCAG 2.1 AA compliant with proper list semantics
 */
export function RecentActivityFeed({
  className,
  activities = DEFAULT_ACTIVITIES,
  timeLabel = "Last 2 hours",
}: RecentActivityFeedProps) {
  return (
    <Card
      className={cn("shadow-sm", className)}
      data-testid="recent-activity-card"
      role="region"
      aria-labelledby="recent-activity-title"
    >
      <CardHeader className="flex flex-row items-center justify-between pb-4">
        <CardTitle
          id="recent-activity-title"
          className="text-base font-semibold"
        >
          Recent Activity
        </CardTitle>
        <span className="text-xs text-muted-foreground">{timeLabel}</span>
      </CardHeader>
      <CardContent>
        {activities.length === 0 ? (
          <p className="text-center py-8 text-muted-foreground text-sm">
            No recent activity
          </p>
        ) : (
          <ul className="space-y-0" role="list" aria-label="Recent activities">
            {activities.map((activity, index) => {
              const colors = ACTIVITY_COLORS[activity.type];
              return (
                <li
                  key={activity.id}
                  className={cn(
                    "flex gap-3 py-3.5",
                    index !== activities.length - 1 && "border-b border-border",
                  )}
                  data-testid={`activity-item-${activity.id}`}
                >
                  {/* Avatar */}
                  <div
                    className={cn(
                      "w-9 h-9 rounded-full flex items-center justify-center text-sm font-semibold flex-shrink-0",
                      colors.bg,
                      colors.text,
                    )}
                    aria-hidden="true"
                  >
                    {activity.initials}
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">
                      {activity.title}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {activity.time}
                    </p>
                  </div>

                  {/* Meta */}
                  {activity.meta && (
                    <div className="text-xs font-mono text-primary whitespace-nowrap">
                      {activity.meta}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

/**
 * RecentActivityFeedSkeleton - Loading state
 */
export function RecentActivityFeedSkeleton() {
  return (
    <Card className="shadow-sm animate-pulse">
      <CardHeader className="flex flex-row items-center justify-between pb-4">
        <div className="h-5 w-28 bg-muted rounded" />
        <div className="h-3 w-20 bg-muted rounded" />
      </CardHeader>
      <CardContent>
        <div className="space-y-0">
          {[...Array(4)].map((_, i) => (
            <div
              key={i}
              className={cn(
                "flex gap-3 py-3.5",
                i !== 3 && "border-b border-border",
              )}
            >
              <div className="w-9 h-9 rounded-full bg-muted" />
              <div className="flex-1">
                <div className="h-4 w-48 bg-muted rounded mb-1" />
                <div className="h-3 w-24 bg-muted rounded" />
              </div>
              <div className="h-3 w-16 bg-muted rounded" />
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

export type { ActivityItem, ActivityType };

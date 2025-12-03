"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";

/**
 * Clock In/Out Placeholder Page
 *
 * @requirements
 * - AC #4: Display "Coming Soon" placeholder message
 * - Indicate feature is under development
 */
export default function ClockInOutPage() {
  return (
    <div className="space-y-6" data-testid="coming-soon-message">
      <div className="flex items-center gap-4">
        <Link href="/mystore">
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-5 w-5" />
          </Button>
        </Link>
        <h1 className="text-heading-2 font-bold text-foreground">
          Clock In/Out
        </h1>
      </div>

      <div className="flex flex-col items-center justify-center py-16 text-center">
        <div className="space-y-4">
          <h2 className="text-heading-3 font-semibold text-foreground">
            Coming Soon
          </h2>
          <p className="text-muted-foreground max-w-md">
            The Clock In/Out feature is currently under development. This
            functionality will be available in a future update.
          </p>
        </div>
      </div>
    </div>
  );
}

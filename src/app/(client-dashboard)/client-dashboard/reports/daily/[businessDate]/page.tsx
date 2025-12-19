"use client";

/**
 * Daily Report Detail Page
 *
 * Shows detailed day summary for a specific date.
 *
 * Phase 6.4: Day Summary Dashboard
 */

import { use } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { useDaySummaryByDate } from "@/lib/api/day-summaries";
import { DaySummaryDetail } from "@/components/reports/DaySummaryDetail";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowLeft, AlertCircle } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

interface DailyReportDetailPageProps {
  params: Promise<{ businessDate: string }>;
}

export default function DailyReportDetailPage({
  params,
}: DailyReportDetailPageProps) {
  const { businessDate } = use(params);
  const searchParams = useSearchParams();
  const router = useRouter();
  const storeId = searchParams.get("storeId") || "";

  const { data, isLoading, error } = useDaySummaryByDate(
    storeId,
    businessDate,
    {
      enabled: !!storeId && !!businessDate,
    },
  );

  const handleBack = () => {
    router.push("/client-dashboard/reports/daily");
  };

  if (!storeId) {
    return (
      <div className="space-y-6">
        <Button variant="ghost" onClick={handleBack}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Daily Reports
        </Button>
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Missing Store</AlertTitle>
          <AlertDescription>
            No store ID provided. Please select a store from the daily reports
            page.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Button variant="ghost" onClick={handleBack}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Daily Reports
        </Button>
        <div className="space-y-4">
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-48 w-full" />
          <Skeleton className="h-48 w-full" />
        </div>
      </div>
    );
  }

  if (error || !data?.data) {
    return (
      <div className="space-y-6">
        <Button variant="ghost" onClick={handleBack}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Daily Reports
        </Button>
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>
            {error instanceof Error
              ? error.message
              : "Failed to load day summary"}
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Button variant="ghost" onClick={handleBack}>
        <ArrowLeft className="mr-2 h-4 w-4" />
        Back to Daily Reports
      </Button>
      <DaySummaryDetail summary={data.data} />
    </div>
  );
}

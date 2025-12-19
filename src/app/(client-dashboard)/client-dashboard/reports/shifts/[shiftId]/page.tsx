"use client";

/**
 * Shift Detail Page
 *
 * Shows shift details with X and Z reports.
 *
 * Phase 6.3/6.5: Enhanced Shift Reports & X/Z Report Viewer
 */

import { use, useState } from "react";
import { useRouter } from "next/navigation";
import { useShift } from "@/lib/api/shifts";
import {
  useXReportsByShift,
  useZReportByShift,
  useGenerateXReport,
} from "@/lib/api/reports";
import { XReportViewer } from "@/components/reports/XReportViewer";
import { ZReportViewer } from "@/components/reports/ZReportViewer";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { formatCurrency } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import {
  ArrowLeft,
  Clock,
  DollarSign,
  FileText,
  FileCheck,
  Plus,
  Loader2,
  AlertCircle,
  User,
  Calendar,
} from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

interface ShiftDetailPageProps {
  params: Promise<{ shiftId: string }>;
}

export default function ShiftDetailPage({ params }: ShiftDetailPageProps) {
  const { shiftId } = use(params);
  const router = useRouter();
  const { toast } = useToast();
  const [selectedXReport, setSelectedXReport] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);

  const {
    data: shiftData,
    isLoading: shiftLoading,
    error: shiftError,
  } = useShift(shiftId);
  const shift = shiftData?.data;

  const {
    data: xReportsData,
    isLoading: xReportsLoading,
    refetch: refetchXReports,
  } = useXReportsByShift(shiftId, { enabled: !!shiftId });
  const xReports = xReportsData?.data || [];

  const { data: zReportData, isLoading: zReportLoading } = useZReportByShift(
    shiftId,
    { enabled: !!shiftId && shift?.status === "closed" },
  );
  const zReport = zReportData?.data;

  const generateXReportMutation = useGenerateXReport();

  const handleBack = () => {
    router.push("/client-dashboard/reports/shifts");
  };

  const handleGenerateXReport = async () => {
    setIsGenerating(true);
    try {
      await generateXReportMutation.mutateAsync(shiftId);
      await refetchXReports();
      toast({
        title: "X Report Generated",
        description: "A new interim report has been created.",
      });
    } catch (err) {
      toast({
        title: "Error",
        description:
          err instanceof Error ? err.message : "Failed to generate X Report",
        variant: "destructive",
      });
    } finally {
      setIsGenerating(false);
    }
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleString("en-US", {
      weekday: "short",
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "open":
        return (
          <Badge className="bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300">
            Open
          </Badge>
        );
      case "closing":
        return (
          <Badge className="bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-300">
            Closing
          </Badge>
        );
      case "closed":
        return (
          <Badge className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300">
            Closed
          </Badge>
        );
      default:
        return <Badge variant="secondary">{status}</Badge>;
    }
  };

  if (shiftLoading) {
    return (
      <div className="space-y-6">
        <Button variant="ghost" onClick={handleBack}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Shifts
        </Button>
        <div className="space-y-4">
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-48 w-full" />
        </div>
      </div>
    );
  }

  if (shiftError || !shift) {
    return (
      <div className="space-y-6">
        <Button variant="ghost" onClick={handleBack}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Shifts
        </Button>
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>
            {shiftError instanceof Error
              ? shiftError.message
              : "Failed to load shift details"}
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <Button variant="ghost" onClick={handleBack}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Shifts
        </Button>
        {shift.status === "open" && (
          <Button onClick={handleGenerateXReport} disabled={isGenerating}>
            {isGenerating ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Plus className="mr-2 h-4 w-4" />
            )}
            Generate X Report
          </Button>
        )}
      </div>

      {/* Shift Summary */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <Clock className="h-5 w-5" />
              Shift Details
            </CardTitle>
            {getStatusBadge(shift.status)}
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <div className="flex items-center gap-3">
              <User className="h-5 w-5 text-muted-foreground" />
              <div>
                <p className="text-sm text-muted-foreground">Cashier</p>
                <p className="font-medium">
                  {shift.cashier_name || shift.cashier_id}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Calendar className="h-5 w-5 text-muted-foreground" />
              <div>
                <p className="text-sm text-muted-foreground">Opened</p>
                <p className="font-medium">{formatDate(shift.opened_at)}</p>
              </div>
            </div>
            {shift.closed_at && (
              <div className="flex items-center gap-3">
                <Calendar className="h-5 w-5 text-muted-foreground" />
                <div>
                  <p className="text-sm text-muted-foreground">Closed</p>
                  <p className="font-medium">{formatDate(shift.closed_at)}</p>
                </div>
              </div>
            )}
            <div className="flex items-center gap-3">
              <DollarSign className="h-5 w-5 text-muted-foreground" />
              <div>
                <p className="text-sm text-muted-foreground">Net Sales</p>
                <p className="font-medium">
                  {shift.net_sales !== undefined
                    ? formatCurrency(shift.net_sales)
                    : "-"}
                </p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Reports Tabs */}
      <Tabs defaultValue="x-reports">
        <TabsList>
          <TabsTrigger value="x-reports" className="flex items-center gap-2">
            <FileText className="h-4 w-4" />X Reports ({xReports.length})
          </TabsTrigger>
          <TabsTrigger
            value="z-report"
            className="flex items-center gap-2"
            disabled={shift.status !== "closed"}
          >
            <FileCheck className="h-4 w-4" />Z Report
          </TabsTrigger>
        </TabsList>

        <TabsContent value="x-reports" className="mt-4">
          {xReportsLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-16 w-full" />
              ))}
            </div>
          ) : xReports.length === 0 ? (
            <Card>
              <CardContent className="py-8 text-center text-muted-foreground">
                <FileText className="mx-auto h-12 w-12 mb-4 opacity-50" />
                <p>No X Reports generated for this shift</p>
                {shift.status === "open" && (
                  <Button
                    variant="outline"
                    className="mt-4"
                    onClick={handleGenerateXReport}
                    disabled={isGenerating}
                  >
                    {isGenerating ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <Plus className="mr-2 h-4 w-4" />
                    )}
                    Generate First X Report
                  </Button>
                )}
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-2">
              {xReports.map((report) => (
                <Card
                  key={report.x_report_id}
                  className="cursor-pointer hover:bg-muted/50 transition-colors"
                  onClick={() => setSelectedXReport(report.x_report_id)}
                >
                  <CardContent className="py-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-4">
                        <FileText className="h-5 w-5 text-muted-foreground" />
                        <div>
                          <p className="font-medium">
                            X Report #{report.x_number}
                          </p>
                          <p className="text-sm text-muted-foreground">
                            Generated: {formatDate(report.generated_at)}
                          </p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="font-medium">
                          {formatCurrency(report.net_sales)}
                        </p>
                        <p className="text-sm text-muted-foreground">
                          {report.transaction_count} transactions
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="z-report" className="mt-4">
          {zReportLoading ? (
            <div className="space-y-4">
              <Skeleton className="h-8 w-64" />
              <Skeleton className="h-48 w-full" />
            </div>
          ) : zReport ? (
            <ZReportViewer report={zReport} />
          ) : (
            <Card>
              <CardContent className="py-8 text-center text-muted-foreground">
                <FileCheck className="mx-auto h-12 w-12 mb-4 opacity-50" />
                <p>
                  {shift.status === "closed"
                    ? "Z Report not found for this shift"
                    : "Z Report will be available after the shift is closed"}
                </p>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>

      {/* X Report Dialog */}
      <Dialog
        open={!!selectedXReport}
        onOpenChange={() => setSelectedXReport(null)}
      >
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>X Report Details</DialogTitle>
          </DialogHeader>
          {selectedXReport &&
            xReports.find((r) => r.x_report_id === selectedXReport) && (
              <XReportViewer
                report={
                  xReports.find((r) => r.x_report_id === selectedXReport)!
                }
              />
            )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

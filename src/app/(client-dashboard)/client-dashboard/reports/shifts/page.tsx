"use client";

/**
 * Shift Reports Page
 *
 * Lists shifts with access to X and Z reports.
 *
 * Phase 6.3: Enhanced Shift Reports UI
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useShifts } from "@/lib/api/shifts";
import { useStores } from "@/lib/api/stores";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { formatCurrency } from "@/lib/utils";
import {
  Store,
  Clock,
  FileText,
  FileCheck,
  Eye,
  Calendar,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";

export default function ShiftReportsPage() {
  const router = useRouter();
  const [selectedStoreId, setSelectedStoreId] = useState<string>("");
  const [currentDate, setCurrentDate] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), now.getDate());
  });

  const { data: storesData, isLoading: storesLoading } = useStores();
  const stores = storesData?.data || [];

  // Calculate date range for current week
  const startDate = new Date(currentDate);
  startDate.setDate(startDate.getDate() - 7);
  const endDate = new Date(currentDate);

  const { data: shiftsData, isLoading: shiftsLoading } = useShifts(
    {
      store_id: selectedStoreId || undefined,
      from: startDate.toISOString().split("T")[0],
      to: endDate.toISOString().split("T")[0],
    },
    undefined,
    { enabled: !!selectedStoreId },
  );
  const shifts = shiftsData?.shifts || [];

  const handlePrevWeek = () => {
    const newDate = new Date(currentDate);
    newDate.setDate(newDate.getDate() - 7);
    setCurrentDate(newDate);
  };

  const handleNextWeek = () => {
    const newDate = new Date(currentDate);
    newDate.setDate(newDate.getDate() + 7);
    setCurrentDate(newDate);
  };

  const handleViewShift = (shiftId: string) => {
    router.push(`/client-dashboard/reports/shifts/${shiftId}`);
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
    });
  };

  const formatTime = (dateStr: string) => {
    return new Date(dateStr).toLocaleTimeString("en-US", {
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const formatDateRange = () => {
    const startStr = startDate.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
    });
    const endStr = endDate.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
    return `${startStr} - ${endStr}`;
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "OPEN":
        return (
          <Badge className="bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300">
            Open
          </Badge>
        );
      case "CLOSING":
        return (
          <Badge className="bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-300">
            Closing
          </Badge>
        );
      case "CLOSED":
        return (
          <Badge className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300">
            Closed
          </Badge>
        );
      default:
        return <Badge variant="secondary">{status}</Badge>;
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Shift Reports</h1>
          <p className="text-muted-foreground">
            View shift details and X/Z reports
          </p>
        </div>
      </div>

      {/* Store Selector */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center gap-2">
            <Store className="h-5 w-5" />
            Select Store
          </CardTitle>
        </CardHeader>
        <CardContent>
          {storesLoading ? (
            <Skeleton className="h-10 w-64" />
          ) : (
            <Select value={selectedStoreId} onValueChange={setSelectedStoreId}>
              <SelectTrigger className="w-64">
                <SelectValue placeholder="Select a store" />
              </SelectTrigger>
              <SelectContent>
                {stores.map((store) => (
                  <SelectItem key={store.store_id} value={store.store_id}>
                    {store.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </CardContent>
      </Card>

      {selectedStoreId && (
        <>
          {/* Date Range Navigation */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg flex items-center gap-2">
                  <Calendar className="h-5 w-5" />
                  {formatDateRange()}
                </CardTitle>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={handlePrevWeek}
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={handleNextWeek}
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </CardHeader>
          </Card>

          {/* Shifts Table */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Clock className="h-5 w-5" />
                Shifts
              </CardTitle>
            </CardHeader>
            <CardContent>
              {shiftsLoading ? (
                <div className="space-y-2">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <Skeleton key={i} className="h-12 w-full" />
                  ))}
                </div>
              ) : shifts.length === 0 ? (
                <p className="text-center text-muted-foreground py-8">
                  No shifts found for this date range
                </p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Cashier</TableHead>
                      <TableHead>Time</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Net Sales</TableHead>
                      <TableHead>Reports</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {shifts.map((shift) => (
                      <TableRow key={shift.shift_id}>
                        <TableCell className="font-medium">
                          {formatDate(shift.opened_at)}
                        </TableCell>
                        <TableCell>
                          {shift.cashier_name || shift.cashier_id}
                        </TableCell>
                        <TableCell>
                          {formatTime(shift.opened_at)}
                          {shift.closed_at &&
                            ` - ${formatTime(shift.closed_at)}`}
                        </TableCell>
                        <TableCell>{getStatusBadge(shift.status)}</TableCell>
                        <TableCell className="text-right">
                          {shift.net_sales !== undefined
                            ? formatCurrency(shift.net_sales)
                            : "-"}
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-1">
                            {(shift.x_report_count ?? 0) > 0 && (
                              <Badge variant="outline" className="text-xs">
                                <FileText className="mr-1 h-3 w-3" />
                                {shift.x_report_count} X
                              </Badge>
                            )}
                            {shift.has_z_report && (
                              <Badge variant="outline" className="text-xs">
                                <FileCheck className="mr-1 h-3 w-3" />Z
                              </Badge>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleViewShift(shift.shift_id)}
                          >
                            <Eye className="mr-2 h-4 w-4" />
                            View
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

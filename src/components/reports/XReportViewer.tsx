"use client";

/**
 * XReportViewer Component
 *
 * Displays an X Report (interim snapshot) with print and export options.
 *
 * Phase 6.5: X/Z Report Viewer
 */

import { XReport } from "@/lib/api/reports";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatCurrency } from "@/lib/utils";
import {
  Printer,
  Download,
  Clock,
  DollarSign,
  CreditCard,
  FolderTree,
  Receipt,
  FileText,
} from "lucide-react";

interface XReportViewerProps {
  report: XReport;
  onPrint?: () => void;
  onExport?: (format: string) => void;
}

export function XReportViewer({
  report,
  onPrint,
  onExport,
}: XReportViewerProps) {
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

  const formatShortDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  };

  const handlePrint = () => {
    onPrint?.();
    window.print();
  };

  return (
    <div className="space-y-6 print:space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between print:justify-center">
        <div className="text-center flex-1">
          <h2 className="text-2xl font-bold print:text-xl">
            X Report #{report.x_number}
          </h2>
          <p className="text-muted-foreground">
            {formatShortDate(report.business_date)}
          </p>
        </div>
        <div className="flex gap-2 print:hidden">
          <Button variant="outline" size="sm" onClick={handlePrint}>
            <Printer className="mr-2 h-4 w-4" />
            Print
          </Button>
          <Button variant="outline" size="sm" onClick={() => onExport?.("pdf")}>
            <Download className="mr-2 h-4 w-4" />
            Export
          </Button>
        </div>
      </div>

      {/* Status Badge */}
      <div className="flex gap-2 justify-center print:justify-center">
        <Badge variant="secondary">
          <FileText className="mr-1 h-3 w-3" />
          Interim Snapshot
        </Badge>
      </div>

      {/* Shift Info */}
      <Card className="print:border-0 print:shadow-none">
        <CardHeader className="pb-2">
          <CardTitle className="text-lg flex items-center gap-2">
            <Clock className="h-5 w-5" />
            Shift Information
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-2 sm:grid-cols-2">
            <div>
              <span className="text-sm text-muted-foreground">Cashier:</span>
              <span className="ml-2 font-medium">
                {report.cashier_name || report.cashier_id}
              </span>
            </div>
            <div>
              <span className="text-sm text-muted-foreground">
                Shift Opened:
              </span>
              <span className="ml-2 font-medium">
                {formatDate(report.shift_opened_at)}
              </span>
            </div>
            <div>
              <span className="text-sm text-muted-foreground">Generated:</span>
              <span className="ml-2 font-medium">
                {formatDate(report.generated_at)}
              </span>
            </div>
            <div>
              <span className="text-sm text-muted-foreground">Status:</span>
              <span className="ml-2 font-medium capitalize">
                {report.shift_status}
              </span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Financial Summary */}
      <Card className="print:border-0 print:shadow-none">
        <CardHeader className="pb-2">
          <CardTitle className="text-lg flex items-center gap-2">
            <DollarSign className="h-5 w-5" />
            Financial Summary (As Of Report Time)
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableBody>
              <TableRow>
                <TableCell className="font-medium">Gross Sales</TableCell>
                <TableCell className="text-right">
                  {formatCurrency(report.gross_sales)}
                </TableCell>
              </TableRow>
              <TableRow>
                <TableCell className="font-medium text-red-600">
                  Returns
                </TableCell>
                <TableCell className="text-right text-red-600">
                  ({formatCurrency(report.returns_total)})
                </TableCell>
              </TableRow>
              <TableRow>
                <TableCell className="font-medium text-amber-600">
                  Discounts
                </TableCell>
                <TableCell className="text-right text-amber-600">
                  ({formatCurrency(report.discounts_total)})
                </TableCell>
              </TableRow>
              <TableRow className="border-t-2 font-bold">
                <TableCell>Net Sales</TableCell>
                <TableCell className="text-right">
                  {formatCurrency(report.net_sales)}
                </TableCell>
              </TableRow>
              <TableRow>
                <TableCell className="font-medium">Tax Collected</TableCell>
                <TableCell className="text-right">
                  {formatCurrency(report.tax_collected)}
                </TableCell>
              </TableRow>
              <TableRow>
                <TableCell className="font-medium">Transactions</TableCell>
                <TableCell className="text-right">
                  {report.transaction_count}
                </TableCell>
              </TableRow>
              <TableRow>
                <TableCell className="font-medium">Items Sold</TableCell>
                <TableCell className="text-right">
                  {report.items_sold_count}
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Cash Drawer */}
      <Card className="print:border-0 print:shadow-none">
        <CardHeader className="pb-2">
          <CardTitle className="text-lg flex items-center gap-2">
            <Receipt className="h-5 w-5" />
            Cash Drawer Status
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableBody>
              <TableRow>
                <TableCell className="font-medium">Opening Cash</TableCell>
                <TableCell className="text-right">
                  {formatCurrency(report.opening_cash)}
                </TableCell>
              </TableRow>
              <TableRow>
                <TableCell className="font-medium">
                  Expected Cash (Current)
                </TableCell>
                <TableCell className="text-right">
                  {formatCurrency(report.expected_cash)}
                </TableCell>
              </TableRow>
              <TableRow>
                <TableCell className="font-medium">Cash In Drawer</TableCell>
                <TableCell className="text-right">
                  {formatCurrency(report.cash_in_drawer)}
                </TableCell>
              </TableRow>
              <TableRow className="border-t-2">
                <TableCell className="font-bold">Current Variance</TableCell>
                <TableCell
                  className={`text-right font-bold ${
                    report.current_variance < -0.01
                      ? "text-red-600"
                      : report.current_variance > 0.01
                        ? "text-amber-600"
                        : "text-green-600"
                  }`}
                >
                  {formatCurrency(report.current_variance)}
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Tender Breakdown */}
      {report.tender_breakdown && report.tender_breakdown.length > 0 && (
        <Card className="print:border-0 print:shadow-none">
          <CardHeader className="pb-2">
            <CardTitle className="text-lg flex items-center gap-2">
              <CreditCard className="h-5 w-5" />
              Tender Breakdown
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Tender Type</TableHead>
                  <TableHead className="text-right">Count</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {report.tender_breakdown.map((tender) => (
                  <TableRow key={tender.tender_code}>
                    <TableCell className="font-medium">
                      {tender.tender_name}
                    </TableCell>
                    <TableCell className="text-right">
                      {tender.transaction_count}
                    </TableCell>
                    <TableCell className="text-right">
                      {formatCurrency(tender.amount)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Department Breakdown */}
      {report.department_breakdown &&
        report.department_breakdown.length > 0 && (
          <Card className="print:border-0 print:shadow-none">
            <CardHeader className="pb-2">
              <CardTitle className="text-lg flex items-center gap-2">
                <FolderTree className="h-5 w-5" />
                Department Breakdown
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Department</TableHead>
                    <TableHead className="text-right">Items</TableHead>
                    <TableHead className="text-right">Sales</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {report.department_breakdown.map((dept) => (
                    <TableRow key={dept.department_code}>
                      <TableCell className="font-medium">
                        {dept.department_name}
                      </TableCell>
                      <TableCell className="text-right">
                        {dept.item_count}
                      </TableCell>
                      <TableCell className="text-right">
                        {formatCurrency(dept.gross_sales)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}

      {/* Footer */}
      <div className="text-center text-xs text-muted-foreground print:mt-8">
        <p>Report ID: {report.x_report_id}</p>
        <p>Shift ID: {report.shift_id}</p>
        <p className="mt-2 italic">
          This is an interim snapshot. Final figures will be in the Z Report.
        </p>
      </div>
    </div>
  );
}

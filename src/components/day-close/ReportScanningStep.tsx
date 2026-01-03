"use client";

/**
 * Report Scanning Step Component
 *
 * Shared component used by both Shift Close (Step 1) and Day Close (Step 2) wizards.
 * Allows users to enter vendor invoices and reports for data extraction.
 *
 * Report Categories:
 * - Lottery Reports: Daily lottery settlement (instant sales, online sales, cashes)
 * - Gaming Reports: Video gaming terminal daily report
 * - Vendor Invoices: Delivery invoices received today
 * - Cash Payouts: Lottery winners, money orders, check cashing
 *
 * @usage
 * - Shift Close: Used as Step 1 (no prior lottery step)
 * - Day Close: Used as Step 2 (after lottery close step)
 *
 * @security
 * - FE-001: STATE_MANAGEMENT - Secure state with useCallback/useMemo
 * - FE-002: FORM_VALIDATION - Input validation for numeric fields
 * - SEC-014: INPUT_VALIDATION - Sanitize all user inputs
 */

import { useState, useCallback, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  FileText,
  Play,
  ClipboardList,
  DollarSign,
  Camera,
  ArrowRight,
  ArrowLeft,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ============ TYPES ============

export interface LotteryReportsData {
  instantSales: number;
  onlineSales: number;
  payouts: number;
}

export interface GamingReportsData {
  netTerminalIncome: number;
  plays: number;
  payouts: number;
}

export interface VendorInvoice {
  id: string;
  vendorName: string;
  amount: number;
}

export interface CashPayoutsData {
  lotteryWinners: number;
  moneyOrders: number;
  checkCashing: number;
}

export interface ReportScanningState {
  lotteryReports: LotteryReportsData | null;
  gamingReports: GamingReportsData | null;
  vendorInvoices: VendorInvoice[];
  cashPayouts: CashPayoutsData | null;
}

interface ReportScanningStepProps {
  storeId: string;
  onComplete: (data: ReportScanningState) => void;
  onBack: () => void;
  canGoBack: boolean;
  initialData: ReportScanningState | null;
}

// ============ HELPER FUNCTIONS ============

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(value);
}

function sanitizeNumericInput(value: string): number {
  const cleaned = value.replace(/[^0-9.]/g, "");
  const parsed = parseFloat(cleaned);
  return isNaN(parsed) ? 0 : parsed;
}

// ============ REPORT SECTION COMPONENT ============

interface ReportSectionProps {
  title: string;
  description: string;
  icon: React.ReactNode;
  iconBgColor: string;
  status: "pending" | "scanned" | "recorded";
  statusCount?: number;
  children: React.ReactNode;
  onScan?: () => void;
}

function ReportSection({
  title,
  description,
  icon,
  iconBgColor,
  status,
  statusCount,
  children,
  onScan,
}: ReportSectionProps) {
  const statusLabel =
    status === "scanned"
      ? statusCount
        ? `${statusCount} Scanned`
        : "Scanned"
      : status === "recorded"
        ? "Recorded"
        : "Pending";

  const statusColor =
    status === "pending"
      ? "bg-amber-100 text-amber-700"
      : "bg-green-100 text-green-700";

  return (
    <div className="border rounded-lg p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-3">
          <div
            className={cn(
              "w-10 h-10 rounded-lg flex items-center justify-center",
              iconBgColor,
            )}
          >
            {icon}
          </div>
          <div>
            <h3 className="font-semibold">{title}</h3>
            <p className="text-sm text-muted-foreground">{description}</p>
          </div>
        </div>
        <Badge className={statusColor}>{statusLabel}</Badge>
      </div>
      {children}
    </div>
  );
}

// ============ MAIN COMPONENT ============

export function ReportScanningStep({
  storeId,
  onComplete,
  onBack,
  canGoBack,
  initialData,
}: ReportScanningStepProps) {
  // ============ STATE ============
  const [lotteryReports, setLotteryReports] = useState<LotteryReportsData>(
    initialData?.lotteryReports ?? {
      instantSales: 0,
      onlineSales: 0,
      payouts: 0,
    },
  );

  const [gamingReports, setGamingReports] = useState<GamingReportsData>(
    initialData?.gamingReports ?? {
      netTerminalIncome: 0,
      plays: 0,
      payouts: 0,
    },
  );

  const [vendorInvoices, setVendorInvoices] = useState<VendorInvoice[]>(
    initialData?.vendorInvoices ?? [],
  );

  const [cashPayouts, setCashPayouts] = useState<CashPayoutsData>(
    initialData?.cashPayouts ?? {
      lotteryWinners: 0,
      moneyOrders: 0,
      checkCashing: 0,
    },
  );

  // Track which sections have been "scanned" (have data)
  const lotteryScanned =
    lotteryReports.instantSales > 0 ||
    lotteryReports.onlineSales > 0 ||
    lotteryReports.payouts > 0;

  const gamingScanned =
    gamingReports.netTerminalIncome > 0 ||
    gamingReports.plays > 0 ||
    gamingReports.payouts > 0;

  const cashPayoutsRecorded =
    cashPayouts.lotteryWinners > 0 ||
    cashPayouts.moneyOrders > 0 ||
    cashPayouts.checkCashing > 0;

  // ============ CALCULATED VALUES ============
  const totalLotterySales = useMemo(
    () => lotteryReports.instantSales + lotteryReports.onlineSales,
    [lotteryReports],
  );

  const totalVendorInvoices = useMemo(
    () => vendorInvoices.reduce((sum, inv) => sum + inv.amount, 0),
    [vendorInvoices],
  );

  // ============ HANDLERS ============
  const handleLotteryChange = useCallback(
    (field: keyof LotteryReportsData, value: string) => {
      setLotteryReports((prev) => ({
        ...prev,
        [field]: sanitizeNumericInput(value),
      }));
    },
    [],
  );

  const handleGamingChange = useCallback(
    (field: keyof GamingReportsData, value: string) => {
      setGamingReports((prev) => ({
        ...prev,
        [field]: sanitizeNumericInput(value),
      }));
    },
    [],
  );

  const handleCashPayoutsChange = useCallback(
    (field: keyof CashPayoutsData, value: string) => {
      setCashPayouts((prev) => ({
        ...prev,
        [field]: sanitizeNumericInput(value),
      }));
    },
    [],
  );

  const handleAddVendorInvoice = useCallback(() => {
    const newInvoice: VendorInvoice = {
      id: `vendor-${Date.now()}`,
      vendorName: "",
      amount: 0,
    };
    setVendorInvoices((prev) => [...prev, newInvoice]);
  }, []);

  const handleVendorInvoiceChange = useCallback(
    (id: string, field: "vendorName" | "amount", value: string) => {
      setVendorInvoices((prev) =>
        prev.map((inv) =>
          inv.id === id
            ? {
                ...inv,
                [field]:
                  field === "amount" ? sanitizeNumericInput(value) : value,
              }
            : inv,
        ),
      );
    },
    [],
  );

  const handleRemoveVendorInvoice = useCallback((id: string) => {
    setVendorInvoices((prev) => prev.filter((inv) => inv.id !== id));
  }, []);

  const handleComplete = useCallback(() => {
    const data: ReportScanningState = {
      lotteryReports: lotteryScanned ? lotteryReports : null,
      gamingReports: gamingScanned ? gamingReports : null,
      vendorInvoices,
      cashPayouts: cashPayoutsRecorded ? cashPayouts : null,
    };
    onComplete(data);
  }, [
    lotteryReports,
    lotteryScanned,
    gamingReports,
    gamingScanned,
    vendorInvoices,
    cashPayouts,
    cashPayoutsRecorded,
    onComplete,
  ]);

  // ============ RENDER ============
  return (
    <div className="space-y-6" data-testid="report-scanning-step">
      <Card>
        <CardContent className="space-y-6 pt-6">
          {/* Lottery Reports */}
          <ReportSection
            title="Lottery Reports"
            description="Daily lottery settlement report from terminal"
            icon={<FileText className="w-6 h-6 text-purple-600" />}
            iconBgColor="bg-purple-100"
            status={lotteryScanned ? "scanned" : "pending"}
          >
            <div className="bg-muted/50 rounded-lg p-3 grid grid-cols-3 gap-4 text-sm">
              <div>
                <label className="text-muted-foreground block mb-1">
                  Instant Sales
                </label>
                <Input
                  type="text"
                  value={lotteryReports.instantSales || ""}
                  onChange={(e) =>
                    handleLotteryChange("instantSales", e.target.value)
                  }
                  placeholder="0.00"
                  className="font-mono"
                  data-testid="lottery-instant-sales-input"
                />
              </div>
              <div>
                <label className="text-muted-foreground block mb-1">
                  Online Sales
                </label>
                <Input
                  type="text"
                  value={lotteryReports.onlineSales || ""}
                  onChange={(e) =>
                    handleLotteryChange("onlineSales", e.target.value)
                  }
                  placeholder="0.00"
                  className="font-mono"
                  data-testid="lottery-online-sales-input"
                />
              </div>
              <div>
                <label className="text-muted-foreground block mb-1">
                  Cashes (Payouts)
                </label>
                <Input
                  type="text"
                  value={lotteryReports.payouts || ""}
                  onChange={(e) =>
                    handleLotteryChange("payouts", e.target.value)
                  }
                  placeholder="0.00"
                  className="font-mono"
                  data-testid="lottery-payouts-input"
                />
              </div>
            </div>
          </ReportSection>

          {/* Gaming Reports */}
          <ReportSection
            title="Gaming Reports"
            description="Video gaming terminal daily report"
            icon={<Play className="w-6 h-6 text-orange-600" />}
            iconBgColor="bg-orange-100"
            status={gamingScanned ? "scanned" : "pending"}
          >
            <div className="bg-muted/50 rounded-lg p-3 grid grid-cols-3 gap-4 text-sm">
              <div>
                <label className="text-muted-foreground block mb-1">
                  Net Terminal Income
                </label>
                <Input
                  type="text"
                  value={gamingReports.netTerminalIncome || ""}
                  onChange={(e) =>
                    handleGamingChange("netTerminalIncome", e.target.value)
                  }
                  placeholder="0.00"
                  className="font-mono"
                  data-testid="gaming-nti-input"
                />
              </div>
              <div>
                <label className="text-muted-foreground block mb-1">
                  Plays
                </label>
                <Input
                  type="text"
                  value={gamingReports.plays || ""}
                  onChange={(e) => handleGamingChange("plays", e.target.value)}
                  placeholder="0"
                  className="font-mono"
                  data-testid="gaming-plays-input"
                />
              </div>
              <div>
                <label className="text-muted-foreground block mb-1">
                  Payouts
                </label>
                <Input
                  type="text"
                  value={gamingReports.payouts || ""}
                  onChange={(e) =>
                    handleGamingChange("payouts", e.target.value)
                  }
                  placeholder="0.00"
                  className="font-mono"
                  data-testid="gaming-payouts-input"
                />
              </div>
            </div>
          </ReportSection>

          {/* Vendor Invoices */}
          <ReportSection
            title="Vendor Invoices"
            description="Delivery invoices received today"
            icon={<ClipboardList className="w-6 h-6 text-blue-600" />}
            iconBgColor="bg-blue-100"
            status={vendorInvoices.length > 0 ? "scanned" : "pending"}
            statusCount={
              vendorInvoices.length > 0 ? vendorInvoices.length : undefined
            }
          >
            <div className="bg-muted/50 rounded-lg p-3 space-y-2 text-sm">
              {vendorInvoices.map((invoice) => (
                <div
                  key={invoice.id}
                  className="flex items-center gap-2"
                  data-testid={`vendor-invoice-${invoice.id}`}
                >
                  <Input
                    type="text"
                    value={invoice.vendorName}
                    onChange={(e) =>
                      handleVendorInvoiceChange(
                        invoice.id,
                        "vendorName",
                        e.target.value,
                      )
                    }
                    placeholder="Vendor name"
                    className="flex-1"
                  />
                  <Input
                    type="text"
                    value={invoice.amount || ""}
                    onChange={(e) =>
                      handleVendorInvoiceChange(
                        invoice.id,
                        "amount",
                        e.target.value,
                      )
                    }
                    placeholder="0.00"
                    className="w-32 font-mono"
                  />
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleRemoveVendorInvoice(invoice.id)}
                    className="text-destructive hover:text-destructive"
                  >
                    Remove
                  </Button>
                </div>
              ))}
              {vendorInvoices.length > 0 && (
                <div className="flex justify-between pt-2 border-t mt-2">
                  <span className="font-medium">Total</span>
                  <span className="font-semibold">
                    {formatCurrency(totalVendorInvoices)}
                  </span>
                </div>
              )}
            </div>
            <Button
              variant="outline"
              className="w-full mt-3 border-dashed"
              onClick={handleAddVendorInvoice}
              data-testid="add-vendor-invoice-btn"
            >
              <Camera className="mr-2 h-4 w-4" />
              Add Vendor Invoice
            </Button>
          </ReportSection>

          {/* Cash Payouts */}
          <ReportSection
            title="Cash Payouts"
            description="Lottery winners, money orders, etc."
            icon={<DollarSign className="w-6 h-6 text-green-600" />}
            iconBgColor="bg-green-100"
            status={cashPayoutsRecorded ? "recorded" : "pending"}
          >
            <div className="bg-muted/50 rounded-lg p-3 space-y-2 text-sm">
              <div className="flex justify-between items-center">
                <label className="text-muted-foreground">
                  Lottery Winners Paid
                </label>
                <Input
                  type="text"
                  value={cashPayouts.lotteryWinners || ""}
                  onChange={(e) =>
                    handleCashPayoutsChange("lotteryWinners", e.target.value)
                  }
                  placeholder="0.00"
                  className="w-32 font-mono"
                  data-testid="cash-lottery-winners-input"
                />
              </div>
              <div className="flex justify-between items-center">
                <label className="text-muted-foreground">
                  Money Orders Sold
                </label>
                <Input
                  type="text"
                  value={cashPayouts.moneyOrders || ""}
                  onChange={(e) =>
                    handleCashPayoutsChange("moneyOrders", e.target.value)
                  }
                  placeholder="0.00"
                  className="w-32 font-mono"
                  data-testid="cash-money-orders-input"
                />
              </div>
              <div className="flex justify-between items-center">
                <label className="text-muted-foreground">Check Cashing</label>
                <Input
                  type="text"
                  value={cashPayouts.checkCashing || ""}
                  onChange={(e) =>
                    handleCashPayoutsChange("checkCashing", e.target.value)
                  }
                  placeholder="0.00"
                  className="w-32 font-mono"
                  data-testid="cash-check-cashing-input"
                />
              </div>
            </div>
          </ReportSection>
        </CardContent>
      </Card>

      {/* Summary Card */}
      <Card className="bg-primary/5 border-primary/20">
        <CardHeader className="pb-3">
          <CardTitle className="text-lg">Summary</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <div className="bg-card rounded-lg p-3 border">
              <p className="text-muted-foreground">Lottery Sales</p>
              <p className="text-xl font-bold">
                {formatCurrency(totalLotterySales)}
              </p>
            </div>
            <div className="bg-card rounded-lg p-3 border">
              <p className="text-muted-foreground">Lottery Payouts</p>
              <p className="text-xl font-bold text-destructive">
                {formatCurrency(-lotteryReports.payouts)}
              </p>
            </div>
            <div className="bg-card rounded-lg p-3 border">
              <p className="text-muted-foreground">Gaming Income</p>
              <p className="text-xl font-bold">
                {formatCurrency(gamingReports.netTerminalIncome)}
              </p>
            </div>
            <div className="bg-card rounded-lg p-3 border">
              <p className="text-muted-foreground">Vendor Invoices</p>
              <p className="text-xl font-bold">
                {formatCurrency(totalVendorInvoices)}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Footer Actions */}
      <Card>
        <CardContent className="py-4">
          <div className="flex items-center justify-between">
            <Button
              variant="outline"
              onClick={onBack}
              disabled={!canGoBack}
              data-testid="report-scanning-back-btn"
            >
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back
            </Button>
            <Button
              onClick={handleComplete}
              data-testid="report-scanning-next-btn"
            >
              Next
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

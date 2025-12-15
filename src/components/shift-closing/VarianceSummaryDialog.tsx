"use client";

/**
 * Variance Summary Dialog Component
 * Displays variance details before proceeding with shift closing
 *
 * Story: 10.7 - Shift Closing Submission & Pack Status Updates
 *
 * @requirements
 * - AC #5: Variance Detection - Show variance details to user before final submission
 * - AC #7: Success Confirmation - Display variance details in summary
 *
 * MCP Guidance Applied:
 * - UI_SECURITY: No secrets exposed, variance data is non-sensitive
 * - OUTPUT_FILTERING: Variance data comes from validated API response
 * - XSS: React automatically escapes output, no manual sanitization needed
 */

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { AlertTriangle } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";

// ============ Types ============

/**
 * Variance information for a pack
 */
export interface VarianceInfo {
  pack_id: string;
  pack_number: string;
  game_name: string;
  expected: number;
  actual: number;
  difference: number;
}

/**
 * Props for VarianceSummaryDialog component
 */
export interface VarianceSummaryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  variances: VarianceInfo[];
  onConfirm: () => void;
}

// ============ Component ============

/**
 * Variance Summary Dialog
 * Displays variance details and requires user confirmation before proceeding
 */
export function VarianceSummaryDialog({
  open,
  onOpenChange,
  variances,
  onConfirm,
}: VarianceSummaryDialogProps) {
  const handleConfirm = () => {
    onConfirm();
    onOpenChange(false);
  };

  const handleCancel = () => {
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-amber-500" />
            Variance Detected
          </DialogTitle>
          <DialogDescription>
            The following packs have variances between expected and actual
            ticket counts. Please review before proceeding.
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[400px] overflow-y-auto">
          {variances.length === 0 ? (
            <Alert>
              <AlertDescription>No variances detected.</AlertDescription>
            </Alert>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Pack Number</TableHead>
                  <TableHead>Game</TableHead>
                  <TableHead className="text-right">Expected</TableHead>
                  <TableHead className="text-right">Actual</TableHead>
                  <TableHead className="text-right">Difference</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {variances.map((variance) => (
                  <TableRow key={variance.pack_id}>
                    <TableCell className="font-medium">
                      {variance.pack_number}
                    </TableCell>
                    <TableCell>{variance.game_name}</TableCell>
                    <TableCell className="text-right">
                      {variance.expected}
                    </TableCell>
                    <TableCell className="text-right">
                      {variance.actual}
                    </TableCell>
                    <TableCell
                      className={`text-right font-semibold ${
                        variance.difference > 0
                          ? "text-green-600"
                          : variance.difference < 0
                            ? "text-red-600"
                            : "text-gray-600"
                      }`}
                    >
                      {variance.difference > 0 ? "+" : ""}
                      {variance.difference}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleCancel}>
            Cancel
          </Button>
          <Button onClick={handleConfirm}>Confirm & Proceed</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

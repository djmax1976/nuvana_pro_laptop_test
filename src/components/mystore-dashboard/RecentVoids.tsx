"use client";

import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

/**
 * RecentVoids Component
 *
 * Displays a full-width table of recent voided transactions
 *
 * Story: MyStore Dashboard Redesign
 */

// Sample voids data - will be replaced with real API data
const voids = [
  {
    id: "1",
    terminal: "POS-001",
    shiftId: "SFT-000446",
    cashier: "Sarah Miller",
    amount: -12.99,
    dateTime: "Dec 25, 2024 @ 3:45 PM",
  },
  {
    id: "2",
    terminal: "POS-002",
    shiftId: "SFT-000446",
    cashier: "Sarah Miller",
    amount: -5.49,
    dateTime: "Dec 25, 2024 @ 2:32 PM",
  },
  {
    id: "3",
    terminal: "POS-001",
    shiftId: "SFT-000445",
    cashier: "John Davis",
    amount: -23.75,
    dateTime: "Dec 25, 2024 @ 11:15 AM",
  },
  {
    id: "4",
    terminal: "POS-001",
    shiftId: "SFT-000445",
    cashier: "John Davis",
    amount: -8.99,
    dateTime: "Dec 25, 2024 @ 9:22 AM",
  },
  {
    id: "5",
    terminal: "POS-002",
    shiftId: "SFT-000444",
    cashier: "Mike Johnson",
    amount: -45.0,
    dateTime: "Dec 25, 2024 @ 2:18 AM",
  },
];

export function RecentVoids() {
  return (
    <Card data-testid="recent-voids">
      <CardHeader className="flex flex-row items-center justify-between p-5 border-b">
        <CardTitle className="text-base font-semibold">Recent Voids</CardTitle>
        <Button variant="outline" size="sm" className="text-xs">
          View All Voids
        </Button>
      </CardHeader>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-xs font-semibold uppercase tracking-wider">
                Terminal
              </TableHead>
              <TableHead className="text-xs font-semibold uppercase tracking-wider">
                Shift
              </TableHead>
              <TableHead className="text-xs font-semibold uppercase tracking-wider">
                Cashier
              </TableHead>
              <TableHead className="text-xs font-semibold uppercase tracking-wider">
                Void Amount
              </TableHead>
              <TableHead className="text-xs font-semibold uppercase tracking-wider">
                Date & Time
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {voids.map((voidItem) => (
              <TableRow key={voidItem.id}>
                <TableCell>
                  <span className="font-mono text-sm text-primary">
                    {voidItem.terminal}
                  </span>
                </TableCell>
                <TableCell>
                  <span className="font-mono text-sm text-primary">
                    {voidItem.shiftId}
                  </span>
                </TableCell>
                <TableCell>{voidItem.cashier}</TableCell>
                <TableCell>
                  <span className="font-semibold text-destructive">
                    -${Math.abs(voidItem.amount).toFixed(2)}
                  </span>
                </TableCell>
                <TableCell>{voidItem.dateTime}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

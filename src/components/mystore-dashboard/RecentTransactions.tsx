"use client";

import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
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

/**
 * RecentTransactions Component
 *
 * Displays a table of recent transactions with type badges
 *
 * Story: MyStore Dashboard Redesign
 */

// Sample transaction data - will be replaced with real API data
const transactions = [
  {
    id: "TXN-8847291",
    type: "Credit" as const,
    time: "4:32 PM",
    amount: 47.85,
  },
  {
    id: "TXN-8847290",
    type: "Cash" as const,
    time: "4:28 PM",
    amount: 23.5,
  },
  {
    id: "TXN-8847289",
    type: "EBT" as const,
    time: "4:21 PM",
    amount: 156.32,
  },
  {
    id: "TXN-8847288",
    type: "Debit" as const,
    time: "4:15 PM",
    amount: 12.99,
  },
  {
    id: "TXN-8847287",
    type: "Cash" as const,
    time: "4:08 PM",
    amount: 8.75,
  },
];

const typeVariants: Record<string, "default" | "success" | "warning"> = {
  Credit: "default",
  Debit: "default",
  Cash: "success",
  EBT: "warning",
};

export function RecentTransactions() {
  return (
    <Card data-testid="recent-transactions">
      <CardHeader className="flex flex-row items-center justify-between p-5 border-b">
        <CardTitle className="text-base font-semibold">
          Recent Transactions
        </CardTitle>
        <Button variant="outline" size="sm" className="text-xs">
          View All
        </Button>
      </CardHeader>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-xs font-semibold uppercase tracking-wider">
                Transaction ID
              </TableHead>
              <TableHead className="text-xs font-semibold uppercase tracking-wider">
                Type
              </TableHead>
              <TableHead className="text-xs font-semibold uppercase tracking-wider">
                Time
              </TableHead>
              <TableHead className="text-xs font-semibold uppercase tracking-wider">
                Amount
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {transactions.map((txn) => (
              <TableRow key={txn.id}>
                <TableCell>
                  <span className="font-mono text-sm text-primary">
                    {txn.id}
                  </span>
                </TableCell>
                <TableCell>
                  <Badge variant={typeVariants[txn.type]}>{txn.type}</Badge>
                </TableCell>
                <TableCell>{txn.time}</TableCell>
                <TableCell>
                  <span className="font-semibold">
                    ${txn.amount.toFixed(2)}
                  </span>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

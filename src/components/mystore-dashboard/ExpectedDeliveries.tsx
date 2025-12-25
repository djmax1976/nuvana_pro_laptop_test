"use client";

import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Calendar } from "lucide-react";

/**
 * ExpectedDeliveries Component
 *
 * Displays a table of expected vendor deliveries for the day
 * with status indicators (Delivered/Pending)
 *
 * Story: MyStore Dashboard Redesign
 */

// Sample delivery data - will be replaced with real API data
const deliveries = [
  {
    id: "1",
    vendor: "Pepsi",
    initials: "PEP",
    bgColor: "bg-green-100",
    textColor: "text-green-700",
    status: "delivered" as const,
  },
  {
    id: "2",
    vendor: "Coca-Cola",
    initials: "CC",
    bgColor: "bg-red-100",
    textColor: "text-red-700",
    status: "pending" as const,
  },
  {
    id: "3",
    vendor: "Frito-Lay",
    initials: "FL",
    bgColor: "bg-orange-100",
    textColor: "text-orange-700",
    status: "pending" as const,
  },
  {
    id: "4",
    vendor: "McLane",
    initials: "MC",
    bgColor: "bg-blue-100",
    textColor: "text-blue-700",
    status: "delivered" as const,
  },
  {
    id: "5",
    vendor: "Hostess Brands",
    initials: "HB",
    bgColor: "bg-pink-100",
    textColor: "text-pink-700",
    status: "delivered" as const,
  },
];

export function ExpectedDeliveries() {
  return (
    <Card
      className="min-h-[380px] flex flex-col"
      data-testid="expected-deliveries"
    >
      <CardHeader className="flex flex-row items-center justify-between p-5 border-b">
        <CardTitle className="text-base font-semibold">
          Expected Deliveries
        </CardTitle>
        <button className="flex items-center gap-2 px-3 py-2 text-sm text-muted-foreground bg-muted/50 rounded-md border hover:border-primary transition-colors">
          <Calendar className="w-3.5 h-3.5" />
          Today
        </button>
      </CardHeader>
      <CardContent className="p-0 flex-1">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-xs font-semibold uppercase tracking-wider">
                Vendor
              </TableHead>
              <TableHead className="text-xs font-semibold uppercase tracking-wider">
                Status
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {deliveries.map((delivery) => (
              <TableRow key={delivery.id}>
                <TableCell>
                  <div className="flex items-center gap-2.5">
                    <div
                      className={`w-8 h-8 rounded-md ${delivery.bgColor} flex items-center justify-center`}
                    >
                      <span
                        className={`text-[11px] font-semibold ${delivery.textColor}`}
                      >
                        {delivery.initials}
                      </span>
                    </div>
                    <span className="font-medium">{delivery.vendor}</span>
                  </div>
                </TableCell>
                <TableCell>
                  <Badge
                    variant={
                      delivery.status === "delivered" ? "success" : "secondary"
                    }
                    className={
                      delivery.status === "pending"
                        ? "bg-muted text-muted-foreground"
                        : ""
                    }
                  >
                    {delivery.status === "delivered" ? "Delivered" : "Pending"}
                  </Badge>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

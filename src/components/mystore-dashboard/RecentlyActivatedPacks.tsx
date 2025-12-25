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
 * RecentlyActivatedPacks Component
 *
 * Displays a table of recently activated lottery packs
 * with game name, pack ID, and activator name
 *
 * Story: MyStore Dashboard Redesign
 */

// Sample pack data - will be replaced with real API data
const recentPacks = [
  {
    id: "1",
    game: "Lucky 7s ($1)",
    packId: "PKG-004821",
    activatedBy: "Sarah Miller",
  },
  {
    id: "2",
    game: "Cash Bonanza ($2)",
    packId: "PKG-004820",
    activatedBy: "John Davis",
  },
  {
    id: "3",
    game: "Diamond Doubler ($5)",
    packId: "PKG-004819",
    activatedBy: "Sarah Miller",
  },
  {
    id: "4",
    game: "Mega Millions ($10)",
    packId: "PKG-004818",
    activatedBy: "Mike Johnson",
  },
  {
    id: "5",
    game: "Jackpot Fortune ($20)",
    packId: "PKG-004817",
    activatedBy: "Emily Chen",
  },
];

export function RecentlyActivatedPacks() {
  return (
    <Card
      className="min-h-[380px] flex flex-col"
      data-testid="recently-activated-packs"
    >
      <CardHeader className="flex flex-row items-center justify-between p-5 border-b">
        <CardTitle className="text-base font-semibold">
          Recently Activated Packs
        </CardTitle>
        <Button variant="outline" size="sm" className="text-xs">
          View All
        </Button>
      </CardHeader>
      <CardContent className="p-0 flex-1">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-xs font-semibold uppercase tracking-wider">
                Game
              </TableHead>
              <TableHead className="text-xs font-semibold uppercase tracking-wider">
                Pack
              </TableHead>
              <TableHead className="text-xs font-semibold uppercase tracking-wider">
                Activated By
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {recentPacks.map((pack) => (
              <TableRow key={pack.id}>
                <TableCell className="font-medium">{pack.game}</TableCell>
                <TableCell>
                  <span className="font-mono text-sm text-primary">
                    {pack.packId}
                  </span>
                </TableCell>
                <TableCell>{pack.activatedBy}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

"use client";

import { useAllStores, StoreWithCompany } from "@/lib/api/stores";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Eye, Pencil, RefreshCw, Plus } from "lucide-react";
import Link from "next/link";
import { format } from "date-fns";

/**
 * Stores page
 * Displays list of all stores for System Admin
 */
export default function StoresPage() {
  const { data, isLoading, error, refetch, isRefetching } = useAllStores();

  if (isLoading) {
    return <StoreListSkeleton />;
  }

  if (error) {
    return (
      <div className="rounded-lg border border-destructive bg-destructive/10 p-4">
        <p className="text-sm font-medium text-destructive">
          Error loading stores
        </p>
        <p className="mt-1 text-sm text-muted-foreground">
          {error instanceof Error ? error.message : "An unknown error occurred"}
        </p>
      </div>
    );
  }

  const stores = data?.data || [];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Stores</h1>
          <p className="text-sm text-muted-foreground">
            Manage all stores across all companies
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => refetch()}
            disabled={isRefetching}
          >
            <RefreshCw
              className={`mr-2 h-4 w-4 ${isRefetching ? "animate-spin" : ""}`}
            />
            Refresh
          </Button>
          <Link href="/stores/new">
            <Button size="sm">
              <Plus className="mr-2 h-4 w-4" />
              Create Store
            </Button>
          </Link>
        </div>
      </div>

      {stores.length === 0 ? (
        <div className="rounded-lg border p-8 text-center">
          <p className="text-sm text-muted-foreground">No stores found.</p>
        </div>
      ) : (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Company</TableHead>
                <TableHead>Location</TableHead>
                <TableHead>Timezone</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Created At</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {stores.map((store: StoreWithCompany) => (
                <TableRow key={store.store_id}>
                  <TableCell className="font-medium">{store.name}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {store.company?.name || "—"}
                  </TableCell>
                  <TableCell>
                    <LocationDisplay location={store.location_json} />
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {store.timezone}
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={store.status} />
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {format(new Date(store.created_at), "MMM d, yyyy")}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      <Link href={`/stores/${store.store_id}`}>
                        <Button variant="ghost" size="icon">
                          <Eye className="h-4 w-4" />
                          <span className="sr-only">View details</span>
                        </Button>
                      </Link>
                      <Link href={`/stores/${store.store_id}/edit`}>
                        <Button variant="ghost" size="icon">
                          <Pencil className="h-4 w-4" />
                          <span className="sr-only">Edit</span>
                        </Button>
                      </Link>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}

/**
 * Location display component
 * Formats location_json for display
 */
function LocationDisplay({
  location,
}: {
  location: { address?: string; gps?: { lat: number; lng: number } } | null;
}) {
  if (!location) {
    return <span className="text-muted-foreground">—</span>;
  }

  if (location.address) {
    return <span className="text-sm">{location.address}</span>;
  }

  if (location.gps) {
    return (
      <span className="text-sm font-mono">
        {location.gps.lat.toFixed(6)}, {location.gps.lng.toFixed(6)}
      </span>
    );
  }

  return <span className="text-muted-foreground">—</span>;
}

/**
 * Status badge component
 * Displays store status with appropriate styling
 */
function StatusBadge({ status }: { status: string }) {
  const statusStyles = {
    ACTIVE: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300",
    INACTIVE: "bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-300",
    CLOSED: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300",
  };

  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
        statusStyles[status as keyof typeof statusStyles] ||
        statusStyles.INACTIVE
      }`}
    >
      {status}
    </span>
  );
}

/**
 * Loading skeleton for StoreList
 */
function StoreListSkeleton() {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="h-8 w-32 animate-pulse rounded bg-muted" />
        <div className="h-10 w-24 animate-pulse rounded bg-muted" />
      </div>
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Company</TableHead>
              <TableHead>Location</TableHead>
              <TableHead>Timezone</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Created At</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {[1, 2, 3, 4, 5].map((i) => (
              <TableRow key={i}>
                <TableCell>
                  <div className="h-4 w-32 animate-pulse rounded bg-muted" />
                </TableCell>
                <TableCell>
                  <div className="h-4 w-28 animate-pulse rounded bg-muted" />
                </TableCell>
                <TableCell>
                  <div className="h-4 w-40 animate-pulse rounded bg-muted" />
                </TableCell>
                <TableCell>
                  <div className="h-4 w-24 animate-pulse rounded bg-muted" />
                </TableCell>
                <TableCell>
                  <div className="h-6 w-20 animate-pulse rounded-full bg-muted" />
                </TableCell>
                <TableCell>
                  <div className="h-4 w-24 animate-pulse rounded bg-muted" />
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-2">
                    <div className="h-8 w-8 animate-pulse rounded bg-muted" />
                    <div className="h-8 w-8 animate-pulse rounded bg-muted" />
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

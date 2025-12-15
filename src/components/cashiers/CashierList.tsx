"use client";

/**
 * Cashier List Component
 * Displays a list of cashiers for client's stores with search, filtering, and actions
 *
 * Story: 4.9 - Cashier Management
 */

import { useState, useMemo, useEffect } from "react";
import {
  useCashiers,
  useCashiersMultiStore,
  useDeleteCashier,
  type Cashier,
  type CashierWithStore,
} from "@/lib/api/cashiers";
import { useClientDashboard } from "@/lib/api/client-dashboard";
import { useDebounce } from "@/hooks/useDebounce";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Search,
  Plus,
  Trash2,
  Edit,
  UserCheck,
  AlertCircle,
} from "lucide-react";

/**
 * Sentinel value for "all stores" filter.
 */
const ALL_STORES = "all" as const;

/** Valid store filter values */
type StoreFilterValue = typeof ALL_STORES | (string & {});

interface CashierListProps {
  onCreateCashier: () => void;
  onEditCashier: (cashier: Cashier) => void;
}

export function CashierList({
  onCreateCashier,
  onEditCashier,
}: CashierListProps) {
  const { toast } = useToast();

  // State
  const [search, setSearch] = useState("");
  const [storeFilter, setStoreFilter] = useState<StoreFilterValue>(ALL_STORES);
  const [showInactive, setShowInactive] = useState(false);
  const [cashierToDelete, setCashierToDelete] = useState<Cashier | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Debounced search value
  const debouncedSearch = useDebounce(search, 300);

  // Fetch dashboard for stores list
  const { data: dashboardData, isLoading: isLoadingDashboard } =
    useClientDashboard();

  // Get stores list
  const stores = dashboardData?.stores || [];

  // Determine if we should use multi-store mode
  // Multi-store mode is when "All Stores" is selected AND there are multiple stores
  const isMultiStoreMode = storeFilter === ALL_STORES && stores.length > 1;

  // For single-store mode, get the selected store ID
  const selectedStoreId =
    storeFilter === ALL_STORES
      ? stores.length === 1
        ? stores[0]?.store_id
        : undefined // Will use multi-store mode
      : storeFilter;

  // Create store name map for multi-store mode
  const storeNameMap = useMemo(() => {
    const map = new Map<string, string>();
    stores.forEach((store) => {
      map.set(store.store_id, store.name);
    });
    return map;
  }, [stores]);

  // Fetch cashiers for single store mode
  const singleStoreQuery = useCashiers(
    selectedStoreId,
    { is_active: showInactive ? undefined : true },
    { enabled: !isMultiStoreMode && !!selectedStoreId },
  );

  // Fetch cashiers for multi-store mode (aggregated from all stores)
  const multiStoreQuery = useCashiersMultiStore(
    stores.map((s) => s.store_id),
    storeNameMap,
    { is_active: showInactive ? undefined : true },
    { enabled: isMultiStoreMode },
  );

  // Use appropriate query based on mode
  const {
    data: cashiers,
    isLoading: isLoadingCashiers,
    isError,
    error,
    refetch,
  } = isMultiStoreMode ? multiStoreQuery : singleStoreQuery;

  // Delete mutation
  const deleteCashierMutation = useDeleteCashier();

  // Filter cashiers by search term
  const filteredCashiers = useMemo(() => {
    if (!cashiers) return [];
    if (!debouncedSearch) return cashiers;

    const searchLower = debouncedSearch.toLowerCase();
    return cashiers.filter(
      (cashier) =>
        cashier.name.toLowerCase().includes(searchLower) ||
        cashier.employee_id.toLowerCase().includes(searchLower),
    );
  }, [cashiers, debouncedSearch]);

  // Handle delete
  const handleDelete = async () => {
    // Use the cashier's store_id (works for both single and multi-store modes)
    const storeIdForDelete = cashierToDelete?.store_id;
    if (!cashierToDelete || !storeIdForDelete) return;

    setIsDeleting(true);
    try {
      await deleteCashierMutation.mutateAsync({
        storeId: storeIdForDelete,
        cashierId: cashierToDelete.cashier_id,
      });
      toast({
        title: "Cashier deleted",
        description: `${cashierToDelete.name} has been removed.`,
      });
      setCashierToDelete(null);
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Error",
        description:
          error instanceof Error ? error.message : "Failed to delete cashier",
      });
    } finally {
      setIsDeleting(false);
    }
  };

  // Format date for display
  const formatDate = (dateString: string | null) => {
    if (!dateString) return "—";
    return new Date(dateString).toLocaleDateString();
  };

  // Loading state
  const isLoading = isLoadingDashboard || isLoadingCashiers;

  if (isLoading) {
    return <CashierListSkeleton />;
  }

  // Error state
  if (isError) {
    return (
      <div className="flex flex-col items-center justify-center py-12">
        <AlertCircle className="h-12 w-12 text-destructive mb-4" />
        <h3 className="text-lg font-semibold mb-2">Failed to load cashiers</h3>
        <p className="text-muted-foreground mb-4">
          {error instanceof Error ? error.message : "An error occurred"}
        </p>
        <Button onClick={() => refetch()} variant="outline">
          Try again
        </Button>
      </div>
    );
  }

  // Empty state - no stores
  if (stores.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12">
        <AlertCircle className="h-12 w-12 text-muted-foreground mb-4" />
        <h3 className="text-lg font-semibold mb-2">No stores available</h3>
        <p className="text-muted-foreground">
          You need at least one store to manage cashiers.
        </p>
      </div>
    );
  }

  // Empty state - no cashiers
  if (filteredCashiers.length === 0 && !debouncedSearch && !showInactive) {
    return (
      <div className="space-y-4">
        {/* Store Filter (if multiple stores) */}
        {stores.length > 1 && (
          <div className="flex justify-end">
            <Select value={storeFilter} onValueChange={setStoreFilter}>
              <SelectTrigger className="w-[200px]" data-testid="store-filter">
                <SelectValue placeholder="Select store" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL_STORES}>All Stores</SelectItem>
                {stores.map((store) => (
                  <SelectItem key={store.store_id} value={store.store_id}>
                    {store.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        <div className="flex flex-col items-center justify-center py-12">
          <UserCheck className="h-12 w-12 text-muted-foreground mb-4" />
          <h3 className="text-lg font-semibold mb-2">No cashiers yet</h3>
          <p className="text-muted-foreground mb-4">
            Create your first cashier to get started
          </p>
          <Button onClick={onCreateCashier} data-testid="create-cashier-btn">
            <Plus className="h-4 w-4 mr-2" />
            Add Cashier
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Search and Filter Controls */}
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search by name or employee ID..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10"
            data-testid="cashier-search"
          />
        </div>

        {stores.length > 1 && (
          <Select value={storeFilter} onValueChange={setStoreFilter}>
            <SelectTrigger
              className="w-full sm:w-[200px]"
              data-testid="store-filter"
            >
              <SelectValue placeholder="Select store" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL_STORES}>All Stores</SelectItem>
              {stores.map((store) => (
                <SelectItem key={store.store_id} value={store.store_id}>
                  {store.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        <Select
          value={showInactive ? "all" : "active"}
          onValueChange={(v) => setShowInactive(v === "all")}
        >
          <SelectTrigger
            className="w-full sm:w-[150px]"
            data-testid="status-filter"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="active">Active only</SelectItem>
            <SelectItem value="all">Show all</SelectItem>
          </SelectContent>
        </Select>

        <Button onClick={onCreateCashier} data-testid="create-cashier-btn">
          <Plus className="h-4 w-4 mr-2" />
          Add Cashier
        </Button>
      </div>

      {/* Table */}
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Employee ID</TableHead>
              <TableHead>Name</TableHead>
              {isMultiStoreMode && <TableHead>Store</TableHead>}
              <TableHead>Hired On</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-[120px]">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredCashiers.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={isMultiStoreMode ? 6 : 5}
                  className="h-24 text-center text-muted-foreground"
                >
                  No cashiers found matching your search.
                </TableCell>
              </TableRow>
            ) : (
              filteredCashiers.map((cashier) => (
                <TableRow
                  key={cashier.cashier_id}
                  data-testid={`cashier-row-${cashier.cashier_id}`}
                >
                  <TableCell className="font-mono">
                    {cashier.employee_id}
                  </TableCell>
                  <TableCell className="font-medium">{cashier.name}</TableCell>
                  {isMultiStoreMode && (
                    <TableCell className="text-muted-foreground">
                      {(cashier as CashierWithStore).store_name}
                    </TableCell>
                  )}
                  <TableCell>{formatDate(cashier.hired_on)}</TableCell>
                  <TableCell>
                    <Badge
                      variant={cashier.is_active ? "default" : "secondary"}
                    >
                      {cashier.is_active ? "Active" : "Inactive"}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => onEditCashier(cashier)}
                        aria-label={`Edit cashier ${cashier.name || cashier.cashier_id}`}
                        data-testid={`edit-cashier-${cashier.cashier_id}`}
                      >
                        <Edit className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setCashierToDelete(cashier)}
                        aria-label={`Delete cashier ${cashier.name || cashier.cashier_id}`}
                        data-testid={`delete-cashier-${cashier.cashier_id}`}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Delete Confirmation Dialog */}
      <AlertDialog
        open={!!cashierToDelete}
        onOpenChange={(open) => !open && setCashierToDelete(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Cashier</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete{" "}
              <span className="font-semibold">{cashierToDelete?.name}</span>?
              This will deactivate the cashier account.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={isDeleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeleting ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

/**
 * Loading skeleton for cashier list
 */
function CashierListSkeleton() {
  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row gap-4">
        <Skeleton className="h-10 flex-1" />
        <Skeleton className="h-10 w-full sm:w-[200px]" />
        <Skeleton className="h-10 w-full sm:w-[150px]" />
        <Skeleton className="h-10 w-[140px]" />
      </div>
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Employee ID</TableHead>
              <TableHead>Name</TableHead>
              <TableHead>Hired On</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-[120px]">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {Array.from({ length: 5 }).map((_, i) => (
              <TableRow key={i}>
                <TableCell>
                  <Skeleton className="h-4 w-[60px]" />
                </TableCell>
                <TableCell>
                  <Skeleton className="h-4 w-[120px]" />
                </TableCell>
                <TableCell>
                  <Skeleton className="h-4 w-[100px]" />
                </TableCell>
                <TableCell>
                  <Skeleton className="h-6 w-[60px]" />
                </TableCell>
                <TableCell>
                  <Skeleton className="h-8 w-[80px]" />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

export default CashierList;

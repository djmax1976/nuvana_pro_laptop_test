"use client";

import { useState, useMemo, useCallback, useEffect } from "react";
import {
  useApiKeys,
  useSuspendApiKey,
  useReactivateApiKey,
  ApiKeyListItem,
  ApiKeyStatus,
  ListApiKeysParams,
} from "@/lib/api/api-keys";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Plus,
  Search,
  ChevronLeft,
  ChevronRight,
  MoreHorizontal,
  RotateCw,
  XCircle,
  Pause,
  Play,
  Eye,
  Copy,
  Check,
  Key,
} from "lucide-react";
import { useDebounce } from "@/hooks/useDebounce";
import { useToast } from "@/hooks/use-toast";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useTableSort } from "@/hooks/useTableSort";
import { SortableTableHead } from "@/components/ui/sortable-table-head";
import { CreateApiKeyDialog } from "./CreateApiKeyDialog";
import { ApiKeyDetailsDialog } from "./ApiKeyDetailsDialog";
import { RotateApiKeyDialog } from "./RotateApiKeyDialog";
import { RevokeApiKeyDialog } from "./RevokeApiKeyDialog";

/**
 * ApiKeyList component
 * Displays a list of API keys in a table format (SUPERADMIN only)
 * Includes search, filter by status, pagination, and actions
 *
 * Enterprise Standards Applied:
 * - FE-005: UI_SECURITY - Masks API key values, never exposes full keys in DOM
 * - API-008: OUTPUT_FILTERING - Only displays safe fields, key_prefix/key_suffix for identification
 * - FE-001: STATE_MANAGEMENT - No sensitive data in localStorage
 */
export function ApiKeyList() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [actionInProgress, setActionInProgress] = useState<string | null>(null);

  // Dialog states
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showDetailsDialog, setShowDetailsDialog] = useState(false);
  const [showRotateDialog, setShowRotateDialog] = useState(false);
  const [showRevokeDialog, setShowRevokeDialog] = useState(false);
  const [showSuspendDialog, setShowSuspendDialog] = useState(false);
  const [showReactivateDialog, setShowReactivateDialog] = useState(false);
  const [selectedKeyId, setSelectedKeyId] = useState<string | null>(null);
  const [selectedKey, setSelectedKey] = useState<ApiKeyListItem | null>(null);

  // Copy state for key prefix
  const [copiedKeyId, setCopiedKeyId] = useState<string | null>(null);

  const { toast } = useToast();

  // Debounce search to avoid excessive API calls
  const debouncedSearch = useDebounce(search, 300);

  // Build query params
  const queryParams: ListApiKeysParams = useMemo(
    () => ({
      page,
      limit: 20,
      search: debouncedSearch || undefined,
      status:
        statusFilter !== "all" ? (statusFilter as ApiKeyStatus) : undefined,
      include_expired: statusFilter === "all" || statusFilter === "EXPIRED",
      include_revoked: statusFilter === "all" || statusFilter === "REVOKED",
      sort_by: "createdAt",
      sort_order: "desc",
    }),
    [page, debouncedSearch, statusFilter],
  );

  const { data, isLoading, error } = useApiKeys(queryParams);
  const suspendMutation = useSuspendApiKey();
  const reactivateMutation = useReactivateApiKey();

  const apiKeys = data?.data?.items || [];
  const pagination = data?.data?.pagination;

  // Sorting hook - applies to the current page's data
  const { sortedData, sortKey, sortDirection, handleSort } =
    useTableSort<ApiKeyListItem>({
      data: apiKeys,
    });

  // Reset to page 1 when filters change
  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, statusFilter]);

  // Handle copy key prefix to clipboard
  const handleCopyKeyId = useCallback(
    async (key: ApiKeyListItem) => {
      try {
        await navigator.clipboard.writeText(
          `${key.key_prefix}...${key.key_suffix}`,
        );
        setCopiedKeyId(key.api_key_id);
        toast({
          title: "Copied",
          description: "Key identifier copied to clipboard",
        });
        // Reset copied state after 2 seconds
        setTimeout(() => setCopiedKeyId(null), 2000);
      } catch {
        toast({
          title: "Failed to copy",
          description: "Could not copy to clipboard",
          variant: "destructive",
        });
      }
    },
    [toast],
  );

  // Handle view details
  const handleViewDetails = useCallback((key: ApiKeyListItem) => {
    setSelectedKeyId(key.api_key_id);
    setSelectedKey(key);
    setShowDetailsDialog(true);
  }, []);

  // Handle rotate
  const handleRotate = useCallback((key: ApiKeyListItem) => {
    setSelectedKeyId(key.api_key_id);
    setSelectedKey(key);
    setShowRotateDialog(true);
  }, []);

  // Handle revoke
  const handleRevoke = useCallback((key: ApiKeyListItem) => {
    setSelectedKeyId(key.api_key_id);
    setSelectedKey(key);
    setShowRevokeDialog(true);
  }, []);

  // Handle suspend
  const handleSuspend = useCallback((key: ApiKeyListItem) => {
    setSelectedKeyId(key.api_key_id);
    setSelectedKey(key);
    setShowSuspendDialog(true);
  }, []);

  // Handle reactivate
  const handleReactivate = useCallback((key: ApiKeyListItem) => {
    setSelectedKeyId(key.api_key_id);
    setSelectedKey(key);
    setShowReactivateDialog(true);
  }, []);

  // Confirm suspend
  const confirmSuspend = async () => {
    if (!selectedKeyId) return;

    setActionInProgress(selectedKeyId);
    try {
      await suspendMutation.mutateAsync({
        keyId: selectedKeyId,
        data: { reason: "Suspended by admin" },
      });

      toast({
        title: "API Key Suspended",
        description: "The API key has been suspended successfully",
      });
    } catch (error) {
      toast({
        title: "Error",
        description:
          error instanceof Error ? error.message : "Failed to suspend API key",
        variant: "destructive",
      });
    } finally {
      setActionInProgress(null);
      setShowSuspendDialog(false);
      setSelectedKeyId(null);
      setSelectedKey(null);
    }
  };

  // Confirm reactivate
  const confirmReactivate = async () => {
    if (!selectedKeyId) return;

    setActionInProgress(selectedKeyId);
    try {
      await reactivateMutation.mutateAsync(selectedKeyId);

      toast({
        title: "API Key Reactivated",
        description: "The API key has been reactivated successfully",
      });
    } catch (error) {
      toast({
        title: "Error",
        description:
          error instanceof Error
            ? error.message
            : "Failed to reactivate API key",
        variant: "destructive",
      });
    } finally {
      setActionInProgress(null);
      setShowReactivateDialog(false);
      setSelectedKeyId(null);
      setSelectedKey(null);
    }
  };

  if (isLoading) {
    return <ApiKeyListSkeleton />;
  }

  if (error) {
    return (
      <div className="rounded-lg border border-destructive bg-destructive/10 p-4">
        <p className="text-sm font-medium text-destructive">
          Error loading API keys
        </p>
        <p className="mt-1 text-sm text-muted-foreground">
          {error instanceof Error ? error.message : "An unknown error occurred"}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">API Keys</h1>
          <p className="text-sm text-muted-foreground">
            Manage API keys for desktop application connections
          </p>
        </div>
        <Button
          onClick={() => setShowCreateDialog(true)}
          data-testid="create-api-key-button"
        >
          <Plus className="mr-2 h-4 w-4" />
          Create API Key
        </Button>
      </div>

      {/* Search and Filter Controls */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search by label or store name..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10"
            data-testid="api-key-search-input"
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger
            className="w-[180px]"
            data-testid="api-key-status-filter"
          >
            <SelectValue placeholder="Filter by status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            <SelectItem value="ACTIVE">Active</SelectItem>
            <SelectItem value="PENDING">Pending</SelectItem>
            <SelectItem value="SUSPENDED">Suspended</SelectItem>
            <SelectItem value="EXPIRED">Expired</SelectItem>
            <SelectItem value="REVOKED">Revoked</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {apiKeys.length === 0 ? (
        <div className="rounded-lg border p-8 text-center">
          <Key className="mx-auto h-12 w-12 text-muted-foreground/50" />
          <p className="mt-4 text-sm text-muted-foreground">
            {search || statusFilter !== "all"
              ? "No API keys match your search criteria."
              : "No API keys found. Create your first API key to connect a desktop application."}
          </p>
        </div>
      ) : (
        <>
          <div className="rounded-md border">
            <Table data-testid="api-key-list-table">
              <TableHeader>
                <TableRow>
                  <SortableTableHead
                    sortKey="key_prefix"
                    currentSortKey={sortKey}
                    currentSortDirection={sortDirection}
                    onSort={handleSort}
                  >
                    Key
                  </SortableTableHead>
                  <SortableTableHead
                    sortKey="label"
                    currentSortKey={sortKey}
                    currentSortDirection={sortDirection}
                    onSort={handleSort}
                  >
                    Label
                  </SortableTableHead>
                  <SortableTableHead
                    sortKey="store_name"
                    currentSortKey={sortKey}
                    currentSortDirection={sortDirection}
                    onSort={handleSort}
                  >
                    Store
                  </SortableTableHead>
                  <SortableTableHead
                    sortKey="status"
                    currentSortKey={sortKey}
                    currentSortDirection={sortDirection}
                    onSort={handleSort}
                  >
                    Status
                  </SortableTableHead>
                  <SortableTableHead
                    sortKey="last_used_at"
                    currentSortKey={sortKey}
                    currentSortDirection={sortDirection}
                    onSort={handleSort}
                  >
                    Last Used
                  </SortableTableHead>
                  <SortableTableHead
                    sortKey="created_at"
                    currentSortKey={sortKey}
                    currentSortDirection={sortDirection}
                    onSort={handleSort}
                  >
                    Created
                  </SortableTableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sortedData.map((key) => (
                  <TableRow
                    key={key.api_key_id}
                    data-testid={`api-key-row-${key.api_key_id}`}
                  >
                    <TableCell className="font-mono text-sm">
                      <div className="flex items-center gap-2">
                        <span className="truncate max-w-[180px]">
                          {key.key_prefix}...{key.key_suffix}
                        </span>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6"
                          onClick={() => handleCopyKeyId(key)}
                        >
                          {copiedKeyId === key.api_key_id ? (
                            <Check className="h-3 w-3 text-green-600" />
                          ) : (
                            <Copy className="h-3 w-3" />
                          )}
                        </Button>
                      </div>
                    </TableCell>
                    <TableCell>
                      {key.label || (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <div>
                        <div className="font-medium">{key.store_name}</div>
                        <div className="text-xs text-muted-foreground">
                          {key.company_name}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={key.status} />
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {key.last_used_at
                        ? new Date(key.last_used_at).toLocaleDateString()
                        : "Never"}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {new Date(key.created_at).toLocaleDateString()}
                    </TableCell>
                    <TableCell className="text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            disabled={actionInProgress === key.api_key_id}
                          >
                            <MoreHorizontal className="h-4 w-4" />
                            <span className="sr-only">Actions</span>
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem
                            onClick={() => handleViewDetails(key)}
                          >
                            <Eye className="mr-2 h-4 w-4" />
                            View Details
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          {key.status === "ACTIVE" && (
                            <>
                              <DropdownMenuItem
                                onClick={() => handleRotate(key)}
                              >
                                <RotateCw className="mr-2 h-4 w-4" />
                                Rotate Key
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={() => handleSuspend(key)}
                              >
                                <Pause className="mr-2 h-4 w-4" />
                                Suspend
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={() => handleRevoke(key)}
                                className="text-destructive"
                              >
                                <XCircle className="mr-2 h-4 w-4" />
                                Revoke
                              </DropdownMenuItem>
                            </>
                          )}
                          {key.status === "SUSPENDED" && (
                            <>
                              <DropdownMenuItem
                                onClick={() => handleReactivate(key)}
                              >
                                <Play className="mr-2 h-4 w-4" />
                                Reactivate
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={() => handleRevoke(key)}
                                className="text-destructive"
                              >
                                <XCircle className="mr-2 h-4 w-4" />
                                Revoke
                              </DropdownMenuItem>
                            </>
                          )}
                          {key.status === "PENDING" && (
                            <DropdownMenuItem
                              onClick={() => handleRevoke(key)}
                              className="text-destructive"
                            >
                              <XCircle className="mr-2 h-4 w-4" />
                              Revoke
                            </DropdownMenuItem>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {/* Pagination Controls */}
          {pagination && pagination.total_pages > 1 && (
            <div
              className="flex items-center justify-between"
              data-testid="pagination-controls"
            >
              <p className="text-sm text-muted-foreground">
                Showing {(pagination.page - 1) * pagination.limit + 1} to{" "}
                {Math.min(pagination.page * pagination.limit, pagination.total)}{" "}
                of {pagination.total} API keys
              </p>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1}
                >
                  <ChevronLeft className="h-4 w-4" />
                  Previous
                </Button>
                <span className="text-sm">
                  Page {pagination.page} of {pagination.total_pages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    setPage((p) => Math.min(pagination.total_pages, p + 1))
                  }
                  disabled={page >= pagination.total_pages}
                >
                  Next
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </>
      )}

      {/* Create API Key Dialog */}
      <CreateApiKeyDialog
        open={showCreateDialog}
        onOpenChange={setShowCreateDialog}
      />

      {/* View Details Dialog */}
      <ApiKeyDetailsDialog
        open={showDetailsDialog}
        onOpenChange={setShowDetailsDialog}
        keyId={selectedKeyId}
      />

      {/* Rotate Key Dialog */}
      <RotateApiKeyDialog
        open={showRotateDialog}
        onOpenChange={setShowRotateDialog}
        keyId={selectedKeyId}
        keyLabel={selectedKey?.label || selectedKey?.key_prefix || ""}
      />

      {/* Revoke Key Dialog */}
      <RevokeApiKeyDialog
        open={showRevokeDialog}
        onOpenChange={setShowRevokeDialog}
        keyId={selectedKeyId}
        keyLabel={selectedKey?.label || selectedKey?.key_prefix || ""}
      />

      {/* Suspend Confirmation Dialog */}
      {selectedKey && (
        <ConfirmDialog
          open={showSuspendDialog}
          onOpenChange={setShowSuspendDialog}
          title="Suspend API Key?"
          description={`Are you sure you want to suspend the API key "${selectedKey.label || selectedKey.key_prefix}"? The connected desktop application will be unable to sync until the key is reactivated.`}
          confirmText="Suspend"
          cancelText="Cancel"
          onConfirm={confirmSuspend}
          destructive={false}
          isLoading={actionInProgress === selectedKeyId}
        />
      )}

      {/* Reactivate Confirmation Dialog */}
      {selectedKey && (
        <ConfirmDialog
          open={showReactivateDialog}
          onOpenChange={setShowReactivateDialog}
          title="Reactivate API Key?"
          description={`Are you sure you want to reactivate the API key "${selectedKey.label || selectedKey.key_prefix}"? The connected desktop application will be able to sync again.`}
          confirmText="Reactivate"
          cancelText="Cancel"
          onConfirm={confirmReactivate}
          destructive={false}
          isLoading={actionInProgress === selectedKeyId}
        />
      )}
    </div>
  );
}

/**
 * Status badge component
 * Displays API key status with appropriate styling
 */
function StatusBadge({ status }: { status: ApiKeyStatus }) {
  const statusStyles: Record<ApiKeyStatus, string> = {
    ACTIVE: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300",
    PENDING:
      "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300",
    SUSPENDED:
      "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-300",
    EXPIRED: "bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-300",
    REVOKED: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300",
  };

  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${statusStyles[status]}`}
    >
      {status}
    </span>
  );
}

/**
 * Loading skeleton for ApiKeyList
 */
function ApiKeyListSkeleton() {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <div className="h-8 w-32 animate-pulse rounded bg-muted" />
          <div className="mt-1 h-4 w-64 animate-pulse rounded bg-muted" />
        </div>
        <div className="h-10 w-40 animate-pulse rounded bg-muted" />
      </div>
      <div className="flex gap-4">
        <div className="h-10 flex-1 animate-pulse rounded bg-muted" />
        <div className="h-10 w-[180px] animate-pulse rounded bg-muted" />
      </div>
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Key</TableHead>
              <TableHead>Label</TableHead>
              <TableHead>Store</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Last Used</TableHead>
              <TableHead>Created</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {[1, 2, 3, 4, 5].map((i) => (
              <TableRow key={i}>
                <TableCell>
                  <div className="h-4 w-40 animate-pulse rounded bg-muted" />
                </TableCell>
                <TableCell>
                  <div className="h-4 w-24 animate-pulse rounded bg-muted" />
                </TableCell>
                <TableCell>
                  <div className="h-4 w-32 animate-pulse rounded bg-muted" />
                </TableCell>
                <TableCell>
                  <div className="h-5 w-16 animate-pulse rounded-full bg-muted" />
                </TableCell>
                <TableCell>
                  <div className="h-4 w-20 animate-pulse rounded bg-muted" />
                </TableCell>
                <TableCell>
                  <div className="h-4 w-20 animate-pulse rounded bg-muted" />
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end">
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

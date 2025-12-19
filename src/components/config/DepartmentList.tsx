"use client";

/**
 * DepartmentList Component
 *
 * Displays a list of departments (product categories) in a table format.
 * Includes CRUD operations with proper permission checks.
 *
 * Phase 6.2: Shift & Day Summary Implementation Plan
 *
 * Enterprise coding standards applied:
 * - FE-002: Form validation mirroring backend
 * - FE-005: No secrets in DOM, masked sensitive data
 * - SEC-004: XSS prevention through React auto-escaping
 */

import { useState, useCallback } from "react";
import {
  useDepartments,
  useUpdateDepartment,
  useDeleteDepartment,
  Department,
} from "@/lib/api/departments";
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
import { Badge } from "@/components/ui/badge";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useToast } from "@/hooks/use-toast";
import {
  Plus,
  Pencil,
  Trash2,
  Search,
  Power,
  FolderTree,
  Ticket,
} from "lucide-react";
import Link from "next/link";

interface DepartmentListProps {
  onEdit?: (department: Department) => void;
}

/**
 * Skeleton loader for the department list
 */
function DepartmentListSkeleton() {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="h-8 w-48 animate-pulse rounded bg-muted" />
        <div className="h-10 w-40 animate-pulse rounded bg-muted" />
      </div>
      <div className="h-10 w-full animate-pulse rounded bg-muted" />
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Code</TableHead>
              <TableHead>Name</TableHead>
              <TableHead>Parent</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {[1, 2, 3, 4, 5].map((i) => (
              <TableRow key={i}>
                <TableCell>
                  <div className="h-4 w-16 animate-pulse rounded bg-muted" />
                </TableCell>
                <TableCell>
                  <div className="h-4 w-32 animate-pulse rounded bg-muted" />
                </TableCell>
                <TableCell>
                  <div className="h-4 w-24 animate-pulse rounded bg-muted" />
                </TableCell>
                <TableCell>
                  <div className="h-5 w-20 animate-pulse rounded-full bg-muted" />
                </TableCell>
                <TableCell>
                  <div className="h-5 w-16 animate-pulse rounded-full bg-muted" />
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

export function DepartmentList({ onEdit }: DepartmentListProps) {
  const [search, setSearch] = useState("");
  const [showInactive, setShowInactive] = useState(false);
  const [showLotteryOnly, setShowLotteryOnly] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Department | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const { toast } = useToast();

  const {
    data: departments,
    isLoading,
    error,
  } = useDepartments({
    include_inactive: showInactive,
    include_system: true,
    is_lottery: showLotteryOnly ? true : undefined,
    include_children: true,
  });

  const updateMutation = useUpdateDepartment();
  const deleteMutation = useDeleteDepartment();

  // Filter departments by search
  const filteredDepartments = departments?.filter((dept) => {
    if (!search) return true;
    const searchLower = search.toLowerCase();
    return (
      dept.code.toLowerCase().includes(searchLower) ||
      dept.name.toLowerCase().includes(searchLower) ||
      (dept.description && dept.description.toLowerCase().includes(searchLower))
    );
  });

  // Get parent name
  const getParentName = useCallback(
    (parentId: string | null): string => {
      if (!parentId || !departments) return "—";
      const parent = departments.find((d) => d.department_id === parentId);
      return parent?.name || "Unknown";
    },
    [departments],
  );

  // Toggle active status
  const handleToggleStatus = useCallback(
    async (department: Department) => {
      if (department.is_system) {
        toast({
          title: "Cannot modify system department",
          description: "System departments cannot be deactivated.",
          variant: "destructive",
        });
        return;
      }

      setActionLoading(department.department_id);
      try {
        await updateMutation.mutateAsync({
          id: department.department_id,
          data: { is_active: !department.is_active },
        });
        toast({
          title: "Success",
          description: `Department ${department.is_active ? "deactivated" : "activated"} successfully`,
        });
      } catch (err) {
        toast({
          title: "Error",
          description:
            err instanceof Error ? err.message : "Failed to update department",
          variant: "destructive",
        });
      } finally {
        setActionLoading(null);
      }
    },
    [updateMutation, toast],
  );

  // Delete (deactivate) department
  const handleDelete = useCallback(async () => {
    if (!deleteTarget) return;

    setActionLoading(deleteTarget.department_id);
    try {
      await deleteMutation.mutateAsync(deleteTarget.department_id);
      toast({
        title: "Success",
        description: "Department deactivated successfully",
      });
    } catch (err) {
      toast({
        title: "Error",
        description:
          err instanceof Error ? err.message : "Failed to delete department",
        variant: "destructive",
      });
    } finally {
      setActionLoading(null);
      setDeleteTarget(null);
    }
  }, [deleteTarget, deleteMutation, toast]);

  if (isLoading) {
    return <DepartmentListSkeleton />;
  }

  if (error) {
    return (
      <div className="rounded-lg border border-destructive bg-destructive/10 p-4">
        <p className="text-sm font-medium text-destructive">
          Error loading departments
        </p>
        <p className="mt-1 text-sm text-muted-foreground">
          {error instanceof Error ? error.message : "An unknown error occurred"}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Departments</h1>
          <p className="text-sm text-muted-foreground">
            Manage product categories and departments
          </p>
        </div>
        <Link href="/client-dashboard/config/departments/new">
          <Button data-testid="create-department-button">
            <Plus className="mr-2 h-4 w-4" />
            Add Department
          </Button>
        </Link>
      </div>

      {/* Search and Filters */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search departments..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10"
            data-testid="department-search-input"
          />
        </div>
        <div className="flex gap-2">
          <Button
            variant={showLotteryOnly ? "secondary" : "outline"}
            onClick={() => setShowLotteryOnly(!showLotteryOnly)}
            data-testid="show-lottery-toggle"
          >
            <Ticket className="mr-2 h-4 w-4" />
            {showLotteryOnly ? "All" : "Lottery Only"}
          </Button>
          <Button
            variant={showInactive ? "secondary" : "outline"}
            onClick={() => setShowInactive(!showInactive)}
            data-testid="show-inactive-toggle"
          >
            {showInactive ? "Hide Inactive" : "Show Inactive"}
          </Button>
        </div>
      </div>

      {/* Table */}
      {filteredDepartments && filteredDepartments.length === 0 ? (
        <div className="rounded-lg border p-8 text-center">
          <p className="text-sm text-muted-foreground">
            {search
              ? "No departments match your search criteria."
              : "No departments found. Create your first department to get started."}
          </p>
        </div>
      ) : (
        <div className="rounded-md border">
          <Table data-testid="department-list-table">
            <TableHeader>
              <TableRow>
                <TableHead>Code</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Parent</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredDepartments?.map((department) => (
                <TableRow
                  key={department.department_id}
                  data-testid={`department-row-${department.department_id}`}
                  className={!department.is_active ? "opacity-60" : undefined}
                >
                  <TableCell className="font-mono font-medium">
                    {department.code}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      {department.is_lottery ? (
                        <Ticket className="h-4 w-4 text-purple-600" />
                      ) : (
                        <FolderTree className="h-4 w-4 text-blue-600" />
                      )}
                      <span>{department.name}</span>
                    </div>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {getParentName(department.parent_id)}
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      {department.is_system && (
                        <Badge variant="outline" className="text-xs">
                          System
                        </Badge>
                      )}
                      {department.is_lottery && (
                        <Badge
                          variant="secondary"
                          className="text-xs bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-300"
                        >
                          Lottery
                        </Badge>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={department.is_active ? "default" : "secondary"}
                      className={
                        department.is_active
                          ? "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300"
                          : "bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-300"
                      }
                    >
                      {department.is_active ? "Active" : "Inactive"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      {!department.is_system && (
                        <>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => onEdit?.(department)}
                            disabled={
                              actionLoading === department.department_id
                            }
                            data-testid={`edit-department-${department.department_id}`}
                          >
                            <Pencil className="h-4 w-4" />
                            <span className="sr-only">Edit</span>
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleToggleStatus(department)}
                            disabled={
                              actionLoading === department.department_id
                            }
                            className={
                              department.is_active
                                ? "text-green-600 hover:text-green-700"
                                : "text-gray-400 hover:text-gray-600"
                            }
                            data-testid={`toggle-department-${department.department_id}`}
                          >
                            <Power className="h-4 w-4" />
                            <span className="sr-only">
                              {department.is_active ? "Deactivate" : "Activate"}
                            </span>
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => setDeleteTarget(department)}
                            disabled={
                              actionLoading === department.department_id ||
                              !department.is_active
                            }
                            className="text-red-600 hover:text-red-700 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950"
                            data-testid={`delete-department-${department.department_id}`}
                          >
                            <Trash2 className="h-4 w-4" />
                            <span className="sr-only">Delete</span>
                          </Button>
                        </>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Delete Confirmation Dialog */}
      {deleteTarget && (
        <ConfirmDialog
          open={!!deleteTarget}
          onOpenChange={() => setDeleteTarget(null)}
          title="Deactivate Department?"
          description={`Are you sure you want to deactivate "${deleteTarget.name}"? This will prevent it from being used in new transactions.`}
          confirmText="Deactivate"
          cancelText="Cancel"
          onConfirm={handleDelete}
          destructive
          isLoading={actionLoading === deleteTarget.department_id}
        />
      )}
    </div>
  );
}

"use client";

/**
 * Employee List Component
 * Displays a list of employees for client's stores with search, filtering, and pagination
 * Includes PIN management for STORE_MANAGER and SHIFT_MANAGER roles
 *
 * Story: 2.91 - Client Employee Management
 */

import { useState, useMemo, useEffect } from "react";
import {
  useClientEmployees,
  useDeleteEmployee,
  type Employee,
} from "@/lib/api/client-employees";
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
  ChevronLeft,
  ChevronRight,
  Users,
  AlertCircle,
  Pencil,
  Check,
  X,
} from "lucide-react";
import { SetEmployeePINModal } from "@/components/settings/SetEmployeePINModal";

/**
 * Roles that support PIN authentication for terminal/desktop access
 * Only STORE_MANAGER and SHIFT_MANAGER can have PINs
 */
const PIN_ENABLED_ROLES = ["STORE_MANAGER", "SHIFT_MANAGER"] as const;

/**
 * Sentinel value for "all stores" filter.
 * Radix UI Select reserves empty string "" for clearing selection,
 * so we use this constant to represent "no store filter applied".
 */
const ALL_STORES = "all" as const;

/** Valid store filter values: either the sentinel or a store UUID */
type StoreFilterValue = typeof ALL_STORES | (string & {});

interface EmployeeListProps {
  onCreateEmployee: () => void;
}

/**
 * Check if an employee has a role that supports PIN authentication
 * @param employee - The employee to check
 * @returns true if employee has STORE_MANAGER or SHIFT_MANAGER role
 */
function hasPINEnabledRole(employee: Employee): boolean {
  return employee.roles.some((role) =>
    PIN_ENABLED_ROLES.includes(role.role_code as (typeof PIN_ENABLED_ROLES)[number]),
  );
}

export function EmployeeList({ onCreateEmployee }: EmployeeListProps) {
  const { toast } = useToast();

  // State
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [storeFilter, setStoreFilter] = useState<StoreFilterValue>(ALL_STORES);
  const [employeeToDelete, setEmployeeToDelete] = useState<Employee | null>(
    null,
  );
  const [isDeleting, setIsDeleting] = useState(false);

  // PIN Modal state
  const [pinEmployee, setPinEmployee] = useState<Employee | null>(null);

  // Debounced search value
  const debouncedSearch = useDebounce(search, 300);

  // Reset page when search or filter changes
  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, storeFilter]);

  // Build query params for API call
  // Transforms ALL_STORES sentinel to undefined for the API
  const queryParams = useMemo(
    () => ({
      page,
      limit: 10,
      search: debouncedSearch || undefined,
      store_id: storeFilter === ALL_STORES ? undefined : storeFilter,
    }),
    [page, debouncedSearch, storeFilter],
  );

  // Fetch employees
  const {
    data: employeesData,
    isLoading,
    isError,
    error,
    refetch,
  } = useClientEmployees(queryParams);

  // Fetch dashboard for stores list (for filter dropdown)
  const { data: dashboardData } = useClientDashboard();

  // Delete mutation
  const deleteEmployeeMutation = useDeleteEmployee();

  // Get stores for filter dropdown
  const stores = dashboardData?.stores || [];

  // Handle delete
  const handleDelete = async () => {
    if (!employeeToDelete) return;

    setIsDeleting(true);
    try {
      await deleteEmployeeMutation.mutateAsync(employeeToDelete.user_id);
      toast({
        title: "Employee deleted",
        description: `${employeeToDelete.name} has been removed.`,
      });
      setEmployeeToDelete(null);
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Error",
        description:
          error instanceof Error ? error.message : "Failed to delete employee",
      });
    } finally {
      setIsDeleting(false);
    }
  };

  // Pagination helpers
  const meta = employeesData?.meta;
  const canGoBack = page > 1;
  const canGoForward = meta ? page < meta.totalPages : false;

  // Loading state
  if (isLoading) {
    return <EmployeeListSkeleton />;
  }

  // Error state
  if (isError) {
    return (
      <div className="flex flex-col items-center justify-center py-12">
        <AlertCircle className="h-12 w-12 text-destructive mb-4" />
        <h3 className="text-lg font-semibold mb-2">Failed to load employees</h3>
        <p className="text-muted-foreground mb-4">
          {error instanceof Error ? error.message : "An error occurred"}
        </p>
        <Button onClick={() => refetch()} variant="outline">
          Try again
        </Button>
      </div>
    );
  }

  const employees = employeesData?.data || [];

  // Empty state - show when no employees and no active filters
  if (
    employees.length === 0 &&
    !debouncedSearch &&
    storeFilter === ALL_STORES
  ) {
    return (
      <div className="flex flex-col items-center justify-center py-12">
        <Users className="h-12 w-12 text-muted-foreground mb-4" />
        <h3 className="text-lg font-semibold mb-2">No employees yet</h3>
        <p className="text-muted-foreground mb-4">
          Create your first employee to get started
        </p>
        <Button onClick={onCreateEmployee}>
          <Plus className="h-4 w-4 mr-2" />
          Add Employee
        </Button>
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
            placeholder="Search by name or email..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10"
            data-testid="employee-search"
          />
        </div>

        {stores.length > 1 && (
          <Select value={storeFilter} onValueChange={setStoreFilter}>
            <SelectTrigger
              className="w-full sm:w-[200px]"
              data-testid="store-filter"
            >
              <SelectValue placeholder="All stores" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL_STORES}>All stores</SelectItem>
              {stores.map((store) => (
                <SelectItem key={store.store_id} value={store.store_id}>
                  {store.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        <Button onClick={onCreateEmployee} data-testid="create-employee-btn">
          <Plus className="h-4 w-4 mr-2" />
          Add Employee
        </Button>
      </div>

      {/* Table */}
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Store</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>PIN</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-[120px]">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {employees.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={7}
                  className="h-24 text-center text-muted-foreground"
                >
                  No employees found matching your search.
                </TableCell>
              </TableRow>
            ) : (
              employees.map((employee) => {
                const showPIN = hasPINEnabledRole(employee);
                return (
                  <TableRow
                    key={employee.user_id}
                    data-testid={`employee-row-${employee.user_id}`}
                  >
                    <TableCell className="font-medium">{employee.name}</TableCell>
                    <TableCell>{employee.email}</TableCell>
                    <TableCell>{employee.store_name || "—"}</TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {employee.roles.map((role) => (
                          <Badge key={role.user_role_id} variant="secondary">
                            {role.role_code}
                          </Badge>
                        ))}
                      </div>
                    </TableCell>
                    <TableCell>
                      {showPIN ? (
                        employee.has_pin ? (
                          <span className="flex items-center gap-1 text-green-600" title="PIN is set">
                            <Check className="h-4 w-4" />
                            <span className="text-xs">Set</span>
                          </span>
                        ) : (
                          <span className="flex items-center gap-1 text-red-500" title="PIN not set">
                            <X className="h-4 w-4" />
                            <span className="text-xs">Not Set</span>
                          </span>
                        )
                      ) : (
                        <span className="text-muted-foreground text-xs">N/A</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          employee.status === "ACTIVE" ? "default" : "outline"
                        }
                      >
                        {employee.status}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        {/* PIN Button - only for STORE_MANAGER and SHIFT_MANAGER */}
                        {showPIN && employee.store_id && (
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => setPinEmployee(employee)}
                            data-testid={`set-pin-${employee.user_id}`}
                            title={employee.has_pin ? "Reset PIN" : "Set PIN"}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                        )}
                        {/* Delete Button */}
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => setEmployeeToDelete(employee)}
                          data-testid={`delete-employee-${employee.user_id}`}
                          title="Delete employee"
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      {meta && meta.totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            Showing {(page - 1) * meta.limit + 1} to{" "}
            {Math.min(page * meta.limit, meta.total)} of {meta.total} employees
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="icon"
              onClick={() => setPage(page - 1)}
              disabled={!canGoBack}
              data-testid="prev-page"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="text-sm">
              Page {page} of {meta.totalPages}
            </span>
            <Button
              variant="outline"
              size="icon"
              onClick={() => setPage(page + 1)}
              disabled={!canGoForward}
              data-testid="next-page"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {/* Delete Confirmation Dialog */}
      <AlertDialog
        open={!!employeeToDelete}
        onOpenChange={(open) => !open && setEmployeeToDelete(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Employee</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete{" "}
              <span className="font-semibold">{employeeToDelete?.name}</span>?
              This action cannot be undone.
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

      {/* Set/Reset PIN Modal */}
      {pinEmployee && pinEmployee.store_id && (
        <SetEmployeePINModal
          employee={pinEmployee}
          storeId={pinEmployee.store_id}
          open={!!pinEmployee}
          onOpenChange={(open) => {
            if (!open) {
              setPinEmployee(null);
              // Refetch employee list to update PIN status
              refetch();
            }
          }}
        />
      )}
    </div>
  );
}

/**
 * Loading skeleton for employee list
 */
function EmployeeListSkeleton() {
  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row gap-4">
        <Skeleton className="h-10 flex-1" />
        <Skeleton className="h-10 w-full sm:w-[200px]" />
        <Skeleton className="h-10 w-[140px]" />
      </div>
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Store</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>PIN</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-[120px]">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {Array.from({ length: 5 }).map((_, i) => (
              <TableRow key={i}>
                <TableCell>
                  <Skeleton className="h-4 w-[120px]" />
                </TableCell>
                <TableCell>
                  <Skeleton className="h-4 w-[180px]" />
                </TableCell>
                <TableCell>
                  <Skeleton className="h-4 w-[100px]" />
                </TableCell>
                <TableCell>
                  <Skeleton className="h-6 w-[80px]" />
                </TableCell>
                <TableCell>
                  <Skeleton className="h-4 w-[50px]" />
                </TableCell>
                <TableCell>
                  <Skeleton className="h-6 w-[60px]" />
                </TableCell>
                <TableCell>
                  <Skeleton className="h-8 w-16" />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

export default EmployeeList;

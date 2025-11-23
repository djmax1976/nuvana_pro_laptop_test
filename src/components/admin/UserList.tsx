"use client";

import { useState, useMemo } from "react";
import { useAdminUsers } from "@/lib/api/admin-users";
import { UserStatus } from "@/types/admin-user";
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
  Plus,
  Eye,
  Pencil,
  Search,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import Link from "next/link";
import { format } from "date-fns";
import { useDebounce } from "@/hooks/useDebounce";

/**
 * UserList component
 * Displays a list of users in a table format (System Admin only)
 * Includes search, filter by status, and pagination
 * Shows role badges with color coding by scope
 */
export function UserList() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");

  // Debounce search to avoid excessive API calls
  const debouncedSearch = useDebounce(search, 300);

  const { data, isLoading, error } = useAdminUsers({
    page,
    limit: 20,
    search: debouncedSearch || undefined,
    status: statusFilter !== "all" ? (statusFilter as UserStatus) : undefined,
  });

  // Reset to page 1 when filters change
  useMemo(() => {
    setPage(1);
  }, [debouncedSearch, statusFilter]);

  if (isLoading) {
    return <UserListSkeleton />;
  }

  if (error) {
    return (
      <div className="rounded-lg border border-destructive bg-destructive/10 p-4">
        <p className="text-sm font-medium text-destructive">
          Error loading users
        </p>
        <p className="mt-1 text-sm text-muted-foreground">
          {error instanceof Error ? error.message : "An unknown error occurred"}
        </p>
      </div>
    );
  }

  const users = data?.data || [];
  const meta = data?.meta;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Users</h1>
        <Link href="/admin/users/new">
          <Button data-testid="create-user-button">
            <Plus className="mr-2 h-4 w-4" />
            Create User
          </Button>
        </Link>
      </div>

      {/* Search and Filter Controls */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search users..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10"
            data-testid="user-search-input"
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[180px]" data-testid="user-status-filter">
            <SelectValue placeholder="Filter by status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            <SelectItem value="ACTIVE">Active</SelectItem>
            <SelectItem value="INACTIVE">Inactive</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {users.length === 0 ? (
        <div className="rounded-lg border p-8 text-center">
          <p className="text-sm text-muted-foreground">
            {search || statusFilter !== "all"
              ? "No users match your search criteria."
              : "No users found. Create your first user to get started."}
          </p>
        </div>
      ) : (
        <>
          <div className="rounded-md border">
            <Table data-testid="user-list-table">
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Roles</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {users.map((user) => (
                  <TableRow
                    key={user.user_id}
                    data-testid={`user-row-${user.user_id}`}
                  >
                    <TableCell
                      className="font-medium"
                      data-testid={`user-name-${user.user_id}`}
                    >
                      {user.name}
                    </TableCell>
                    <TableCell data-testid={`user-email-${user.user_id}`}>
                      {user.email}
                    </TableCell>
                    <TableCell data-testid={`user-roles-${user.user_id}`}>
                      <div className="flex flex-wrap gap-1">
                        {user.roles.length > 0 ? (
                          user.roles.map((role) => (
                            <RoleBadge
                              key={role.user_role_id}
                              code={role.role.code}
                              scope={role.role.scope}
                            />
                          ))
                        ) : (
                          <span className="text-sm text-muted-foreground">
                            No roles
                          </span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell data-testid={`user-status-${user.user_id}`}>
                      <StatusBadge status={user.status} />
                    </TableCell>
                    <TableCell
                      className="text-right"
                      data-testid={`user-actions-${user.user_id}`}
                    >
                      <div className="flex justify-end gap-2">
                        <Link href={`/admin/users/${user.user_id}`}>
                          <Button variant="ghost" size="icon">
                            <Eye className="h-4 w-4" />
                            <span className="sr-only">View details</span>
                          </Button>
                        </Link>
                        <Link href={`/admin/users/${user.user_id}`}>
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

          {/* Pagination Controls */}
          {meta && meta.totalPages > 1 && (
            <div
              className="flex items-center justify-between"
              data-testid="pagination-controls"
            >
              <p className="text-sm text-muted-foreground">
                Showing {(meta.page - 1) * meta.limit + 1} to{" "}
                {Math.min(meta.page * meta.limit, meta.total)} of {meta.total}{" "}
                users
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
                  Page {meta.page} of {meta.totalPages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    setPage((p) => Math.min(meta.totalPages, p + 1))
                  }
                  disabled={page >= meta.totalPages}
                >
                  Next
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

/**
 * Status badge component
 * Displays user status with appropriate styling
 */
function StatusBadge({ status }: { status: string }) {
  const statusStyles = {
    ACTIVE: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300",
    INACTIVE: "bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-300",
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
 * Role badge component
 * Displays role code with color coding by scope type
 */
function RoleBadge({ code, scope }: { code: string; scope: string }) {
  const scopeStyles = {
    SYSTEM:
      "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-300",
    COMPANY: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300",
    STORE:
      "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-300",
  };

  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
        scopeStyles[scope as keyof typeof scopeStyles] || scopeStyles.SYSTEM
      }`}
      title={`${scope} scope`}
    >
      {code}
    </span>
  );
}

/**
 * Loading skeleton for UserList
 */
function UserListSkeleton() {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="h-8 w-32 animate-pulse rounded bg-muted" />
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
              <TableHead>Name</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Roles</TableHead>
              <TableHead>Status</TableHead>
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
                  <div className="h-4 w-40 animate-pulse rounded bg-muted" />
                </TableCell>
                <TableCell>
                  <div className="flex gap-1">
                    <div className="h-5 w-16 animate-pulse rounded-full bg-muted" />
                    <div className="h-5 w-20 animate-pulse rounded-full bg-muted" />
                  </div>
                </TableCell>
                <TableCell>
                  <div className="h-6 w-20 animate-pulse rounded-full bg-muted" />
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

"use client";

import { useParams, useRouter } from "next/navigation";
import { useAdminUser, useUpdateUserStatus } from "@/lib/api/admin-users";
import { RoleAssignmentDialog } from "@/components/admin/RoleAssignmentDialog";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import Link from "next/link";
import { ChevronRight, ChevronLeft, Loader2 } from "lucide-react";
import { format } from "date-fns";

/**
 * User Detail Page
 * Shows user details and allows role management (System Admin only)
 */
export default function UserDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { toast } = useToast();
  const userId = params?.userId as string;

  const { data, isLoading, error, refetch } = useAdminUser(userId);
  const updateStatusMutation = useUpdateUserStatus();

  const handleStatusToggle = async () => {
    if (!data?.data) return;

    const newStatus = data.data.status === "ACTIVE" ? "INACTIVE" : "ACTIVE";

    try {
      await updateStatusMutation.mutateAsync({
        userId,
        data: { status: newStatus },
      });

      toast({
        title: "Status updated",
        description: `User has been ${newStatus === "ACTIVE" ? "activated" : "deactivated"}`,
      });
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Error updating status",
        description:
          error instanceof Error ? error.message : "An unknown error occurred",
      });
    }
  };

  if (isLoading) {
    return (
      <div className="container mx-auto py-6">
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </div>
    );
  }

  if (error || !data?.data) {
    return (
      <div className="container mx-auto py-6">
        <div className="rounded-lg border border-destructive bg-destructive/10 p-4">
          <p className="text-sm font-medium text-destructive">
            Error loading user
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            {error instanceof Error ? error.message : "User not found"}
          </p>
          <Button
            variant="outline"
            className="mt-4"
            onClick={() => router.push("/admin/users")}
          >
            <ChevronLeft className="mr-2 h-4 w-4" />
            Back to Users
          </Button>
        </div>
      </div>
    );
  }

  const user = data.data;

  return (
    <div className="container mx-auto py-6">
      {/* Breadcrumb */}
      <nav className="mb-6 flex items-center text-sm text-muted-foreground">
        <Link href="/admin/users" className="hover:text-foreground">
          Users
        </Link>
        <ChevronRight className="mx-2 h-4 w-4" />
        <span className="text-foreground">{user.name}</span>
      </nav>

      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">{user.name}</h1>
            <p className="text-sm text-muted-foreground">{user.email}</p>
          </div>
          <div className="flex gap-2">
            <RoleAssignmentDialog user={user} onRoleChange={() => refetch()} />
            <Button
              variant={user.status === "ACTIVE" ? "destructive" : "default"}
              onClick={handleStatusToggle}
              disabled={updateStatusMutation.isPending}
              data-testid={`deactivate-user-button-${user.user_id}`}
            >
              {updateStatusMutation.isPending && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              {user.status === "ACTIVE" ? "Deactivate" : "Activate"}
            </Button>
          </div>
        </div>

        {/* User Details Card */}
        <div className="rounded-lg border p-6">
          <h2 className="mb-4 text-lg font-semibold">User Details</h2>
          <dl className="grid gap-4 sm:grid-cols-2">
            <div>
              <dt className="text-sm font-medium text-muted-foreground">
                Status
              </dt>
              <dd className="mt-1">
                <StatusBadge status={user.status} />
              </dd>
            </div>
            <div>
              <dt className="text-sm font-medium text-muted-foreground">
                Created
              </dt>
              <dd className="mt-1 text-sm">
                {format(new Date(user.created_at), "MMM d, yyyy 'at' h:mm a")}
              </dd>
            </div>
            <div>
              <dt className="text-sm font-medium text-muted-foreground">
                Updated
              </dt>
              <dd className="mt-1 text-sm">
                {format(new Date(user.updated_at), "MMM d, yyyy 'at' h:mm a")}
              </dd>
            </div>
            <div>
              <dt className="text-sm font-medium text-muted-foreground">
                User ID
              </dt>
              <dd className="mt-1 font-mono text-xs text-muted-foreground">
                {user.user_id}
              </dd>
            </div>
          </dl>
        </div>

        {/* Roles Card */}
        <div className="rounded-lg border p-6">
          <h2 className="mb-4 text-lg font-semibold">Assigned Roles</h2>
          {user.roles.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No roles assigned to this user.
            </p>
          ) : (
            <div className="space-y-3">
              {user.roles.map((role) => (
                <div
                  key={role.user_role_id}
                  className="rounded-lg bg-muted/50 p-3"
                >
                  <div className="flex items-center gap-2">
                    <RoleBadge code={role.role.code} scope={role.role.scope} />
                  </div>
                  <div className="mt-2 text-xs text-muted-foreground">
                    <p>Scope: {role.role.scope}</p>
                    {role.company_name && <p>Company: {role.company_name}</p>}
                    {role.store_name && <p>Store: {role.store_name}</p>}
                    <p>
                      Assigned:{" "}
                      {format(new Date(role.assigned_at), "MMM d, yyyy")}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * Status badge component
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
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-sm font-medium ${
        scopeStyles[scope as keyof typeof scopeStyles] || scopeStyles.SYSTEM
      }`}
    >
      {code}
    </span>
  );
}

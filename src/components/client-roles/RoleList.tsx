"use client";

/**
 * Role List Component
 * Displays a list of STORE scope roles with their permission badges
 * Allows Client Owners to select a role for permission management
 *
 * Story: 2.92 - Client Role Permission Management
 */

import {
  useClientRoles,
  type RoleWithPermissions,
} from "@/lib/api/client-roles";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Shield, Settings, AlertCircle, Users, RefreshCw } from "lucide-react";

interface RoleListProps {
  onSelectRole: (roleId: string) => void;
  selectedRoleId?: string | null;
}

/**
 * Get a friendly display name for a role code
 */
function getRoleDisplayName(code: string): string {
  switch (code) {
    case "STORE_MANAGER":
      return "Store Manager";
    case "SHIFT_MANAGER":
      return "Shift Manager";
    case "CASHIER":
      return "Cashier";
    default:
      return code.replace(/_/g, " ");
  }
}

/**
 * Get the icon for a role based on its code
 */
function getRoleIcon(code: string) {
  switch (code) {
    case "STORE_MANAGER":
      return <Shield className="h-5 w-5 text-blue-500" />;
    case "SHIFT_MANAGER":
      return <Users className="h-5 w-5 text-green-500" />;
    case "CASHIER":
      return <Users className="h-5 w-5 text-gray-500" />;
    default:
      return <Shield className="h-5 w-5 text-gray-400" />;
  }
}

/**
 * Check if a role has any client overrides
 */
function hasOverrides(role: RoleWithPermissions): boolean {
  return role.permissions.some((p) => p.is_client_override);
}

export function RoleList({ onSelectRole, selectedRoleId }: RoleListProps) {
  const { data: roles, isLoading, isError, error, refetch } = useClientRoles();

  // Loading state
  if (isLoading) {
    return (
      <div className="space-y-4" data-testid="roles-list-loading">
        {[1, 2, 3].map((i) => (
          <Card key={i} className="animate-pulse">
            <CardHeader className="flex flex-row items-center gap-4">
              <Skeleton className="h-10 w-10 rounded-full" />
              <div className="space-y-2 flex-1">
                <Skeleton className="h-5 w-32" />
                <Skeleton className="h-4 w-48" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-2">
                {[1, 2, 3, 4].map((j) => (
                  <Skeleton key={j} className="h-6 w-20" />
                ))}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  // Error state
  if (isError) {
    return (
      <Card className="border-destructive" data-testid="roles-list-error">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-destructive">
            <AlertCircle className="h-5 w-5" />
            Error Loading Roles
          </CardTitle>
          <CardDescription>
            {error instanceof Error
              ? error.message
              : "Failed to load roles. Please try again."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button variant="outline" onClick={() => refetch()}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Retry
          </Button>
        </CardContent>
      </Card>
    );
  }

  // Empty state
  if (!roles || roles.length === 0) {
    return (
      <Card data-testid="roles-list-empty">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5" />
            No Roles Available
          </CardTitle>
          <CardDescription>
            No store roles have been assigned to your company yet. Contact your
            system administrator to enable roles for permission management.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <div className="space-y-4" data-testid="roles-list">
      {roles.map((role) => (
        <Card
          key={role.role_id}
          data-testid={`role-card-${role.role_id}`}
          className={`cursor-pointer transition-all hover:shadow-md ${
            selectedRoleId === role.role_id
              ? "ring-2 ring-primary border-primary"
              : ""
          }`}
          role="button"
          tabIndex={0}
          aria-label={`Select ${getRoleDisplayName(role.code)} role to manage permissions`}
          onClick={() => onSelectRole(role.role_id)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              onSelectRole(role.role_id);
            }
          }}
        >
          <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-2">
            <div className="flex items-start gap-3">
              <div className="mt-1">{getRoleIcon(role.code)}</div>
              <div>
                <CardTitle
                  className="text-lg"
                  data-testid={`role-name-${role.role_id}`}
                >
                  {getRoleDisplayName(role.code)}
                  {hasOverrides(role) && (
                    <Badge
                      variant="secondary"
                      className="ml-2 text-xs"
                      data-testid={`role-customized-${role.role_id}`}
                    >
                      Customized
                    </Badge>
                  )}
                </CardTitle>
                <CardDescription className="mt-1">
                  {role.description ||
                    `Permissions for ${getRoleDisplayName(role.code)}`}
                </CardDescription>
              </div>
            </div>
            <Button
              variant="ghost"
              size="sm"
              data-testid={`manage-permissions-button-${role.role_id}`}
              tabIndex={-1}
              aria-hidden="true"
              onClick={(e) => {
                e.stopPropagation();
                onSelectRole(role.role_id);
              }}
            >
              <Settings className="h-4 w-4 mr-1" />
              Manage
            </Button>
          </CardHeader>
          <CardContent data-testid={`role-permissions-${role.role_id}`}>
            <div className="flex flex-wrap gap-2">
              {role.permission_badges.slice(0, 8).map((permCode) => (
                <Badge
                  key={permCode}
                  variant="outline"
                  className="text-xs"
                  data-testid={`permission-badge-${permCode}`}
                >
                  {permCode.replace(/_/g, " ")}
                </Badge>
              ))}
              {role.permission_badges.length > 8 && (
                <Badge variant="secondary" className="text-xs">
                  +{role.permission_badges.length - 8} more
                </Badge>
              )}
              {role.permission_badges.length === 0 && (
                <span className="text-sm text-muted-foreground">
                  No permissions assigned
                </span>
              )}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

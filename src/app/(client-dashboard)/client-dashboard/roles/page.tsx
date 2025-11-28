"use client";

/**
 * Roles & Permissions Page
 * Page for Client Owners to customize role permissions for their stores
 *
 * Story: 2.92 - Client Role Permission Management
 */

import { useState } from "react";
import { RoleList } from "@/components/client-roles/RoleList";
import { RolePermissionEditor } from "@/components/client-roles/RolePermissionEditor";

export default function RolesPage() {
  const [selectedRoleId, setSelectedRoleId] = useState<string | null>(null);

  return (
    <div className="space-y-6" data-testid="roles-page">
      {/* Page Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight">
          Roles & Permissions
        </h1>
        <p className="text-muted-foreground">
          Customize which permissions each role has in your stores
        </p>
      </div>

      {/* Content - either role list or permission editor */}
      {selectedRoleId ? (
        <RolePermissionEditor
          roleId={selectedRoleId}
          onBack={() => setSelectedRoleId(null)}
        />
      ) : (
        <RoleList onSelectRole={(roleId) => setSelectedRoleId(roleId)} />
      )}
    </div>
  );
}

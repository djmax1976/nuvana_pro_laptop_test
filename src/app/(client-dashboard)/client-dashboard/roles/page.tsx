"use client";

/**
 * Roles & Permissions Page
 * Page for Client Owners to customize role permissions for their stores
 *
 * Story: 2.92 - Client Role Permission Management
 *
 * Security Considerations (FE-001: STATE_MANAGEMENT):
 * - Page title uses centralized context for consistent header display
 * - No sensitive data stored in component state
 */

import { useState } from "react";
import { RoleList } from "@/components/client-roles/RoleList";
import { RolePermissionEditor } from "@/components/client-roles/RolePermissionEditor";
import { usePageTitleEffect } from "@/contexts/PageTitleContext";

export default function RolesPage() {
  const [selectedRoleId, setSelectedRoleId] = useState<string | null>(null);

  // Set page title in header (FE-001: STATE_MANAGEMENT)
  usePageTitleEffect("Roles & Permissions");

  return (
    <div className="space-y-6" data-testid="roles-page">
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

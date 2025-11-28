"use client";

/**
 * Deleted Roles Page
 * Super Admin page for viewing and managing soft-deleted roles
 */

import { DeletedRolesList } from "@/components/admin-roles/DeletedRolesList";

export default function DeletedRolesPage() {
  return (
    <div className="container mx-auto py-6">
      <DeletedRolesList />
    </div>
  );
}

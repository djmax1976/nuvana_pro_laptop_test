"use client";

import { AdminRoleList } from "@/components/admin-roles/AdminRoleList";

/**
 * Admin Role Management Page
 * Displays all roles with CRUD capabilities (Super Admin only)
 */
export default function RolesPage() {
  return (
    <div className="container mx-auto py-6">
      <AdminRoleList />
    </div>
  );
}

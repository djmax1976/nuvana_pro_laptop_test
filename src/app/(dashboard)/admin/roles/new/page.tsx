"use client";

import { CreateRoleForm } from "@/components/admin-roles/CreateRoleForm";

/**
 * Create Role Page
 * Form to create a new role (Super Admin only)
 */
export default function CreateRolePage() {
  return (
    <div className="container mx-auto py-6">
      <CreateRoleForm />
    </div>
  );
}

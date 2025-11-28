"use client";

import { useParams } from "next/navigation";
import { AdminRolePermissionEditor } from "@/components/admin-roles/AdminRolePermissionEditor";

/**
 * Admin Role Detail Page
 * Edit role permissions (Super Admin only)
 */
export default function RoleDetailPage() {
  const params = useParams();
  const roleId = params.roleId as string;

  return (
    <div className="container mx-auto py-6">
      <AdminRolePermissionEditor roleId={roleId} />
    </div>
  );
}

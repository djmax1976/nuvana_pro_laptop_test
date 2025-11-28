"use client";

/**
 * Company Role Assignment Page
 * Super Admin page for managing which roles are available to each company
 */

import { CompanyRoleAssignment } from "@/components/admin-roles/CompanyRoleAssignment";

export default function CompanyRolesPage() {
  return (
    <div className="container mx-auto py-6">
      <CompanyRoleAssignment />
    </div>
  );
}

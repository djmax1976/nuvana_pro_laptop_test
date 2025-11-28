import { redirect } from "next/navigation";
import { checkSuperAdminPermission } from "@/lib/server/auth";
import { AdminRoleListClient } from "@/components/admin-roles/AdminRoleListClient";

/**
 * Admin Role Management Page
 * Displays all roles with CRUD capabilities (Super Admin only)
 *
 * SECURITY: Server-side authorization check ensures only users with
 * ADMIN_SYSTEM_CONFIG permission can access this page.
 * This prevents client-side bypass of authorization.
 *
 * If user is not authorized, they are redirected to the dashboard
 * with an error parameter indicating unauthorized access.
 */
export default async function RolesPage() {
  // Server-side authorization check
  // This runs on the server before any client-side code executes
  const { isAuthorized, user } = await checkSuperAdminPermission();

  if (!isAuthorized) {
    // Redirect unauthorized users - prevents access to the page
    // The redirect happens server-side, so client-side bypass is not possible
    redirect("/dashboard?error=unauthorized");
  }

  return (
    <div className="container mx-auto py-6">
      <AdminRoleListClient
        isAuthorized={isAuthorized}
        userPermissions={user?.permissions || []}
      />
    </div>
  );
}

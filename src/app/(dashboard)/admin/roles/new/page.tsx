import { redirect } from "next/navigation";
import { checkSuperAdminPermission } from "@/lib/server/auth";
import { CreateRoleForm } from "@/components/admin-roles/CreateRoleForm";

/**
 * Create Role Page
 * Form to create a new role (Super Admin only)
 *
 * SECURITY: Server-side authorization check ensures only users with
 * ADMIN_SYSTEM_CONFIG permission can access this page.
 * This prevents client-side bypass of authorization.
 *
 * If user is not authorized, they are redirected to the roles list page
 * with an error parameter indicating unauthorized access.
 */
export default async function CreateRolePage() {
  // Server-side authorization check
  // This runs on the server before any client-side code executes
  const { isAuthorized } = await checkSuperAdminPermission();

  if (!isAuthorized) {
    // Redirect unauthorized users - prevents access to the page
    // The redirect happens server-side, so client-side bypass is not possible
    redirect("/admin/roles?error=unauthorized");
  }

  return (
    <div className="container mx-auto py-6">
      <CreateRoleForm />
    </div>
  );
}

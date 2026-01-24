"use client";

import { HierarchicalUserList } from "@/components/admin/HierarchicalUserList";

/**
 * User Management List Page
 * Displays all users in a hierarchical accordion structure (System Admin only)
 *
 * Structure:
 * - System Users section (SUPERADMIN, CORPORATE_ADMIN)
 * - Client Owner accordions (expandable)
 *   - Company sections
 *     - Store sections
 *       - Store users (STORE_MANAGER, SHIFT_MANAGER, CLIENT_USER, etc.)
 */
export default function UsersPage() {
  return (
    <div className="container mx-auto py-6">
      <HierarchicalUserList />
    </div>
  );
}

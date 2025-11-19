"use client";

import { UserList } from "@/components/admin/UserList";

/**
 * User Management List Page
 * Displays all users with roles in a table (System Admin only)
 */
export default function UsersPage() {
  return (
    <div className="container mx-auto py-6">
      <UserList />
    </div>
  );
}

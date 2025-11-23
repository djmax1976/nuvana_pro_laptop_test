"use client";

import { UserForm } from "@/components/admin/UserForm";
import Link from "next/link";
import { ChevronRight } from "lucide-react";

/**
 * Create User Page
 * Form for creating new users (System Admin only)
 */
export default function CreateUserPage() {
  return (
    <div className="container mx-auto py-6">
      {/* Breadcrumb */}
      <nav className="mb-6 flex items-center text-sm text-muted-foreground">
        <Link href="/admin/users" className="hover:text-foreground">
          Users
        </Link>
        <ChevronRight className="mx-2 h-4 w-4" />
        <span className="text-foreground">Create User</span>
      </nav>

      <div className="mx-auto max-w-2xl">
        <h1 className="mb-6 text-2xl font-bold">Create User</h1>
        <div className="rounded-lg border p-6">
          <UserForm />
        </div>
      </div>
    </div>
  );
}

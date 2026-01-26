"use client";

import { useState } from "react";
import { UserForm } from "@/components/admin/UserForm";
import { ClientOwnerWizard } from "@/components/admin/ClientOwnerWizard";
import Link from "next/link";
import { ChevronRight, Building2, Users } from "lucide-react";
import { useRouter } from "next/navigation";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";

/**
 * User creation type options
 */
type CreateUserType = "regular" | "client-owner" | null;

/**
 * Create User Page
 * Form for creating new users (System Admin only)
 *
 * Displays a type selector first:
 * - Regular User: Uses UserForm for SYSTEM or STORE scoped roles
 * - Client Owner: Uses ClientOwnerWizard for atomic creation of
 *   User + Company + Store + Store Login
 */
export default function CreateUserPage() {
  const router = useRouter();
  const [selectedType, setSelectedType] = useState<CreateUserType>(null);

  // Handle successful creation - navigate back to users list
  const handleSuccess = () => {
    router.push("/admin/users");
  };

  // Render the appropriate form based on selected type
  const renderContent = () => {
    if (selectedType === "client-owner") {
      return (
        <ClientOwnerWizard
          onSuccess={handleSuccess}
          onCancel={() => setSelectedType(null)}
        />
      );
    }

    if (selectedType === "regular") {
      return (
        <div className="mx-auto max-w-2xl">
          <div className="mb-4 flex items-center justify-between">
            <h1 className="text-2xl font-bold">Create User</h1>
            <button
              onClick={() => setSelectedType(null)}
              className="text-sm text-muted-foreground hover:text-foreground"
            >
              ← Back to selection
            </button>
          </div>
          <div className="rounded-lg border p-6">
            <UserForm />
          </div>
        </div>
      );
    }

    // Type selection screen
    return (
      <div className="mx-auto max-w-3xl">
        <h1 className="mb-2 text-2xl font-bold">Create User</h1>
        <p className="mb-6 text-muted-foreground">
          Select the type of user you want to create
        </p>

        <div className="grid gap-4 md:grid-cols-2">
          {/* Regular User Option */}
          <Card
            className={cn(
              "cursor-pointer transition-all hover:border-primary hover:shadow-md",
              selectedType === "regular" &&
                "border-primary ring-2 ring-primary",
            )}
            onClick={() => setSelectedType("regular")}
          >
            <CardHeader>
              <div className="mb-2 flex h-12 w-12 items-center justify-center rounded-lg bg-blue-100 dark:bg-blue-900">
                <Users className="h-6 w-6 text-blue-600 dark:text-blue-400" />
              </div>
              <CardTitle className="text-lg">System or Store User</CardTitle>
              <CardDescription>
                Create a user with a system-level role (Super Admin, Support) or
                a store-level role (Store Manager, Cashier, etc.)
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="list-inside list-disc space-y-1 text-sm text-muted-foreground">
                <li>Assign to existing company and store</li>
                <li>System Admin, Support, or Store roles</li>
                <li>Quick single-step creation</li>
              </ul>
            </CardContent>
          </Card>

          {/* Client Owner Option */}
          <Card
            className={cn(
              "cursor-pointer transition-all hover:border-primary hover:shadow-md",
              selectedType === "client-owner" &&
                "border-primary ring-2 ring-primary",
            )}
            onClick={() => setSelectedType("client-owner")}
          >
            <CardHeader>
              <div className="mb-2 flex h-12 w-12 items-center justify-center rounded-lg bg-green-100 dark:bg-green-900">
                <Building2 className="h-6 w-6 text-green-600 dark:text-green-400" />
              </div>
              <CardTitle className="text-lg">Client Owner</CardTitle>
              <CardDescription>
                Create a new client owner with their company, first store, and
                store login account - everything needed for the desktop app.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="list-inside list-disc space-y-1 text-sm text-muted-foreground">
                <li>4-step guided wizard</li>
                <li>Creates user, company, store, and store login</li>
                <li>Desktop app ready on completion</li>
              </ul>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  };

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

      {renderContent()}
    </div>
  );
}

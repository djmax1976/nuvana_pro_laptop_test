"use client";

import { ClientForm } from "@/components/clients/ClientForm";

/**
 * Create client page
 * Form for creating a new client (System Admin only)
 */
export default function NewClientPage() {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Create Client</h1>
      <ClientForm />
    </div>
  );
}

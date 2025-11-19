"use client";

import { StoreForm } from "@/components/stores/StoreForm";
import { useSearchParams } from "next/navigation";

/**
 * Create store page
 * Form for creating a new store (Corporate Admin)
 * Requires companyId query parameter
 */
export default function NewStorePage() {
  const searchParams = useSearchParams();
  const companyId = searchParams?.get("companyId");

  if (!companyId) {
    return (
      <div className="rounded-lg border p-8 text-center">
        <p className="text-sm text-muted-foreground">
          Company ID is required to create a store
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Create Store</h1>
      <StoreForm companyId={companyId} />
    </div>
  );
}

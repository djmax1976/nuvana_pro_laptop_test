"use client";

import { StoreList } from "@/components/stores/StoreList";
import { useSearchParams } from "next/navigation";

/**
 * Stores page
 * Displays list of stores for a company (Corporate Admin)
 * Requires companyId query parameter
 */
export default function StoresPage() {
  const searchParams = useSearchParams();
  const companyId = searchParams?.get("companyId");

  if (!companyId) {
    return (
      <div className="rounded-lg border p-8 text-center">
        <p className="text-sm text-muted-foreground">
          Company ID is required to view stores
        </p>
      </div>
    );
  }

  return <StoreList companyId={companyId} />;
}

"use client";

import { StoreForm } from "@/components/stores/StoreForm";
import { useStore } from "@/lib/api/stores";
import { useSearchParams } from "next/navigation";

interface EditStorePageProps {
  params: {
    storeId: string;
  };
}

/**
 * Edit store page
 * Form for editing an existing store (Corporate Admin)
 */
export default function EditStorePage({ params }: EditStorePageProps) {
  const searchParams = useSearchParams();
  const companyId = searchParams.get("companyId");
  const { data: store, isLoading } = useStore(params.storeId);

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="h-8 w-48 animate-pulse rounded bg-muted" />
        <div className="h-64 w-full animate-pulse rounded-lg border bg-muted" />
      </div>
    );
  }

  if (!store) {
    return (
      <div className="rounded-lg border p-8 text-center">
        <p className="text-sm text-muted-foreground">Store not found</p>
      </div>
    );
  }

  const effectiveCompanyId = companyId || store.company_id;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Edit Store</h1>
      <StoreForm companyId={effectiveCompanyId} store={store} />
    </div>
  );
}

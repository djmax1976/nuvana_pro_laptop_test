"use client";

import { useStore } from "@/lib/api/stores";
import { StoreConfigurationForm } from "@/components/stores/StoreConfigurationForm";
import { useSearchParams } from "next/navigation";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";

interface StoreConfigurationPageProps {
  params: {
    storeId: string;
  };
}

/**
 * Store configuration page
 * Allows Store Managers to configure their store settings (timezone, location, operating hours)
 * Route protection: Store Manager only for their store (enforced by API)
 */
export default function StoreConfigurationPage({
  params,
}: StoreConfigurationPageProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const companyId = searchParams?.get("companyId");
  const { data: store, isLoading, error } = useStore(params.storeId);

  const handleSuccess = () => {
    router.push(
      `/stores/${params.storeId}${companyId ? `?companyId=${companyId}` : ""}`,
    );
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="h-8 w-48 animate-pulse rounded bg-muted" />
        <div className="h-64 w-full animate-pulse rounded-lg border bg-muted" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-4">
        <Link
          href={`/stores/${params.storeId}${companyId ? `?companyId=${companyId}` : ""}`}
        >
          <Button variant="ghost">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Store
          </Button>
        </Link>
        <div className="rounded-lg border border-destructive bg-destructive/10 p-4">
          <p className="text-sm font-medium text-destructive">
            Error loading store
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            {error instanceof Error
              ? error.message
              : "An unknown error occurred"}
          </p>
        </div>
      </div>
    );
  }

  if (!store) {
    return (
      <div className="space-y-4">
        <Link href={companyId ? `/stores?companyId=${companyId}` : "/stores"}>
          <Button variant="ghost">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Stores
          </Button>
        </Link>
        <div className="rounded-lg border p-8 text-center">
          <p className="text-sm text-muted-foreground">Store not found</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Store Configuration</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Configure timezone, location, and operating hours for {store.name}
          </p>
        </div>
        <Link
          href={`/stores/${params.storeId}${companyId ? `?companyId=${companyId}` : ""}`}
        >
          <Button variant="ghost">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Store
          </Button>
        </Link>
      </div>
      <StoreConfigurationForm store={store} onSuccess={handleSuccess} />
    </div>
  );
}

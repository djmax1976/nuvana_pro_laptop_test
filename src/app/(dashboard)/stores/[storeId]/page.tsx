"use client";

import { useStore, useDeleteStore } from "@/lib/api/stores";
import { Button } from "@/components/ui/button";
import { useRouter, useSearchParams } from "next/navigation";
import { useToast } from "@/hooks/use-toast";
import { useState } from "react";
import { format } from "date-fns";
import { Pencil, Trash2, ArrowLeft, MapPin } from "lucide-react";
import Link from "next/link";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

interface StoreDetailPageProps {
  params: {
    storeId: string;
  };
}

/**
 * Store detail page
 * Displays store details and provides edit/delete actions
 */
export default function StoreDetailPage({ params }: StoreDetailPageProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const companyId = searchParams.get("companyId") || "";
  const { toast } = useToast();
  const [isDeleting, setIsDeleting] = useState(false);
  const deleteMutation = useDeleteStore();

  const { data: store, isLoading, error } = useStore(params.storeId);

  const handleDelete = async () => {
    if (!store) return;

    setIsDeleting(true);
    try {
      await deleteMutation.mutateAsync({
        storeId: store.store_id,
        companyId: store.company_id,
      });
      toast({
        title: "Success",
        description: "Store deleted successfully",
      });
      router.push(`/stores?companyId=${store.company_id}`);
    } catch (error) {
      toast({
        title: "Error",
        description:
          error instanceof Error
            ? error.message
            : "Failed to delete store. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsDeleting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="h-8 w-32 animate-pulse rounded bg-muted" />
        <div className="h-64 w-full animate-pulse rounded-lg border bg-muted" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-4">
        <Link href={companyId ? `/stores?companyId=${companyId}` : "/stores"}>
          <Button variant="ghost">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Stores
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

  const location = store.location_json;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <Link
          href={
            store.company_id
              ? `/stores?companyId=${store.company_id}`
              : "/stores"
          }
        >
          <Button variant="ghost">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Stores
          </Button>
        </Link>
        <div className="flex gap-2">
          <Link
            href={`/stores/${store.store_id}/edit?companyId=${store.company_id}`}
          >
            <Button>
              <Pencil className="mr-2 h-4 w-4" />
              Edit
            </Button>
          </Link>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="destructive" disabled={isDeleting}>
                <Trash2 className="mr-2 h-4 w-4" />
                Delete
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Are you sure?</AlertDialogTitle>
                <AlertDialogDescription>
                  This will permanently delete the store &ldquo;{store.name}
                  &rdquo;. This action cannot be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  onClick={handleDelete}
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                >
                  {isDeleting ? "Deleting..." : "Delete"}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>

      <div className="rounded-lg border p-6">
        <h1 className="mb-6 text-2xl font-bold">{store.name}</h1>

        <div className="space-y-4">
          <div>
            <label className="text-sm font-medium text-muted-foreground">
              Store ID
            </label>
            <p className="mt-1 font-mono text-sm">{store.store_id}</p>
          </div>

          <div>
            <label className="text-sm font-medium text-muted-foreground">
              Company ID
            </label>
            <p className="mt-1 font-mono text-sm">{store.company_id}</p>
          </div>

          <div>
            <label className="text-sm font-medium text-muted-foreground">
              Name
            </label>
            <p className="mt-1 text-sm">{store.name}</p>
          </div>

          {location && (
            <div>
              <label className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <MapPin className="h-4 w-4" />
                Location
              </label>
              <div className="mt-2 space-y-2">
                {location.address && (
                  <p className="text-sm">{location.address}</p>
                )}
                {location.gps && (
                  <p className="text-sm font-mono text-muted-foreground">
                    GPS: {location.gps.lat.toFixed(6)},{" "}
                    {location.gps.lng.toFixed(6)}
                  </p>
                )}
              </div>
            </div>
          )}

          <div>
            <label className="text-sm font-medium text-muted-foreground">
              Timezone
            </label>
            <p className="mt-1 text-sm">{store.timezone}</p>
          </div>

          <div>
            <label className="text-sm font-medium text-muted-foreground">
              Status
            </label>
            <p className="mt-1">
              <span
                className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
                  store.status === "ACTIVE"
                    ? "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300"
                    : store.status === "CLOSED"
                      ? "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300"
                      : "bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-300"
                }`}
              >
                {store.status}
              </span>
            </p>
          </div>

          <div>
            <label className="text-sm font-medium text-muted-foreground">
              Created At
            </label>
            <p className="mt-1 text-sm">
              {format(new Date(store.created_at), "PPpp")}
            </p>
          </div>

          <div>
            <label className="text-sm font-medium text-muted-foreground">
              Updated At
            </label>
            <p className="mt-1 text-sm">
              {format(new Date(store.updated_at), "PPpp")}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

"use client";

import { use } from "react";
import { useCompany, useDeleteCompany } from "@/lib/api/companies";
import { Button } from "@/components/ui/button";
import { useRouter } from "next/navigation";
import { useToast } from "@/hooks/use-toast";
import { useState } from "react";
import { format } from "date-fns";
import { Pencil, Trash2, ArrowLeft } from "lucide-react";
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

interface CompanyDetailPageProps {
  params: Promise<{
    companyId: string;
  }>;
}

/**
 * Company detail page
 * Displays company details and provides edit/delete actions
 */
export default function CompanyDetailPage({ params }: CompanyDetailPageProps) {
  const { companyId } = use(params);
  const router = useRouter();
  const { toast } = useToast();
  const [isDeleting, setIsDeleting] = useState(false);
  const deleteMutation = useDeleteCompany();

  const { data: company, isLoading, error } = useCompany(companyId);

  const handleDelete = async () => {
    if (!company) return;

    setIsDeleting(true);
    try {
      await deleteMutation.mutateAsync(company.company_id);
      toast({
        title: "Success",
        description: "Company deleted successfully",
      });
      router.push("/companies");
    } catch (error) {
      toast({
        title: "Error",
        description:
          error instanceof Error
            ? error.message
            : "Failed to delete company. Please try again.",
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
        <Link href="/companies">
          <Button variant="ghost">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Companies
          </Button>
        </Link>
        <div className="rounded-lg border border-destructive bg-destructive/10 p-4">
          <p className="text-sm font-medium text-destructive">
            Error loading company
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

  if (!company) {
    return (
      <div className="space-y-4">
        <Link href="/companies">
          <Button variant="ghost">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Companies
          </Button>
        </Link>
        <div className="rounded-lg border p-8 text-center">
          <p className="text-sm text-muted-foreground">Company not found</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <Link href="/companies">
          <Button variant="ghost">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Companies
          </Button>
        </Link>
        <div className="flex gap-2">
          <Link href={`/companies/${company.company_id}/edit`}>
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
                  This will permanently delete the company &ldquo;{company.name}
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
        <h1 className="mb-6 text-2xl font-bold">{company.name}</h1>

        <div className="space-y-4">
          <div>
            <label className="text-sm font-medium text-muted-foreground">
              Company ID
            </label>
            <p className="mt-1 font-mono text-sm">{company.company_id}</p>
          </div>

          <div>
            <label className="text-sm font-medium text-muted-foreground">
              Name
            </label>
            <p className="mt-1 text-sm">{company.name}</p>
          </div>

          <div>
            <label className="text-sm font-medium text-muted-foreground">
              Status
            </label>
            <p className="mt-1">
              <span
                className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
                  company.status === "ACTIVE"
                    ? "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300"
                    : company.status === "SUSPENDED"
                      ? "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300"
                      : "bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-300"
                }`}
              >
                {company.status}
              </span>
            </p>
          </div>

          <div>
            <label className="text-sm font-medium text-muted-foreground">
              Created At
            </label>
            <p className="mt-1 text-sm">
              {format(new Date(company.created_at), "PPpp")}
            </p>
          </div>

          <div>
            <label className="text-sm font-medium text-muted-foreground">
              Updated At
            </label>
            <p className="mt-1 text-sm">
              {format(new Date(company.updated_at), "PPpp")}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

"use client";

import { useState } from "react";
import { useClient } from "@/lib/api/clients";
import { ClientForm } from "@/components/clients/ClientForm";
import { CompanyListDialog } from "@/components/clients/CompanyListDialog";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { format } from "date-fns";

interface ClientDetailPageProps {
  params: {
    clientId: string;
  };
}

/**
 * Client detail/edit page
 * Displays client details and provides edit form
 */
export default function ClientDetailPage({ params }: ClientDetailPageProps) {
  const { clientId } = params;
  const { data, isLoading, error } = useClient(clientId);
  const [showCompanyDialog, setShowCompanyDialog] = useState(false);

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
        <Link href="/clients">
          <Button variant="ghost">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Clients
          </Button>
        </Link>
        <div className="rounded-lg border border-destructive bg-destructive/10 p-4">
          <p className="text-sm font-medium text-destructive">
            Error loading client
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

  const client = data?.data;

  if (!client) {
    return (
      <div className="space-y-4">
        <Link href="/clients">
          <Button variant="ghost">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Clients
          </Button>
        </Link>
        <div className="rounded-lg border p-8 text-center">
          <p className="text-sm text-muted-foreground">Client not found</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6" data-testid="client-detail-page-loaded">
      <div
        className="flex items-center justify-between"
        data-testid="breadcrumb-navigation"
      >
        <Link href="/clients">
          <Button variant="ghost">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Clients
          </Button>
        </Link>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {/* Client Details */}
        <div
          className="rounded-lg border p-6"
          data-testid="client-detail-header"
        >
          <h2 className="mb-4 text-lg font-semibold">Client Details</h2>

          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium text-muted-foreground">
                Companies
              </label>
              <button
                onClick={() => setShowCompanyDialog(true)}
                className="mt-1 text-sm text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300 hover:underline font-medium focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 rounded px-1"
                data-testid="client-companies-list"
              >
                {client.companyCount ?? client._count?.companies ?? 0}{" "}
                {(client.companyCount ?? client._count?.companies ?? 0) === 1
                  ? "company"
                  : "companies"}
              </button>
            </div>

            <div>
              <label className="text-sm font-medium text-muted-foreground">
                Created At
              </label>
              <p className="mt-1 text-sm">
                {format(new Date(client.created_at), "PPpp")}
              </p>
            </div>

            <div>
              <label className="text-sm font-medium text-muted-foreground">
                Updated At
              </label>
              <p className="mt-1 text-sm">
                {format(new Date(client.updated_at), "PPpp")}
              </p>
            </div>

            {client.metadata && Object.keys(client.metadata).length > 0 && (
              <div data-testid="client-metadata-display">
                <label className="text-sm font-medium text-muted-foreground">
                  Metadata
                </label>
                <pre className="mt-1 rounded bg-muted p-2 text-xs">
                  {JSON.stringify(client.metadata, null, 2)}
                </pre>
              </div>
            )}
          </div>
        </div>

        {/* Edit Form */}
        <div
          className="rounded-lg border p-6"
          data-testid="client-edit-section"
        >
          <h2 className="mb-4 text-lg font-semibold">Edit Client</h2>
          <ClientForm client={client} />
        </div>
      </div>

      {/* Company List Dialog */}
      <CompanyListDialog
        open={showCompanyDialog}
        onOpenChange={setShowCompanyDialog}
        companies={client.companies || []}
        clientName={client.name}
      />
    </div>
  );
}

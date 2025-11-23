"use client";

import { CompanyForm } from "@/components/companies/CompanyForm";
import { useCompany } from "@/lib/api/companies";

interface EditCompanyPageProps {
  params: {
    companyId: string;
  };
}

/**
 * Edit company page
 * Form for editing an existing company (System Admin only)
 */
export default function EditCompanyPage({ params }: EditCompanyPageProps) {
  const { data: company, isLoading } = useCompany(params.companyId);

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="h-8 w-48 animate-pulse rounded bg-muted" />
        <div className="h-64 w-full animate-pulse rounded-lg border bg-muted" />
      </div>
    );
  }

  if (!company) {
    return (
      <div className="rounded-lg border p-8 text-center">
        <p className="text-sm text-muted-foreground">Company not found</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Edit Company</h1>
      <CompanyForm company={company} />
    </div>
  );
}

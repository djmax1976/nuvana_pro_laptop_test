"use client";

import { useState } from "react";
import { StoreForm } from "@/components/stores/StoreForm";
import { useSearchParams } from "next/navigation";
import { CompanySearchCombobox } from "@/components/companies/CompanySearchCombobox";
import type { Company } from "@/lib/api/companies";

/**
 * Create store page
 * Form for creating a new store
 * - If companyId query param is provided, shows form directly (Corporate Admin flow)
 * - If no companyId, shows company selector first (System Admin flow)
 * - Uses searchable company selector with debounced search
 */
export default function NewStorePage() {
  const searchParams = useSearchParams();
  const companyIdFromQuery = searchParams?.get("companyId");
  const [selectedCompanyId, setSelectedCompanyId] = useState<string>(
    companyIdFromQuery || "",
  );
  const [selectedCompany, setSelectedCompany] = useState<Company | null>(null);

  // If companyId provided in query, show form directly
  if (companyIdFromQuery) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold">Create Store</h1>
        <StoreForm companyId={companyIdFromQuery} />
      </div>
    );
  }

  const handleCompanySelect = (companyId: string, company: Company | null) => {
    setSelectedCompanyId(companyId);
    setSelectedCompany(company);
  };

  // If no company selected yet, show company search selector
  if (!selectedCompanyId) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold">Create Store</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Search and select a company to create a store for
          </p>
        </div>

        <div className="max-w-md space-y-4 rounded-lg border p-6">
          <CompanySearchCombobox
            value={selectedCompanyId}
            onValueChange={handleCompanySelect}
            label="Company"
            placeholder="Search companies..."
          />
        </div>
      </div>
    );
  }

  // Company selected, show the store form
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Create Store</h1>
        <p className="text-sm text-muted-foreground">
          Creating store for:{" "}
          <span className="font-medium">{selectedCompany?.name}</span>
        </p>
      </div>
      <StoreForm companyId={selectedCompanyId} />
    </div>
  );
}

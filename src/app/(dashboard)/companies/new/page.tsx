"use client";

import { CompanyForm } from "@/components/companies/CompanyForm";

/**
 * Create company page
 * Form for creating a new company (System Admin only)
 */
export default function NewCompanyPage() {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Create Company</h1>
      <CompanyForm />
    </div>
  );
}

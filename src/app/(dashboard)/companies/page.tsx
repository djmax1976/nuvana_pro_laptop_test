"use client";

import { CompanyList } from "@/components/companies/CompanyList";

/**
 * Companies page
 * Displays list of companies (System Admin only)
 * Route protection should be handled by middleware
 */
export default function CompaniesPage() {
  return <CompanyList />;
}

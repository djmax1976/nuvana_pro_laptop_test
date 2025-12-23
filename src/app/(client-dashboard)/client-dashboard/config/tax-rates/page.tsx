"use client";

/**
 * Tax Rates List Page
 *
 * Phase 6.1: Shift & Day Summary Implementation Plan
 */

import { useRouter } from "next/navigation";
import { TaxRateList } from "@/components/config/TaxRateList";
import { TaxRate } from "@/lib/api/tax-rates";

export default function TaxRatesPage() {
  const router = useRouter();

  const handleEdit = (taxRate: TaxRate) => {
    router.push(`/client-dashboard/config/tax-rates/${taxRate.tax_rate_id}`);
  };

  return <TaxRateList onEdit={handleEdit} />;
}

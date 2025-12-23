"use client";

/**
 * Edit Tax Rate Page
 *
 * Phase 6.1: Shift & Day Summary Implementation Plan
 */

import { use } from "react";
import { TaxRateForm } from "@/components/config/TaxRateForm";

interface EditTaxRatePageProps {
  params: Promise<{ taxRateId: string }>;
}

export default function EditTaxRatePage({ params }: EditTaxRatePageProps) {
  const { taxRateId } = use(params);

  return <TaxRateForm mode="edit" taxRateId={taxRateId} />;
}

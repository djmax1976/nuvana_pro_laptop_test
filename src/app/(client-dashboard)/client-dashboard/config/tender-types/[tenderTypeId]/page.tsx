"use client";

/**
 * Edit Tender Type Page
 *
 * Phase 6.1: Shift & Day Summary Implementation Plan
 */

import { use } from "react";
import { TenderTypeForm } from "@/components/config/TenderTypeForm";

interface EditTenderTypePageProps {
  params: Promise<{ tenderTypeId: string }>;
}

export default function EditTenderTypePage({
  params,
}: EditTenderTypePageProps) {
  const { tenderTypeId } = use(params);

  return <TenderTypeForm mode="edit" tenderTypeId={tenderTypeId} />;
}

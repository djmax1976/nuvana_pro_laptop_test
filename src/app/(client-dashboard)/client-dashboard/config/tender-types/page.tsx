"use client";

/**
 * Tender Types List Page
 *
 * Phase 6.1: Shift & Day Summary Implementation Plan
 */

import { useRouter } from "next/navigation";
import { TenderTypeList } from "@/components/config/TenderTypeList";
import { TenderType } from "@/lib/api/tender-types";

export default function TenderTypesPage() {
  const router = useRouter();

  const handleEdit = (tenderType: TenderType) => {
    router.push(
      `/client-dashboard/config/tender-types/${tenderType.tender_type_id}`,
    );
  };

  return <TenderTypeList onEdit={handleEdit} />;
}

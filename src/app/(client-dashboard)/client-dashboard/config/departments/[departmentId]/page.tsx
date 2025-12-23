"use client";

/**
 * Edit Department Page
 *
 * Phase 6.2: Shift & Day Summary Implementation Plan
 */

import { use } from "react";
import { DepartmentForm } from "@/components/config/DepartmentForm";

interface EditDepartmentPageProps {
  params: Promise<{ departmentId: string }>;
}

export default function EditDepartmentPage({
  params,
}: EditDepartmentPageProps) {
  const { departmentId } = use(params);

  return <DepartmentForm mode="edit" departmentId={departmentId} />;
}

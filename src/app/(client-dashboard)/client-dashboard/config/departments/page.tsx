"use client";

/**
 * Departments List Page
 *
 * Phase 6.2: Shift & Day Summary Implementation Plan
 */

import { useRouter } from "next/navigation";
import { DepartmentList } from "@/components/config/DepartmentList";
import { Department } from "@/lib/api/departments";

export default function DepartmentsPage() {
  const router = useRouter();

  const handleEdit = (department: Department) => {
    router.push(
      `/client-dashboard/config/departments/${department.department_id}`,
    );
  };

  return <DepartmentList onEdit={handleEdit} />;
}

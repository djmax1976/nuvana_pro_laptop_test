"use client";

/**
 * Client Employees Page
 * Page for managing employees in client's stores
 *
 * Story: 2.91 - Client Employee Management
 *
 * Security Considerations (FE-001: STATE_MANAGEMENT):
 * - Page title uses centralized context for consistent header display
 * - No sensitive data stored in component state
 */

import { useState } from "react";
import { EmployeeList } from "@/components/employees/EmployeeList";
import { EmployeeForm } from "@/components/employees/EmployeeForm";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { usePageTitleEffect } from "@/contexts/PageTitleContext";

export default function EmployeesPage() {
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);

  // Set page title in header (FE-001: STATE_MANAGEMENT)
  usePageTitleEffect("Employees");

  return (
    <div className="space-y-6">
      {/* Employee List */}
      <EmployeeList onCreateEmployee={() => setIsCreateDialogOpen(true)} />

      {/* Create Employee Dialog */}
      <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Add New Employee</DialogTitle>
            <DialogDescription>
              Create a new employee account for one of your stores. They will be
              able to access the store systems based on their assigned role.
            </DialogDescription>
          </DialogHeader>
          <EmployeeForm
            onSuccess={() => setIsCreateDialogOpen(false)}
            onCancel={() => setIsCreateDialogOpen(false)}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}

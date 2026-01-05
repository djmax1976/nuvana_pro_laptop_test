"use client";

/**
 * Client Cashiers Page
 * Page for managing cashiers in client's stores
 *
 * Story: 4.9 - Cashier Management
 *
 * Security Considerations (FE-001: STATE_MANAGEMENT):
 * - Page title uses centralized context for consistent header display
 * - No sensitive data stored in component state
 */

import { useState } from "react";
import { CashierList } from "@/components/cashiers/CashierList";
import { CashierForm } from "@/components/cashiers/CashierForm";
import { type Cashier } from "@/lib/api/cashiers";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { usePageTitleEffect } from "@/contexts/PageTitleContext";

export default function CashiersPage() {
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [editingCashier, setEditingCashier] = useState<Cashier | null>(null);

  // Set page title in header (FE-001: STATE_MANAGEMENT)
  usePageTitleEffect("Cashiers");

  const handleEditCashier = (cashier: Cashier) => {
    setEditingCashier(cashier);
  };

  const handleCloseEditDialog = () => {
    setEditingCashier(null);
  };

  return (
    <div className="space-y-6">
      {/* Cashier List */}
      <CashierList
        onCreateCashier={() => setIsCreateDialogOpen(true)}
        onEditCashier={handleEditCashier}
      />

      {/* Create Cashier Dialog */}
      <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Add New Cashier</DialogTitle>
            <DialogDescription>
              Create a new cashier for terminal access. They will use their name
              and PIN to authenticate at POS terminals.
            </DialogDescription>
          </DialogHeader>
          <CashierForm
            onSuccess={() => setIsCreateDialogOpen(false)}
            onCancel={() => setIsCreateDialogOpen(false)}
          />
        </DialogContent>
      </Dialog>

      {/* Edit Cashier Dialog */}
      <Dialog
        open={!!editingCashier}
        onOpenChange={(open) => !open && handleCloseEditDialog()}
      >
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Edit Cashier</DialogTitle>
            <DialogDescription>
              Update cashier information. Leave PIN blank to keep the current
              PIN.
            </DialogDescription>
          </DialogHeader>
          {editingCashier && (
            <CashierForm
              cashier={editingCashier}
              onSuccess={handleCloseEditDialog}
              onCancel={handleCloseEditDialog}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

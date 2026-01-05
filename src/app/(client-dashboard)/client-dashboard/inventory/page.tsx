"use client";

/**
 * Client Dashboard Inventory Page
 * Displays inventory management for the store
 *
 * Status: Coming Soon
 *
 * Security Considerations (FE-001: STATE_MANAGEMENT):
 * - Page title uses centralized context for consistent header display
 */

import { usePageTitleEffect } from "@/contexts/PageTitleContext";

export default function InventoryPage() {
  // Set page title in header (FE-001: STATE_MANAGEMENT)
  usePageTitleEffect("Inventory");

  return (
    <div className="space-y-6" data-testid="client-inventory-page">
      {/* Content Area - Coming Soon */}
      <div className="rounded-lg border border-dashed p-8 text-center">
        <p className="text-muted-foreground">Coming Soon</p>
      </div>
    </div>
  );
}

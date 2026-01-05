"use client";

/**
 * Client Dashboard AI Assistant Page
 * AI-powered assistant for store operations
 *
 * Status: Coming Soon
 *
 * Security Considerations (FE-001: STATE_MANAGEMENT):
 * - Page title uses centralized context for consistent header display
 */

import { usePageTitleEffect } from "@/contexts/PageTitleContext";

export default function AIAssistantPage() {
  // Set page title in header (FE-001: STATE_MANAGEMENT)
  usePageTitleEffect("AI Assistant");

  return (
    <div className="space-y-6" data-testid="client-ai-assistant-page">
      {/* Content Area - Coming Soon */}
      <div className="rounded-lg border border-dashed p-8 text-center">
        <p className="text-muted-foreground">Coming Soon</p>
      </div>
    </div>
  );
}

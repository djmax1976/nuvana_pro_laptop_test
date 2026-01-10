"use client";

/**
 * POS Integration Page
 *
 * Displays the POS Integration setup wizard or configured status view
 * based on whether the store has an existing POS integration.
 *
 * Security Standards Applied:
 * - SEC-010: AUTHZ - Authorization enforced via POSAuthModal re-authentication
 *   The modal requires users to re-authenticate and verifies POS_SYNC_TRIGGER
 *   permission before allowing navigation to this page. This provides:
 *   1. Fresh credential verification (prevents session hijacking)
 *   2. Permission validation at point of access
 *   3. Audit trail via login endpoint
 * - API-005: RBAC - Backend APIs independently enforce authorization on all operations
 * - FE-001: STATE_MANAGEMENT - Uses React Query for state management
 * - API-003: ERROR_HANDLING - Proper error states without sensitive data leakage
 *
 * Store Context Preservation:
 * - Store ID is passed via URL query parameter (?storeId=xxx) from POSAuthModal
 * - This preserves store context even when re-authenticating as a different user
 * - Backend validates store access independently on all API operations
 *
 * Reference: nuvana_docs/plans/POS-Onboarding-Plan-with-UI.md Phase 4
 *
 * @module app/(mystore)/mystore/pos-integration/page
 */

import { usePOSIntegration, isApiError } from "@/lib/api/pos-integration";
import {
  POSSetupWizard,
  ConfiguredStatusView,
} from "@/components/pos-integration";
import { Loader2, ShieldAlert, AlertCircle } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "next/navigation";
import { useCallback } from "react";
import { Button } from "@/components/ui/button";
import Link from "next/link";

/**
 * POS Integration Page Component
 *
 * Flow:
 * 1. User clicks POS Integration in sidebar → POSAuthModal opens
 * 2. User re-authenticates with email/password
 * 3. Modal verifies POS_SYNC_TRIGGER permission from login response
 * 4. On success, user navigates to this page with storeId in URL
 * 5. Page uses storeId from URL to fetch POS integration data
 *
 * Security: Access to this page is protected by POSAuthModal re-authentication.
 * Backend APIs independently enforce authorization on all operations.
 *
 * @returns POS Integration page with wizard or configured view
 */
export default function POSIntegrationPage(): JSX.Element {
  const queryClient = useQueryClient();
  const searchParams = useSearchParams();

  // Get store ID from URL query parameter (passed by POSAuthModal)
  // This preserves store context after re-authentication
  const storeId = searchParams.get("storeId");

  // Check if store has POS integration
  const {
    data: integration,
    isLoading: integrationLoading,
    isError: integrationError,
  } = usePOSIntegration(storeId || "", {
    enabled: !!storeId,
  });

  /**
   * Handle setup wizard completion
   * Invalidates query cache to refresh integration data instead of page reload
   *
   * FE-001: STATE_MANAGEMENT - Proper React Query state management
   */
  const handleSetupComplete = useCallback(() => {
    // Invalidate integration query to refetch data
    if (storeId) {
      queryClient.invalidateQueries({
        queryKey: ["pos-integration", storeId],
      });
    }
  }, [queryClient, storeId]);

  // Loading state - show while fetching POS integration data
  // SEC-010: AUTHZ - Permission already verified by POSAuthModal before navigation
  if (integrationLoading) {
    return (
      <div className="flex h-[50vh] items-center justify-center">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary mx-auto mb-4" />
          <p className="text-muted-foreground">Loading POS Integration...</p>
        </div>
      </div>
    );
  }

  // No store ID in URL - user may have navigated directly without going through the modal
  if (!storeId) {
    return (
      <div className="flex h-[50vh] items-center justify-center">
        <div className="text-center">
          <AlertCircle className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
          <h2 className="text-lg font-semibold mb-2">No Store Selected</h2>
          <p className="text-muted-foreground mb-4">
            Please access POS Integration from the sidebar menu.
          </p>
          <Link href="/mystore">
            <Button variant="outline">Return to Dashboard</Button>
          </Link>
        </div>
      </div>
    );
  }

  // SEC-010: AUTHZ - Handle authorization errors separately
  // A 403 error means the user doesn't have permission - show access denied
  // Don't show the setup wizard for permission errors
  if (integrationError) {
    const error = integrationError as unknown;
    const is403 = isApiError(error) && error.status === 403;
    const is401 = isApiError(error) && error.status === 401;

    if (is403 || is401) {
      return (
        <div className="flex h-[50vh] items-center justify-center">
          <div className="text-center">
            <ShieldAlert className="h-12 w-12 text-destructive mx-auto mb-4" />
            <h2 className="text-lg font-semibold mb-2">Access Denied</h2>
            <p className="text-muted-foreground mb-4">
              You don&apos;t have permission to access POS Integration. Please
              authenticate through the sidebar menu with an authorized account.
            </p>
            <Link href="/mystore">
              <Button variant="outline">Return to Dashboard</Button>
            </Link>
          </div>
        </div>
      );
    }

    // For other errors (network, server errors), show generic error
    return (
      <div className="flex h-[50vh] items-center justify-center">
        <div className="text-center">
          <AlertCircle className="h-12 w-12 text-destructive mx-auto mb-4" />
          <h2 className="text-lg font-semibold mb-2">
            Error Loading POS Integration
          </h2>
          <p className="text-muted-foreground mb-4">
            An error occurred while loading POS integration settings. Please try
            again later.
          </p>
          <Link href="/mystore">
            <Button variant="outline">Return to Dashboard</Button>
          </Link>
        </div>
      </div>
    );
  }

  // Show setup wizard if no integration exists (integration is null from successful query)
  // Note: 404 errors are handled by the API to return null, not throw an error
  if (!integration) {
    return (
      <div className="container max-w-4xl mx-auto py-8">
        <POSSetupWizard storeId={storeId} onComplete={handleSetupComplete} />
      </div>
    );
  }

  // Show ConfiguredStatusView when integration exists
  return (
    <div className="container max-w-4xl mx-auto py-8">
      <ConfiguredStatusView storeId={storeId} integration={integration} />
    </div>
  );
}

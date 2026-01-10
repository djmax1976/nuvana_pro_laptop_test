/**
 * Setup Success State Component
 *
 * Displayed after successful POS integration configuration.
 * Shows success message with first sync progress indicator.
 *
 * Reference: nuvana_docs/templates/onboarding-ui/index.html lines 337-367
 *
 * @module components/pos-integration/SetupSuccessState
 */

import { Check, RefreshCw, Loader2, Settings } from "lucide-react";
import { Button } from "@/components/ui/button";

// ============================================================================
// Types
// ============================================================================

interface SetupSuccessStateProps {
  /** Callback to view settings / go to configured view */
  onViewSettings: () => void;
  /** Whether sync is in progress */
  isSyncing?: boolean;
}

// ============================================================================
// Component
// ============================================================================

/**
 * Success state displayed after configuration is saved.
 *
 * Shows:
 * - Green checkmark in circle
 * - "POS Integration Complete!" heading
 * - Status card showing first sync progress
 * - "View Settings" button
 *
 * @example
 * ```tsx
 * <SetupSuccessState onViewSettings={() => setShowConfiguredView(true)} />
 * ```
 */
export function SetupSuccessState({
  onViewSettings,
  isSyncing = true,
}: SetupSuccessStateProps): JSX.Element {
  return (
    <div
      className="bg-white rounded-lg shadow-sm border p-6 text-center animate-in fade-in duration-300"
      data-testid="setup-success-state"
    >
      {/* Success Icon */}
      <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
        <Check className="h-8 w-8 text-green-600" aria-hidden="true" />
      </div>

      {/* Heading */}
      <h2 className="text-xl font-semibold text-gray-800 mb-2">
        POS Integration Complete!
      </h2>
      <p className="text-gray-500 mb-6">
        Your POS system is now connected and syncing data.
      </p>

      {/* Status Card */}
      <div className="bg-gray-50 rounded-lg p-4 text-left mb-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-green-100 rounded-full flex items-center justify-center">
              <RefreshCw
                className={`h-5 w-5 text-green-600 ${isSyncing ? "animate-spin" : ""}`}
                aria-hidden="true"
              />
            </div>
            <div>
              <p className="font-medium text-gray-800">
                {isSyncing
                  ? "First sync in progress..."
                  : "Initial sync complete"}
              </p>
              <p className="text-sm text-gray-500">
                {isSyncing
                  ? "This may take a few moments"
                  : "Data is now synchronized"}
              </p>
            </div>
          </div>
          {isSyncing && (
            <Loader2
              className="h-5 w-5 text-blue-600 animate-spin"
              aria-hidden="true"
            />
          )}
        </div>
      </div>

      {/* View Settings Button */}
      <Button
        variant="outline"
        onClick={onViewSettings}
        className="px-6"
        data-testid="view-settings-button"
      >
        <Settings className="mr-2 h-4 w-4" />
        View Settings
      </Button>
    </div>
  );
}

export default SetupSuccessState;

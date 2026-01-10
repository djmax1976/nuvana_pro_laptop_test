/**
 * Manual Connection Info Component
 *
 * Displays informational message for manual entry POS type.
 * No connection configuration needed - data is entered manually.
 *
 * Reference: nuvana_docs/templates/onboarding-ui/index.html lines 154-161
 *
 * @module components/pos-integration/forms/ManualConnectionInfo
 */

import { Info } from "lucide-react";

// ============================================================================
// Component
// ============================================================================

/**
 * Information display for manual entry mode.
 *
 * Shows a message indicating that no connection configuration is needed.
 * Users will enter all data manually in Nuvana.
 *
 * @example
 * ```tsx
 * {connectionCategory === 'manual' && <ManualConnectionInfo />}
 * ```
 */
export function ManualConnectionInfo(): JSX.Element {
  return (
    <div
      className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-center animate-in fade-in duration-300"
      data-testid="manual-connection-info"
    >
      <Info className="h-8 w-8 text-blue-500 mx-auto mb-2" aria-hidden="true" />
      <p className="text-sm text-blue-700 font-medium">
        No connection needed for manual entry mode.
      </p>
      <p className="text-xs text-blue-600 mt-1">
        You&apos;ll enter all data manually in Nuvana.
      </p>
    </div>
  );
}

export default ManualConnectionInfo;

/**
 * Test Connection Button Component
 *
 * Reusable button for testing POS connections with multiple states.
 * Shows loading, success, and failure states with appropriate messaging.
 *
 * Reference: nuvana_docs/templates/onboarding-ui/index.html lines 164-168
 * Reference: nuvana_docs/templates/onboarding-ui/states.html lines 43-170
 *
 * @module components/pos-integration/TestConnectionButton
 */

import { Loader2, Plug, Check, X, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { POSConnectionTestResult } from "@/types/pos-integration";

// ============================================================================
// Types
// ============================================================================

type TestState = "idle" | "testing" | "success" | "failed";

interface TestConnectionButtonProps {
  /** Callback to trigger connection test */
  onTest: () => void;
  /** Whether test is currently in progress */
  isLoading: boolean;
  /** Result from last connection test */
  result: POSConnectionTestResult | null;
  /** Whether the button should be disabled */
  disabled?: boolean;
  /** Optional class name */
  className?: string;
}

// ============================================================================
// Troubleshooting Tips
// ============================================================================

const TROUBLESHOOTING_TIPS = [
  "Verify the POS system is powered on and running",
  "Check the IP address and port are correct",
  "Ensure firewall allows connections on the specified port",
  "Try increasing the connection timeout value",
];

// ============================================================================
// Component
// ============================================================================

/**
 * Test Connection button with comprehensive state display.
 *
 * States:
 * - Idle: Dashed border, "Test Connection" text with plug icon
 * - Testing: Disabled, spinner, "Testing..." text
 * - Success: Green background, checkmark, shows version/latency/status
 * - Failed: Red background, X icon, shows error details and troubleshooting tips
 *
 * @example
 * ```tsx
 * <TestConnectionButton
 *   onTest={handleTestConnection}
 *   isLoading={testMutation.isPending}
 *   result={connectionTestResult}
 * />
 * ```
 */
export function TestConnectionButton({
  onTest,
  isLoading,
  result,
  disabled = false,
  className,
}: TestConnectionButtonProps): JSX.Element {
  // Determine current state
  const getState = (): TestState => {
    if (isLoading) return "testing";
    if (!result) return "idle";
    return result.success && result.data.connected ? "success" : "failed";
  };

  const state = getState();

  return (
    <div
      className={cn("space-y-4", className)}
      data-testid="test-connection-container"
    >
      {/* Test Button */}
      <Button
        type="button"
        variant="outline"
        onClick={onTest}
        disabled={disabled || isLoading}
        className={cn(
          "w-full py-3 border-2 border-dashed transition-colors",
          state === "idle" &&
            "border-gray-300 text-gray-600 hover:border-blue-400 hover:text-blue-600 hover:bg-blue-50",
          state === "testing" &&
            "border-gray-300 text-gray-400 cursor-not-allowed",
          state === "success" &&
            "border-gray-300 text-gray-600 hover:border-blue-400",
          state === "failed" &&
            "border-gray-300 text-gray-600 hover:border-blue-400",
        )}
        data-testid="test-connection-button"
      >
        {state === "testing" ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Testing...
          </>
        ) : state === "success" || state === "failed" ? (
          <>
            <RefreshCw className="mr-2 h-4 w-4" />
            Test Again
          </>
        ) : (
          <>
            <Plug className="mr-2 h-4 w-4" />
            Test Connection
          </>
        )}
      </Button>

      {/* Testing State */}
      {state === "testing" && (
        <div
          className="bg-blue-50 border border-blue-200 rounded-lg p-4 animate-in fade-in duration-300"
          data-testid="test-loading-state"
        >
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center flex-shrink-0">
              <Loader2 className="h-4 w-4 text-blue-600 animate-spin" />
            </div>
            <div>
              <p className="font-medium text-blue-800">Connecting...</p>
              <p className="text-sm text-blue-600">
                This may take a few seconds
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Success State */}
      {state === "success" && result && (
        <div
          className="bg-green-50 border border-green-200 rounded-lg p-4 animate-in fade-in duration-300"
          data-testid="test-success-state"
        >
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 bg-green-100 rounded-full flex items-center justify-center flex-shrink-0">
              <Check className="h-4 w-4 text-green-600" />
            </div>
            <div className="flex-1">
              <p className="font-medium text-green-800">
                Connection Successful
              </p>
              <div className="mt-2 grid grid-cols-3 gap-4 text-sm">
                {result.data.posVersion && (
                  <div>
                    <p className="text-green-600">POS Version</p>
                    <p className="font-medium text-green-800">
                      {result.data.posVersion}
                    </p>
                  </div>
                )}
                {result.data.latencyMs !== undefined && (
                  <div>
                    <p className="text-green-600">Latency</p>
                    <p className="font-medium text-green-800">
                      {result.data.latencyMs}ms
                    </p>
                  </div>
                )}
                <div>
                  <p className="text-green-600">Status</p>
                  <p className="font-medium text-green-800">Ready</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Failed State */}
      {state === "failed" && result && (
        <div
          className="bg-red-50 border border-red-200 rounded-lg p-4 animate-in fade-in duration-300"
          data-testid="test-failed-state"
        >
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 bg-red-100 rounded-full flex items-center justify-center flex-shrink-0">
              <X className="h-4 w-4 text-red-600" />
            </div>
            <div className="flex-1">
              <p className="font-medium text-red-800">Connection Failed</p>
              <p className="text-sm text-red-600 mt-1">
                <strong>Error:</strong> {result.data.message || "Unknown error"}
              </p>
              {result.data.errorCode && (
                <p className="text-sm text-red-600 mt-1">
                  <strong>Code:</strong> {result.data.errorCode}
                </p>
              )}

              {/* Troubleshooting Tips */}
              <div className="mt-3 text-sm text-red-700 bg-red-100 rounded p-3">
                <p className="font-medium mb-1">Troubleshooting:</p>
                <ul className="list-disc list-inside space-y-1 text-red-600">
                  {TROUBLESHOOTING_TIPS.map((tip, index) => (
                    <li key={index}>{tip}</li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default TestConnectionButton;

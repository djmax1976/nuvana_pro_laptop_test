/**
 * Cloud Connection Form Component
 *
 * Form for cloud-based POS connections (Square, Clover, Toast, Lightspeed).
 * Displays API key field with visibility toggle.
 *
 * Reference: nuvana_docs/templates/onboarding-ui/index.html lines 140-152
 *
 * Security: SEC-014 (input validation), FE-002 (form validation)
 * Security Note: API keys are transmitted to server and encrypted with AES-256-GCM
 *
 * @module components/pos-integration/forms/CloudConnectionForm
 */

import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import type {
  CloudConnectionConfig,
  POSSystemType,
} from "@/types/pos-integration";
import { getCloudProvider } from "@/lib/pos-integration/pos-types";

// ============================================================================
// Types
// ============================================================================

interface CloudConnectionFormProps {
  /** Current cloud configuration */
  config: CloudConnectionConfig;
  /** Selected POS type for provider name */
  posType: POSSystemType;
  /** Callback when config changes */
  onChange: (config: Partial<CloudConnectionConfig>) => void;
  /** Whether form is disabled */
  disabled?: boolean;
}

// ============================================================================
// Component
// ============================================================================

/**
 * Form for configuring cloud-based POS connections.
 *
 * Fields:
 * - API Key / Access Token: Cloud provider API credentials
 * - Eye icon toggles visibility
 *
 * Provider name is dynamically shown based on selected POS type.
 *
 * @example
 * ```tsx
 * <CloudConnectionForm
 *   config={state.cloudConfig}
 *   posType="SQUARE_REST"
 *   onChange={updateCloudConfig}
 * />
 * ```
 */
export function CloudConnectionForm({
  config,
  posType,
  onChange,
  disabled = false,
}: CloudConnectionFormProps): JSX.Element {
  const [showApiKey, setShowApiKey] = useState(false);
  const providerName = getCloudProvider(posType) || "POS";

  return (
    <div className="space-y-4 animate-in fade-in duration-300">
      {/* API Key Field */}
      <div>
        <Label htmlFor="api-key" className="text-sm font-medium text-gray-700">
          API Key / Access Token
        </Label>
        <div className="relative mt-1">
          <Input
            id="api-key"
            type={showApiKey ? "text" : "password"}
            value={config.apiKey}
            onChange={(e) => onChange({ apiKey: e.target.value })}
            placeholder="Enter your API key"
            disabled={disabled}
            className="pr-10"
            data-testid="cloud-api-key"
            autoComplete="off"
          />
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="absolute right-0 top-0 h-full px-3 text-gray-400 hover:text-gray-600"
            onClick={() => setShowApiKey(!showApiKey)}
            disabled={disabled}
            aria-label={showApiKey ? "Hide API key" : "Show API key"}
            data-testid="toggle-api-key-visibility"
          >
            {showApiKey ? (
              <EyeOff className="h-4 w-4" />
            ) : (
              <Eye className="h-4 w-4" />
            )}
          </Button>
        </div>
        <p className="text-xs text-gray-400 mt-1">
          Find this in your {providerName} dashboard settings
        </p>
      </div>
    </div>
  );
}

export default CloudConnectionForm;

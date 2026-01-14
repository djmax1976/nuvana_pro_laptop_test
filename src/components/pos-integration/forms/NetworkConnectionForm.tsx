/**
 * Network Connection Form Component
 *
 * Form for network-based POS connections (Sapphire, Passport, NCR, Oracle, Generic).
 * Displays host, port, and SSL toggle fields.
 *
 * Reference: nuvana_docs/templates/onboarding-ui/index.html lines 122-138
 *
 * Security: SEC-014 (input validation), FE-002 (form validation)
 *
 * @module components/pos-integration/forms/NetworkConnectionForm
 */

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import type {
  NetworkConnectionConfig,
  POSSystemType,
} from "@/types/pos-integration";
import { getDefaultPort } from "@/lib/pos-integration/pos-types";

// ============================================================================
// Types
// ============================================================================

interface NetworkConnectionFormProps {
  /** Current network configuration */
  config: NetworkConnectionConfig;
  /** Selected POS type for default port */
  posType: POSSystemType;
  /** Callback when config changes */
  onChange: (config: Partial<NetworkConnectionConfig>) => void;
  /** Whether form is disabled */
  disabled?: boolean;
}

// ============================================================================
// Component
// ============================================================================

/**
 * Form for configuring network-based POS connections.
 *
 * Fields:
 * - Host / IP Address: Network address of POS system
 * - Port: Network port (defaults based on POS type)
 * - Use SSL/TLS: Whether to use encrypted connection
 *
 * @example
 * ```tsx
 * <NetworkConnectionForm
 *   config={state.networkConfig}
 *   posType="GILBARCO_PASSPORT"
 *   onChange={updateNetworkConfig}
 * />
 * ```
 */
export function NetworkConnectionForm({
  config,
  posType,
  onChange,
  disabled = false,
}: NetworkConnectionFormProps): JSX.Element {
  const defaultPort = getDefaultPort(posType) || 8080;

  const handlePortChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    // SEC-014: Validate port is a number within valid range
    const port = parseInt(value, 10);
    if (!isNaN(port) && port >= 0 && port <= 65535) {
      onChange({ port });
    } else if (value === "") {
      onChange({ port: defaultPort });
    }
  };

  return (
    <div className="space-y-4 animate-in fade-in duration-300">
      {/* Host and Port Grid */}
      <div className="grid grid-cols-3 gap-4">
        {/* Host */}
        <div className="col-span-2">
          <Label
            htmlFor="network-host"
            className="text-sm font-medium text-gray-700"
          >
            Host / IP Address
          </Label>
          <Input
            id="network-host"
            type="text"
            value={config.host}
            onChange={(e) => onChange({ host: e.target.value })}
            placeholder="192.168.1.100"
            disabled={disabled}
            className="mt-1"
            data-testid="network-host"
            autoComplete="off"
          />
        </div>

        {/* Port */}
        <div>
          <Label
            htmlFor="network-port"
            className="text-sm font-medium text-gray-700"
          >
            Port
          </Label>
          <Input
            id="network-port"
            type="number"
            value={config.port}
            onChange={handlePortChange}
            min={1}
            max={65535}
            disabled={disabled}
            className="mt-1"
            data-testid="network-port"
            autoComplete="off"
          />
        </div>
      </div>

      {/* SSL Toggle */}
      <div className="flex items-center gap-3">
        <Checkbox
          id="use-ssl"
          checked={config.useSsl}
          onCheckedChange={(checked) => onChange({ useSsl: checked === true })}
          disabled={disabled}
          data-testid="network-ssl"
        />
        <Label
          htmlFor="use-ssl"
          className="text-sm text-gray-700 cursor-pointer"
        >
          Use SSL/TLS encryption
        </Label>
      </div>
    </div>
  );
}

export default NetworkConnectionForm;

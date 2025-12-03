/**
 * Connection Config Form Component
 * Story 4.82: Terminal Connection Configuration UI
 *
 * Dynamic form component that renders connection configuration fields
 * based on the selected connection type.
 */

"use client";

import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { TerminalWithStatus } from "@/lib/api/stores";
import type {
  NetworkConnectionConfig,
  ApiConnectionConfig,
  WebhookConnectionConfig,
  FileConnectionConfig,
} from "@/types/terminal";

export interface ConnectionConfigFormProps {
  connectionType: TerminalWithStatus["connection_type"];
  connectionConfig: TerminalWithStatus["connection_config"];
  onConfigChange: (config: Record<string, unknown> | null) => void;
  storeId?: string;
  terminalId?: string;
}

/**
 * ConnectionConfigForm - Renders dynamic fields based on connection type
 */
export function ConnectionConfigForm({
  connectionType,
  connectionConfig,
  onConfigChange,
  storeId,
  terminalId,
}: ConnectionConfigFormProps) {
  // Handle MANUAL type - no config needed
  if (!connectionType || connectionType === "MANUAL") {
    return null;
  }

  // Allowed config keys for safe access (prevents prototype pollution)
  const ALLOWED_CONFIG_KEYS = [
    "host",
    "port",
    "protocol",
    "baseUrl",
    "apiKey",
    "webhookUrl",
    "secret",
    "importPath",
  ] as const;
  type ConfigKey = (typeof ALLOWED_CONFIG_KEYS)[number];

  // Parse existing config or initialize empty config
  const getConfigValue = (key: ConfigKey): string => {
    if (!connectionConfig || typeof connectionConfig !== "object") {
      return "";
    }
    if (!ALLOWED_CONFIG_KEYS.includes(key)) {
      return "";
    }
    // eslint-disable-next-line security/detect-object-injection
    const value = (connectionConfig as Record<ConfigKey, unknown>)[key];
    return typeof value === "string" || typeof value === "number"
      ? String(value)
      : "";
  };

  const updateConfig = (key: ConfigKey, value: string | number) => {
    if (!ALLOWED_CONFIG_KEYS.includes(key)) {
      return;
    }
    const currentConfig =
      connectionConfig && typeof connectionConfig === "object"
        ? { ...(connectionConfig as Record<string, unknown>) }
        : {};
    const newConfig = { ...currentConfig, [key]: value };
    onConfigChange(newConfig);
  };

  // NETWORK connection config
  if (connectionType === "NETWORK") {
    const config = connectionConfig as NetworkConnectionConfig | null;
    return (
      <div className="space-y-4">
        <div>
          <label htmlFor="network-host" className="text-sm font-medium">
            Host
          </label>
          <Input
            id="network-host"
            type="text"
            value={getConfigValue("host")}
            onChange={(e) => updateConfig("host", e.target.value)}
            placeholder="e.g., 192.168.1.100"
            className="mt-1"
          />
        </div>
        <div>
          <label htmlFor="network-port" className="text-sm font-medium">
            Port
          </label>
          <Input
            id="network-port"
            type="number"
            value={getConfigValue("port")}
            onChange={(e) =>
              updateConfig(
                "port",
                e.target.value ? parseInt(e.target.value, 10) : "",
              )
            }
            placeholder="e.g., 8080"
            className="mt-1"
          />
        </div>
        <div>
          <label htmlFor="network-protocol" className="text-sm font-medium">
            Protocol
          </label>
          <Select
            value={getConfigValue("protocol") || "TCP"}
            onValueChange={(value) => updateConfig("protocol", value)}
          >
            <SelectTrigger className="mt-1" id="network-protocol">
              <SelectValue placeholder="Select protocol" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="TCP">TCP</SelectItem>
              <SelectItem value="HTTP">HTTP</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
    );
  }

  // API connection config
  if (connectionType === "API") {
    return (
      <div className="space-y-4">
        <div>
          <label htmlFor="api-base-url" className="text-sm font-medium">
            Base URL
          </label>
          <Input
            id="api-base-url"
            type="url"
            value={getConfigValue("baseUrl")}
            onChange={(e) => updateConfig("baseUrl", e.target.value)}
            placeholder="e.g., https://api.example.com"
            className="mt-1"
          />
        </div>
        <div>
          <label htmlFor="api-key" className="text-sm font-medium">
            API Key
          </label>
          <Input
            id="api-key"
            type="password"
            value={getConfigValue("apiKey")}
            onChange={(e) => updateConfig("apiKey", e.target.value)}
            placeholder="Enter API key"
            className="mt-1"
          />
        </div>
      </div>
    );
  }

  // WEBHOOK connection config
  if (connectionType === "WEBHOOK") {
    // Auto-generate webhook URL if storeId and terminalId are provided
    const webhookUrl =
      storeId && terminalId
        ? `${window.location.origin}/api/webhooks/stores/${storeId}/terminals/${terminalId}`
        : getConfigValue("webhookUrl") ||
          "Webhook URL will be generated after saving";

    return (
      <div className="space-y-4">
        <div>
          <label htmlFor="webhook-url" className="text-sm font-medium">
            Webhook URL
          </label>
          <Input
            id="webhook-url"
            type="url"
            value={webhookUrl}
            readOnly
            className="mt-1 bg-muted"
            placeholder="Auto-generated after saving"
          />
          <p className="text-xs text-muted-foreground mt-1">
            This URL will be generated automatically after the terminal is saved
          </p>
        </div>
        <div>
          <label htmlFor="webhook-secret" className="text-sm font-medium">
            Secret
          </label>
          <Input
            id="webhook-secret"
            type="password"
            value={getConfigValue("secret")}
            onChange={(e) => updateConfig("secret", e.target.value)}
            placeholder="Enter webhook secret"
            className="mt-1"
          />
        </div>
      </div>
    );
  }

  // FILE connection config
  if (connectionType === "FILE") {
    return (
      <div className="space-y-4">
        <div>
          <label htmlFor="file-import-path" className="text-sm font-medium">
            Import Path
          </label>
          <Input
            id="file-import-path"
            type="text"
            value={getConfigValue("importPath")}
            onChange={(e) => updateConfig("importPath", e.target.value)}
            placeholder="e.g., /path/to/import/files"
            className="mt-1"
          />
        </div>
      </div>
    );
  }

  return null;
}

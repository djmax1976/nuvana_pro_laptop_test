/**
 * Connection Config Form Component
 * Story 4.82: Terminal Connection Configuration UI
 *
 * Dynamic form component that renders connection configuration fields
 * based on the selected connection type.
 */

"use client";

import { useEffect, useState } from "react";
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
  const [validationErrors, setValidationErrors] = useState<
    Record<string, string>
  >({});
  const [localValues, setLocalValues] = useState<
    Record<string, string | number>
  >({});

  // Handle MANUAL type - call onConfigChange with null
  useEffect(() => {
    if (!connectionType || connectionType === "MANUAL") {
      onConfigChange(null);
    }
  }, [connectionType, onConfigChange]);

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

  // Update local value and validate (for immediate feedback)
  const updateLocalValue = (key: ConfigKey, value: string | number) => {
    setLocalValues((prev) => ({ ...prev, [key]: value }));

    // Validate immediately for port and baseUrl
    if (key === "port") {
      const portValue = String(value).trim();
      if (portValue !== "") {
        const portNum = parseInt(portValue, 10);
        if (isNaN(portNum) || portNum <= 0) {
          setValidationErrors((prev) => ({
            ...prev,
            port: "port must be a positive integer",
          }));
        } else {
          setValidationErrors((prev) => {
            const newErrors = { ...prev };
            delete newErrors.port;
            return newErrors;
          });
        }
      }
    }

    if (key === "baseUrl") {
      const urlValue = String(value).trim();
      if (urlValue !== "") {
        try {
          new URL(urlValue);
          setValidationErrors((prev) => {
            const newErrors = { ...prev };
            delete newErrors.baseUrl;
            return newErrors;
          });
        } catch {
          setValidationErrors((prev) => ({
            ...prev,
            baseUrl: "baseUrl must be a valid URL",
          }));
        }
      }
    }
  };

  // Validate and update config (called on blur)
  const updateConfig = (key: ConfigKey, value: string | number) => {
    if (!ALLOWED_CONFIG_KEYS.includes(key)) {
      return;
    }

    // Validate port
    if (key === "port") {
      const portValue = String(value).trim();
      if (portValue === "") {
        // Clear error if empty
        setValidationErrors((prev) => {
          const newErrors = { ...prev };
          // eslint-disable-next-line security/detect-object-injection
          delete newErrors[key];
          return newErrors;
        });
      } else {
        const portNum = parseInt(portValue, 10);
        if (isNaN(portNum) || portNum <= 0) {
          setValidationErrors((prev) => ({
            ...prev,
            port: "port must be a positive integer",
          }));
          return;
        }
        // Clear error if valid
        setValidationErrors((prev) => {
          const newErrors = { ...prev };
          // eslint-disable-next-line security/detect-object-injection
          delete newErrors[key];
          return newErrors;
        });
      }
    }

    // Validate baseUrl
    if (key === "baseUrl") {
      const urlValue = String(value).trim();
      if (urlValue === "") {
        // Clear error if empty
        setValidationErrors((prev) => {
          const newErrors = { ...prev };
          // eslint-disable-next-line security/detect-object-injection
          delete newErrors[key];
          return newErrors;
        });
      } else {
        try {
          new URL(urlValue);
          // Clear error if valid
          setValidationErrors((prev) => {
            const newErrors = { ...prev };
            // eslint-disable-next-line security/detect-object-injection
            delete newErrors[key];
            return newErrors;
          });
        } catch {
          setValidationErrors((prev) => ({
            ...prev,
            baseUrl: "baseUrl must be a valid URL",
          }));
          return;
        }
      }
    }

    // Clear validation error for other fields
    if (key !== "port" && key !== "baseUrl") {
      setValidationErrors((prev) => {
        const newErrors = { ...prev };
        // eslint-disable-next-line security/detect-object-injection
        delete newErrors[key];
        return newErrors;
      });
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
            value={
              // eslint-disable-next-line security/detect-object-injection
              localValues.host ?? getConfigValue("host")
            }
            onChange={(e) => updateLocalValue("host", e.target.value)}
            onBlur={(e) => updateConfig("host", e.target.value)}
            placeholder="e.g., 192.168.1.100"
            className="mt-1"
            required
          />
        </div>
        <div>
          <label htmlFor="network-port" className="text-sm font-medium">
            Port
          </label>
          <Input
            id="network-port"
            type="number"
            value={
              // eslint-disable-next-line security/detect-object-injection
              localValues.port ?? getConfigValue("port")
            }
            onChange={(e) =>
              updateLocalValue(
                "port",
                e.target.value ? parseInt(e.target.value, 10) : "",
              )
            }
            onBlur={(e) =>
              updateConfig(
                "port",
                e.target.value ? parseInt(e.target.value, 10) : "",
              )
            }
            placeholder="e.g., 8080"
            className="mt-1"
          />
          {validationErrors.port && (
            <p className="text-xs text-red-500 mt-1">{validationErrors.port}</p>
          )}
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
            value={
              // eslint-disable-next-line security/detect-object-injection
              localValues.baseUrl ?? getConfigValue("baseUrl")
            }
            onChange={(e) => updateLocalValue("baseUrl", e.target.value)}
            onBlur={(e) => updateConfig("baseUrl", e.target.value)}
            placeholder="e.g., https://api.example.com"
            className="mt-1"
          />
          {validationErrors.baseUrl && (
            <p className="text-xs text-red-500 mt-1">
              {validationErrors.baseUrl}
            </p>
          )}
        </div>
        <div>
          <label htmlFor="api-key" className="text-sm font-medium">
            API Key
          </label>
          <Input
            id="api-key"
            type="password"
            autoComplete="off"
            value={
              // eslint-disable-next-line security/detect-object-injection
              localValues.apiKey ?? getConfigValue("apiKey")
            }
            onChange={(e) => updateLocalValue("apiKey", e.target.value)}
            onBlur={(e) => updateConfig("apiKey", e.target.value)}
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
            autoComplete="off"
            value={
              // eslint-disable-next-line security/detect-object-injection
              localValues.secret ?? getConfigValue("secret")
            }
            onChange={(e) => updateLocalValue("secret", e.target.value)}
            onBlur={(e) => updateConfig("secret", e.target.value)}
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
            value={
              // eslint-disable-next-line security/detect-object-injection
              localValues.importPath ?? getConfigValue("importPath")
            }
            onChange={(e) => updateLocalValue("importPath", e.target.value)}
            onBlur={(e) => updateConfig("importPath", e.target.value)}
            placeholder="e.g., /path/to/import/files"
            className="mt-1"
          />
        </div>
      </div>
    );
  }

  return null;
}

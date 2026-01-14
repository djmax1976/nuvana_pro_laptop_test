/**
 * POS Type Configurations and Helpers
 *
 * Configuration constants for all supported POS systems.
 * These match the HTML template specifications exactly.
 *
 * Reference: nuvana_docs/templates/onboarding-ui/index.html
 *
 * @module lib/pos-integration/pos-types
 */

import type {
  POSSystemType,
  POSTypeConfig,
  POSConnectionCategory,
} from "@/types/pos-integration";

// ============================================================================
// POS Type Configurations
// ============================================================================

/**
 * Complete configuration for all supported POS types
 * MANDATORY: These configurations MUST match the template exactly
 * Reference: nuvana_docs/templates/onboarding-ui/index.html lines 375-389
 */
export const POS_TYPE_CONFIGS: Record<POSSystemType, POSTypeConfig> = {
  // Verifone POS Systems
  VERIFONE_COMMANDER: {
    key: "VERIFONE_COMMANDER",
    type: "file",
    name: "Verifone Commander",
    description: "File-based NAXML data exchange",
    icon: "cash-register",
    group: "Verifone",
    exportPath: "C:\\Commander\\Export",
    importPath: "C:\\Commander\\Import",
  },
  VERIFONE_RUBY2: {
    key: "VERIFONE_RUBY2",
    type: "file",
    name: "Verifone Ruby2",
    description: "File-based NAXML data exchange",
    icon: "cash-register",
    group: "Verifone",
    exportPath: "C:\\RubyCI\\SSXML\\Out",
    importPath: "C:\\RubyCI\\SSXML\\In",
  },
  VERIFONE_SAPPHIRE: {
    key: "VERIFONE_SAPPHIRE",
    type: "network",
    name: "Verifone Sapphire",
    description: "Network API connection",
    icon: "cash-register",
    group: "Verifone",
    defaultPort: 8080,
  },

  // Gilbarco POS Systems
  GILBARCO_PASSPORT: {
    key: "GILBARCO_PASSPORT",
    type: "network",
    name: "Gilbarco Passport",
    description: "Network XML protocol",
    icon: "gas-pump",
    group: "Gilbarco",
    defaultPort: 5015,
  },
  GILBARCO_NAXML: {
    key: "GILBARCO_NAXML",
    type: "file",
    name: "Gilbarco NAXML",
    description: "File-based NAXML exchange",
    icon: "gas-pump",
    group: "Gilbarco",
    exportPath: "C:\\Passport\\Export",
    importPath: "C:\\Passport\\Import",
  },
  GILBARCO_COMMANDER: {
    key: "GILBARCO_COMMANDER",
    type: "network",
    name: "Gilbarco Commander",
    description: "Network connection",
    icon: "gas-pump",
    group: "Gilbarco",
    defaultPort: 8080,
  },

  // Cloud POS Systems
  SQUARE_REST: {
    key: "SQUARE_REST",
    type: "cloud",
    name: "Square",
    description: "Cloud REST API",
    icon: "square",
    group: "Cloud POS",
    provider: "Square",
  },
  CLOVER_REST: {
    key: "CLOVER_REST",
    type: "cloud",
    name: "Clover",
    description: "Cloud REST API",
    icon: "clover",
    group: "Cloud POS",
    provider: "Clover",
  },
  TOAST_REST: {
    key: "TOAST_REST",
    type: "cloud",
    name: "Toast",
    description: "Cloud REST API",
    icon: "utensils",
    group: "Cloud POS",
    provider: "Toast",
  },
  LIGHTSPEED_REST: {
    key: "LIGHTSPEED_REST",
    type: "cloud",
    name: "Lightspeed",
    description: "Cloud REST API",
    icon: "bolt",
    group: "Cloud POS",
    provider: "Lightspeed",
  },

  // Other POS Systems
  NCR_ALOHA: {
    key: "NCR_ALOHA",
    type: "network",
    name: "NCR Aloha",
    description: "Network connection",
    icon: "server",
    group: "Other",
    defaultPort: 9999,
  },
  ORACLE_SIMPHONY: {
    key: "ORACLE_SIMPHONY",
    type: "network",
    name: "Oracle Simphony",
    description: "Network connection",
    icon: "database",
    group: "Other",
    defaultPort: 8443,
  },
  GENERIC_REST: {
    key: "GENERIC_REST",
    type: "network",
    name: "Generic REST API",
    description: "Custom REST endpoint",
    icon: "code",
    group: "Other",
    defaultPort: 443,
  },
  GENERIC_XML: {
    key: "GENERIC_XML",
    type: "network",
    name: "Generic XML",
    description: "Custom XML protocol",
    icon: "code",
    group: "Other",
    defaultPort: 8080,
  },
  MANUAL_ENTRY: {
    key: "MANUAL_ENTRY",
    type: "manual",
    name: "Manual Entry",
    description: "No automatic sync",
    icon: "keyboard",
    group: "Other",
  },
};

// ============================================================================
// POS Type Groups for Dropdown
// ============================================================================

/**
 * POS types grouped for dropdown display
 * MANDATORY: Must match template optgroups exactly
 * Reference: nuvana_docs/templates/onboarding-ui/index.html lines 58-78
 */
export const POS_TYPE_GROUPS: Array<{
  label: string;
  options: POSSystemType[];
}> = [
  {
    label: "Verifone",
    options: ["VERIFONE_COMMANDER", "VERIFONE_RUBY2", "VERIFONE_SAPPHIRE"],
  },
  {
    label: "Gilbarco",
    options: ["GILBARCO_PASSPORT", "GILBARCO_NAXML"],
  },
  {
    label: "Cloud POS",
    options: ["SQUARE_REST", "CLOVER_REST", "TOAST_REST", "LIGHTSPEED_REST"],
  },
  {
    label: "Other",
    options: ["NCR_ALOHA", "ORACLE_SIMPHONY", "GENERIC_REST", "MANUAL_ENTRY"],
  },
];

/**
 * All POS types as a flat array
 */
export const ALL_POS_TYPES: POSSystemType[] = Object.keys(
  POS_TYPE_CONFIGS,
) as POSSystemType[];

/**
 * File-based POS types
 * Note: eslint-disable used because Record<POSSystemType, T> is fully typed
 */
export const FILE_BASED_POS_TYPES: POSSystemType[] = ALL_POS_TYPES.filter(
  // eslint-disable-next-line security/detect-object-injection
  (type) => POS_TYPE_CONFIGS[type].type === "file",
);

/**
 * Network-based POS types
 */
export const NETWORK_POS_TYPES: POSSystemType[] = ALL_POS_TYPES.filter(
  // eslint-disable-next-line security/detect-object-injection
  (type) => POS_TYPE_CONFIGS[type].type === "network",
);

/**
 * Cloud POS types
 */
export const CLOUD_POS_TYPES: POSSystemType[] = ALL_POS_TYPES.filter(
  // eslint-disable-next-line security/detect-object-injection
  (type) => POS_TYPE_CONFIGS[type].type === "cloud",
);

// ============================================================================
// Sync Interval Options
// ============================================================================

/**
 * Available sync interval options for the wizard
 * Reference: nuvana_docs/templates/onboarding-ui/index.html lines 256-273
 */
export const SYNC_INTERVAL_OPTIONS = [
  { value: 15, label: "15 min" },
  { value: 30, label: "30 min" },
  { value: 60, label: "1 hour", default: true },
  { value: 1440, label: "Daily" },
] as const;

/**
 * Default sync interval in minutes
 */
export const DEFAULT_SYNC_INTERVAL = 60;

/**
 * Default sync options with empty selected items
 * Items will be populated when preview data is loaded
 */
export const DEFAULT_SYNC_OPTIONS = {
  syncDepartments: true,
  syncTenders: true,
  syncTaxRates: true,
  autoSyncEnabled: true,
  syncIntervalMinutes: DEFAULT_SYNC_INTERVAL,
  selectedItems: {
    departments: new Set<string>(),
    tenderTypes: new Set<string>(),
    taxRates: new Set<string>(),
  },
};

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Get POS type configuration by type
 * @param posType - The POS system type
 * @returns The configuration for the POS type
 */
export function getPOSTypeConfig(posType: POSSystemType): POSTypeConfig {
  // eslint-disable-next-line security/detect-object-injection
  return POS_TYPE_CONFIGS[posType];
}

/**
 * Get the connection category for a POS type
 * @param posType - The POS system type
 * @returns The connection category (file, network, cloud, manual)
 */
export function getConnectionCategory(
  posType: POSSystemType,
): POSConnectionCategory {
  // eslint-disable-next-line security/detect-object-injection
  return POS_TYPE_CONFIGS[posType].type;
}

/**
 * Check if a POS type is file-based
 * @param posType - The POS system type
 * @returns True if the POS type uses file-based exchange
 */
export function isFileBased(posType: POSSystemType): boolean {
  // eslint-disable-next-line security/detect-object-injection
  return POS_TYPE_CONFIGS[posType].type === "file";
}

/**
 * Check if a POS type is network-based
 * @param posType - The POS system type
 * @returns True if the POS type uses network connections
 */
export function isNetworkBased(posType: POSSystemType): boolean {
  // eslint-disable-next-line security/detect-object-injection
  return POS_TYPE_CONFIGS[posType].type === "network";
}

/**
 * Check if a POS type is cloud-based
 * @param posType - The POS system type
 * @returns True if the POS type uses cloud API
 */
export function isCloudBased(posType: POSSystemType): boolean {
  // eslint-disable-next-line security/detect-object-injection
  return POS_TYPE_CONFIGS[posType].type === "cloud";
}

/**
 * Check if a POS type is manual entry
 * @param posType - The POS system type
 * @returns True if the POS type is manual entry
 */
export function isManualEntry(posType: POSSystemType): boolean {
  // eslint-disable-next-line security/detect-object-injection
  return POS_TYPE_CONFIGS[posType].type === "manual";
}

/**
 * Check if a POS type requires connection testing
 * @param posType - The POS system type
 * @returns True if connection testing is available/required
 */
export function requiresConnectionTest(posType: POSSystemType): boolean {
  // eslint-disable-next-line security/detect-object-injection
  return POS_TYPE_CONFIGS[posType].type !== "manual";
}

/**
 * Get the default port for a network POS type
 * @param posType - The POS system type
 * @returns The default port or undefined if not network-based
 */
export function getDefaultPort(posType: POSSystemType): number | undefined {
  // eslint-disable-next-line security/detect-object-injection
  return POS_TYPE_CONFIGS[posType].defaultPort;
}

/**
 * Get the default export path for a file-based POS type
 * @param posType - The POS system type
 * @returns The default export path or undefined if not file-based
 */
export function getDefaultExportPath(
  posType: POSSystemType,
): string | undefined {
  // eslint-disable-next-line security/detect-object-injection
  return POS_TYPE_CONFIGS[posType].exportPath;
}

/**
 * Get the default import path for a file-based POS type
 * @param posType - The POS system type
 * @returns The default import path or undefined if not file-based
 */
export function getDefaultImportPath(
  posType: POSSystemType,
): string | undefined {
  // eslint-disable-next-line security/detect-object-injection
  return POS_TYPE_CONFIGS[posType].importPath;
}

/**
 * Get the cloud provider name for a cloud POS type
 * @param posType - The POS system type
 * @returns The provider name or undefined if not cloud-based
 */
export function getCloudProvider(posType: POSSystemType): string | undefined {
  // eslint-disable-next-line security/detect-object-injection
  return POS_TYPE_CONFIGS[posType].provider;
}

/**
 * Get the Font Awesome icon class for a POS type
 * @param posType - The POS system type
 * @returns The icon class (e.g., "fa-cash-register")
 */
export function getPOSIcon(posType: POSSystemType): string {
  // eslint-disable-next-line security/detect-object-injection
  return `fa-${POS_TYPE_CONFIGS[posType].icon}`;
}

/**
 * Get human-readable name for a POS type
 * @param posType - The POS system type
 * @returns The display name
 */
export function getPOSDisplayName(posType: POSSystemType): string {
  // eslint-disable-next-line security/detect-object-injection
  return POS_TYPE_CONFIGS[posType].name;
}

/**
 * Get description for a POS type
 * @param posType - The POS system type
 * @returns The description text
 */
export function getPOSDescription(posType: POSSystemType): string {
  // eslint-disable-next-line security/detect-object-injection
  return POS_TYPE_CONFIGS[posType].description;
}

/**
 * Format sync interval for display
 * @param minutes - Sync interval in minutes
 * @returns Human-readable interval string
 */
export function formatSyncInterval(minutes: number): string {
  if (minutes >= 1440) {
    const days = Math.floor(minutes / 1440);
    return days === 1 ? "Once daily" : `Every ${days} days`;
  }
  if (minutes >= 60) {
    const hours = Math.floor(minutes / 60);
    return hours === 1 ? "Every hour" : `Every ${hours} hours`;
  }
  return `Every ${minutes} minutes`;
}

/**
 * Validate UUID format (for storeId validation)
 * @param id - The string to validate
 * @returns True if the string is a valid UUID
 */
export function isValidUUID(id: string): boolean {
  const uuidRegex =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return uuidRegex.test(id);
}

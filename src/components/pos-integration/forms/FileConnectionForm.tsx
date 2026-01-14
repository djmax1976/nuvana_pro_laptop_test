/**
 * File Connection Form Component
 *
 * Form for file-based POS connections (Verifone Commander, Ruby2, Gilbarco NAXML).
 * Displays export and import path fields.
 *
 * Reference: nuvana_docs/templates/onboarding-ui/index.html lines 108-120
 *
 * Security: SEC-014 (input validation), FE-002 (form validation)
 *
 * @module components/pos-integration/forms/FileConnectionForm
 */

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type {
  FileConnectionConfig,
  POSSystemType,
} from "@/types/pos-integration";
import {
  getDefaultExportPath,
  getDefaultImportPath,
} from "@/lib/pos-integration/pos-types";

// ============================================================================
// Types
// ============================================================================

interface FileConnectionFormProps {
  /** Current file configuration */
  config: FileConnectionConfig;
  /** Selected POS type for placeholder defaults */
  posType: POSSystemType;
  /** Callback when config changes */
  onChange: (config: Partial<FileConnectionConfig>) => void;
  /** Whether form is disabled */
  disabled?: boolean;
}

// ============================================================================
// Component
// ============================================================================

/**
 * Form for configuring file-based POS connections.
 *
 * Fields:
 * - Outbox Path (BOOutbox): POS writes data here, Nuvana reads from here
 * - Inbox Path (BOInbox): Nuvana writes data here, POS reads from here
 *
 * Uses placeholder defaults based on selected POS type.
 *
 * @example
 * ```tsx
 * <FileConnectionForm
 *   config={state.fileConfig}
 *   posType="VERIFONE_COMMANDER"
 *   onChange={updateFileConfig}
 * />
 * ```
 */
export function FileConnectionForm({
  config,
  posType,
  onChange,
  disabled = false,
}: FileConnectionFormProps): JSX.Element {
  const defaultExportPath = getDefaultExportPath(posType) || "";
  const defaultImportPath = getDefaultImportPath(posType) || "";

  return (
    <div className="space-y-4 animate-in fade-in duration-300">
      {/* BOOutbox - POS writes data here, Nuvana reads from here */}
      <div>
        <Label
          htmlFor="outbox-path"
          className="text-sm font-medium text-gray-700"
        >
          Outbox Path{" "}
          <span className="text-gray-400 font-normal">(POS → Nuvana)</span>
        </Label>
        <Input
          id="outbox-path"
          type="text"
          value={config.exportPath}
          onChange={(e) => onChange({ exportPath: e.target.value })}
          placeholder={defaultExportPath}
          disabled={disabled}
          className="mt-1"
          data-testid="file-outbox-path"
          autoComplete="off"
        />
        <p className="text-xs text-gray-400 mt-1">
          POS writes data here • Nuvana reads from this folder
        </p>
      </div>

      {/* BOInbox - Nuvana writes data here, POS reads from here */}
      <div>
        <Label
          htmlFor="inbox-path"
          className="text-sm font-medium text-gray-700"
        >
          Inbox Path{" "}
          <span className="text-gray-400 font-normal">(Nuvana → POS)</span>
        </Label>
        <Input
          id="inbox-path"
          type="text"
          value={config.importPath}
          onChange={(e) => onChange({ importPath: e.target.value })}
          placeholder={defaultImportPath}
          disabled={disabled}
          className="mt-1"
          data-testid="file-inbox-path"
          autoComplete="off"
        />
        <p className="text-xs text-gray-400 mt-1">
          Nuvana writes data here • POS reads from this folder
        </p>
      </div>
    </div>
  );
}

export default FileConnectionForm;

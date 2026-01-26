/**
 * POS Type Selector Component
 *
 * Reusable grouped dropdown for selecting POS system types.
 * Used across the application for consistent POS type selection:
 * - Store creation wizard (terminal configuration)
 * - Store edit modal (terminal configuration)
 * - MyStore POS integration page
 *
 * Enterprise Requirement: Consistent 15-type POSSystemType selection
 * with grouped dropdown matching the POS Integration page UX.
 *
 * Security: SEC-014 (input validation via strict type checking)
 *
 * @module components/pos-integration/POSTypeSelector
 */

import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import type { POSSystemType } from "@/types/pos-integration";
import {
  POS_TYPE_GROUPS,
  getPOSTypeConfig,
  getPOSIcon,
  getPOSDisplayName,
  getPOSDescription,
} from "@/lib/pos-integration/pos-types";

// ============================================================================
// Types
// ============================================================================

export interface POSTypeSelectorProps {
  /** Currently selected POS type */
  value: POSSystemType | null | undefined;
  /** Callback when POS type is selected */
  onChange: (posType: POSSystemType) => void;
  /** Placeholder text for empty selection */
  placeholder?: string;
  /** Whether the selector is disabled */
  disabled?: boolean;
  /** Custom className for the trigger */
  className?: string;
  /** Whether to show the info card below selection */
  showInfoCard?: boolean;
  /** Custom label for the selector */
  label?: string;
  /** Test ID for the selector */
  testId?: string;
  /** ID for the select element (for label association) */
  id?: string;
}

// ============================================================================
// Component
// ============================================================================

/**
 * Reusable POS Type selector with grouped dropdown.
 *
 * Features:
 * - Grouped dropdown with optgroups (Verifone, Gilbarco, Cloud POS, Other)
 * - All 15 POSSystemType options
 * - Optional info card with icon and description
 * - Consistent styling across application
 * - Type-safe with POSSystemType enum
 *
 * @example
 * ```tsx
 * // Basic usage
 * <POSTypeSelector
 *   value={posType}
 *   onChange={setPosType}
 * />
 *
 * // With info card
 * <POSTypeSelector
 *   value={posType}
 *   onChange={setPosType}
 *   showInfoCard
 *   label="POS System"
 * />
 *
 * // In a form with ID for label association
 * <label htmlFor="pos-type">POS System</label>
 * <POSTypeSelector
 *   id="pos-type"
 *   value={posType}
 *   onChange={setPosType}
 * />
 * ```
 */
export function POSTypeSelector({
  value,
  onChange,
  placeholder = "Select POS system...",
  disabled = false,
  className,
  showInfoCard = false,
  label,
  testId = "pos-type-selector",
  id,
}: POSTypeSelectorProps): JSX.Element {
  const selectedConfig = value ? getPOSTypeConfig(value) : null;

  return (
    <div className="w-full">
      {label && (
        <label
          htmlFor={id}
          className="text-sm font-medium text-gray-700 block mb-1"
        >
          {label}
        </label>
      )}

      <Select
        value={value || ""}
        onValueChange={(newValue) => onChange(newValue as POSSystemType)}
        disabled={disabled}
      >
        <SelectTrigger
          id={id}
          className={cn("w-full", className)}
          data-testid={testId}
        >
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent>
          {POS_TYPE_GROUPS.map((group) => (
            <SelectGroup key={group.label}>
              <SelectLabel className="text-sm font-semibold text-gray-500 px-2 py-1.5">
                {group.label}
              </SelectLabel>
              {group.options.map((posType) => {
                const config = getPOSTypeConfig(posType);
                return (
                  <SelectItem
                    key={posType}
                    value={posType}
                    className="py-2"
                    data-testid={`pos-option-${posType}`}
                  >
                    {config.name}
                  </SelectItem>
                );
              })}
            </SelectGroup>
          ))}
        </SelectContent>
      </Select>

      {/* Optional POS Info Card */}
      {showInfoCard && selectedConfig && (
        <div
          className="bg-gray-50 rounded-lg p-4 mt-3 animate-in fade-in duration-300"
          data-testid="pos-info-card"
        >
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center flex-shrink-0">
              <i
                className={cn("fas", getPOSIcon(value!), "text-blue-600")}
                aria-hidden="true"
              />
            </div>
            <div>
              <p className="font-medium text-gray-800">
                {getPOSDisplayName(value!)}
              </p>
              <p className="text-sm text-gray-500">
                {getPOSDescription(value!)}
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default POSTypeSelector;

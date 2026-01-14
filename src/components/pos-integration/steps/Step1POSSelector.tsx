/**
 * Step 1: POS System Selector Component
 *
 * First step of the wizard - allows user to select their POS system type.
 * Shows grouped dropdown with optgroups and info card after selection.
 *
 * Reference: nuvana_docs/templates/onboarding-ui/index.html lines 52-99
 *
 * Security: SEC-014 (input validation via strict type checking)
 *
 * @module components/pos-integration/steps/Step1POSSelector
 */

import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
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

interface Step1POSSelectorProps {
  /** Currently selected POS type */
  selectedPOS: POSSystemType | null;
  /** Callback when POS is selected */
  onSelect: (posType: POSSystemType) => void;
  /** Callback to proceed to next step */
  onNext: () => void;
  /** Whether next button should be enabled */
  canProceed: boolean;
}

// ============================================================================
// Component
// ============================================================================

/**
 * POS System selection step with grouped dropdown and info card.
 *
 * Features:
 * - Grouped dropdown matching template optgroups (Verifone, Gilbarco, Cloud POS, Other)
 * - Info card shows icon, name, and description after selection
 * - Next button disabled until selection is made
 * - Fade-in animation on info card
 *
 * @example
 * ```tsx
 * <Step1POSSelector
 *   selectedPOS={state.selectedPOS}
 *   onSelect={selectPOS}
 *   onNext={goNext}
 *   canProceed={canGoNext}
 * />
 * ```
 */
export function Step1POSSelector({
  selectedPOS,
  onSelect,
  onNext,
  canProceed,
}: Step1POSSelectorProps): JSX.Element {
  const selectedConfig = selectedPOS ? getPOSTypeConfig(selectedPOS) : null;

  return (
    <div className="bg-white rounded-lg shadow-sm border p-6">
      <h2 className="text-lg font-medium text-gray-800 mb-2">
        Select Your POS System
      </h2>
      <p className="text-sm text-gray-500 mb-6">
        Choose the point-of-sale system installed at this store
      </p>

      {/* POS Type Dropdown */}
      <Select
        value={selectedPOS || ""}
        onValueChange={(value) => onSelect(value as POSSystemType)}
      >
        <SelectTrigger
          className="w-full px-4 py-3 h-12 text-gray-700"
          data-testid="pos-type-select"
        >
          <SelectValue placeholder="Choose your POS system..." />
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

      {/* POS Info Card - Shows after selection */}
      {selectedConfig && (
        <div
          className="bg-gray-50 rounded-lg p-4 mt-6 animate-in fade-in duration-300"
          data-testid="pos-info-card"
        >
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center flex-shrink-0">
              <i
                className={cn("fas", getPOSIcon(selectedPOS!), "text-blue-600")}
                aria-hidden="true"
              />
            </div>
            <div>
              <p className="font-medium text-gray-800">
                {getPOSDisplayName(selectedPOS!)}
              </p>
              <p className="text-sm text-gray-500">
                {getPOSDescription(selectedPOS!)}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Navigation */}
      <div className="flex justify-end mt-6">
        <Button
          onClick={onNext}
          disabled={!canProceed}
          className={cn(
            "px-6",
            canProceed
              ? "bg-blue-600 hover:bg-blue-700 text-white"
              : "bg-gray-300 text-gray-500 cursor-not-allowed",
          )}
          data-testid="step1-next-button"
        >
          Next
          <ArrowRight className="ml-2 h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

export default Step1POSSelector;

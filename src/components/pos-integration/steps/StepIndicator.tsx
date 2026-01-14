/**
 * Step Indicator Component
 *
 * Displays progress through the 4-step POS setup wizard.
 * Shows current step, completed steps with checkmarks, and connecting lines.
 *
 * Reference: nuvana_docs/templates/onboarding-ui/index.html lines 26-46
 *
 * @module components/pos-integration/steps/StepIndicator
 */

import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import type { WizardStep } from "@/types/pos-integration";

// ============================================================================
// Types
// ============================================================================

interface StepIndicatorProps {
  /** Current active step (1-4) */
  currentStep: WizardStep;
  /** Optional class name */
  className?: string;
}

interface StepConfig {
  step: WizardStep;
  label: string;
}

// ============================================================================
// Constants
// ============================================================================

const STEPS: StepConfig[] = [
  { step: 1, label: "POS System" },
  { step: 2, label: "Connection" },
  { step: 3, label: "Sync Options" },
  { step: 4, label: "Confirm" },
];

// ============================================================================
// Component
// ============================================================================

/**
 * Displays the wizard progress indicator with 4 steps.
 *
 * States:
 * - Completed: Green circle with checkmark, green connecting line
 * - Current: Blue circle with step number
 * - Upcoming: Gray circle with step number, gray connecting line
 *
 * @example
 * ```tsx
 * <StepIndicator currentStep={2} />
 * ```
 */
export function StepIndicator({
  currentStep,
  className,
}: StepIndicatorProps): JSX.Element {
  return (
    <div
      className={cn("flex items-center justify-between", className)}
      role="navigation"
      aria-label="Wizard progress"
    >
      {STEPS.map((stepConfig, index) => {
        const isCompleted = stepConfig.step < currentStep;
        const isCurrent = stepConfig.step === currentStep;
        const isLast = index === STEPS.length - 1;

        return (
          <div
            key={stepConfig.step}
            className="flex items-center flex-1 last:flex-none"
          >
            {/* Step Circle and Label */}
            <div className="flex items-center">
              <div
                className={cn(
                  "w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold transition-colors",
                  isCompleted && "bg-green-500 text-white",
                  isCurrent && "bg-blue-600 text-white",
                  !isCompleted && !isCurrent && "bg-gray-300 text-gray-500",
                )}
                aria-current={isCurrent ? "step" : undefined}
                data-testid={`step-indicator-${stepConfig.step}`}
              >
                {isCompleted ? (
                  <Check className="h-4 w-4" aria-hidden="true" />
                ) : (
                  stepConfig.step
                )}
              </div>
              <span
                className={cn(
                  "ml-2 text-sm transition-colors",
                  isCurrent && "font-medium text-gray-700",
                  isCompleted && "font-medium text-gray-700",
                  !isCompleted && !isCurrent && "text-gray-500",
                )}
              >
                {stepConfig.label}
              </span>
            </div>

            {/* Connecting Line */}
            {!isLast && (
              <div
                className={cn(
                  "flex-1 h-0.5 mx-4 transition-colors",
                  isCompleted ? "bg-green-500" : "bg-gray-300",
                )}
                aria-hidden="true"
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

export default StepIndicator;

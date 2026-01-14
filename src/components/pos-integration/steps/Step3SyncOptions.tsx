/**
 * Step 3: Sync Options Component
 *
 * Third step of the wizard - displays ALL data from POS with individual
 * selection checkboxes. Users can select/deselect specific items to import.
 *
 * Reference: nuvana_docs/templates/onboarding-ui/index.html lines 184-285
 *
 * @module components/pos-integration/steps/Step3SyncOptions
 */

import {
  ArrowLeft,
  ArrowRight,
  Folder,
  CreditCard,
  Percent,
  Users,
  Check,
  X,
} from "lucide-react";
import { useEffect, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import type {
  SyncOptionsConfig,
  POSDataPreview,
  POSPreviewDepartment,
  POSPreviewTenderType,
  POSPreviewTaxRate,
} from "@/types/pos-integration";
import { SYNC_INTERVAL_OPTIONS } from "@/lib/pos-integration/pos-types";

// ============================================================================
// Types
// ============================================================================

interface Step3SyncOptionsProps {
  /** Current sync options configuration */
  syncOptions: SyncOptionsConfig;
  /** Callback when sync options change */
  onSyncOptionsChange: (options: Partial<SyncOptionsConfig>) => void;
  /** Whether next button should be enabled */
  canProceed: boolean;
  /** Callback to proceed to next step */
  onNext: () => void;
  /** Callback to go back to previous step */
  onBack: () => void;
  /** Preview of available data from POS (from connection test) */
  preview?: POSDataPreview;
  /** Initialize selected items from preview data */
  onInitSelectedItems: (preview: POSDataPreview) => void;
  /** Toggle individual item selection */
  onToggleItem: (
    entityType: "departments" | "tenderTypes" | "taxRates",
    posCode: string,
  ) => void;
  /** Select all items in a category */
  onSelectAll: (
    entityType: "departments" | "tenderTypes" | "taxRates",
    posCodes: string[],
  ) => void;
  /** Deselect all items in a category */
  onDeselectAll: (
    entityType: "departments" | "tenderTypes" | "taxRates",
  ) => void;
}

// ============================================================================
// Entity Section Header Component
// ============================================================================

interface EntitySectionHeaderProps {
  title: string;
  icon: typeof Folder;
  totalCount: number;
  selectedCount: number;
  isEnabled: boolean;
  onToggleEnabled: (enabled: boolean) => void;
  onSelectAll: () => void;
  onDeselectAll: () => void;
  disabled?: boolean;
  comingSoon?: boolean;
}

function EntitySectionHeader({
  title,
  icon: Icon,
  totalCount,
  selectedCount,
  isEnabled,
  onToggleEnabled,
  onSelectAll,
  onDeselectAll,
  disabled = false,
  comingSoon = false,
}: EntitySectionHeaderProps): JSX.Element {
  const allSelected = selectedCount === totalCount && totalCount > 0;
  const noneSelected = selectedCount === 0;

  return (
    <div
      className={cn(
        "flex items-center justify-between p-4 bg-gray-50 rounded-t-lg border-b",
        disabled && "opacity-60",
      )}
    >
      <div className="flex items-center gap-3">
        <Checkbox
          checked={isEnabled}
          onCheckedChange={(checked) =>
            !disabled && onToggleEnabled(checked === true)
          }
          disabled={disabled}
          className="w-5 h-5"
        />
        <Icon
          className={cn(
            "h-5 w-5",
            disabled ? "text-gray-300" : "text-gray-500",
          )}
        />
        <div>
          <span
            className={cn(
              "font-medium",
              disabled ? "text-gray-400" : "text-gray-800",
            )}
          >
            {title}
          </span>
          {totalCount > 0 && !disabled && (
            <span className="ml-2 text-sm text-gray-500">
              ({selectedCount} of {totalCount} selected)
            </span>
          )}
        </div>
      </div>
      <div className="flex items-center gap-2">
        {comingSoon && (
          <span className="text-xs bg-gray-200 text-gray-500 px-2 py-1 rounded">
            Coming Soon
          </span>
        )}
        {!disabled && totalCount > 0 && isEnabled && (
          <div className="flex gap-1">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={onSelectAll}
              disabled={allSelected}
              className="text-xs h-7 px-2"
            >
              <Check className="h-3 w-3 mr-1" />
              All
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={onDeselectAll}
              disabled={noneSelected}
              className="text-xs h-7 px-2"
            >
              <X className="h-3 w-3 mr-1" />
              None
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================================================
// Department Item Component
// ============================================================================

interface DepartmentItemProps {
  item: POSPreviewDepartment;
  isSelected: boolean;
  onToggle: () => void;
  disabled?: boolean;
}

function DepartmentItem({
  item,
  isSelected,
  onToggle,
  disabled,
}: DepartmentItemProps): JSX.Element {
  return (
    <label
      className={cn(
        "flex items-center gap-3 p-3 border-b last:border-b-0 hover:bg-gray-50 cursor-pointer",
        disabled && "opacity-50 cursor-not-allowed",
      )}
    >
      <Checkbox
        checked={isSelected}
        onCheckedChange={() => !disabled && onToggle()}
        disabled={disabled}
        className="w-4 h-4"
      />
      <span className="font-mono text-xs text-gray-400 w-16 shrink-0">
        {item.posCode}
      </span>
      <span className="flex-1 text-sm text-gray-700 truncate">
        {item.displayName}
      </span>
      {item.isTaxable !== undefined && (
        <span
          className={cn(
            "text-xs px-2 py-0.5 rounded",
            item.isTaxable
              ? "bg-blue-100 text-blue-700"
              : "bg-gray-100 text-gray-500",
          )}
        >
          {item.isTaxable ? "Taxable" : "Non-Taxable"}
        </span>
      )}
    </label>
  );
}

// ============================================================================
// Tender Type Item Component
// ============================================================================

interface TenderItemProps {
  item: POSPreviewTenderType;
  isSelected: boolean;
  onToggle: () => void;
  disabled?: boolean;
}

function TenderItem({
  item,
  isSelected,
  onToggle,
  disabled,
}: TenderItemProps): JSX.Element {
  return (
    <label
      className={cn(
        "flex items-center gap-3 p-3 border-b last:border-b-0 hover:bg-gray-50 cursor-pointer",
        disabled && "opacity-50 cursor-not-allowed",
      )}
    >
      <Checkbox
        checked={isSelected}
        onCheckedChange={() => !disabled && onToggle()}
        disabled={disabled}
        className="w-4 h-4"
      />
      <span className="font-mono text-xs text-gray-400 w-16 shrink-0">
        {item.posCode}
      </span>
      <span className="flex-1 text-sm text-gray-700 truncate">
        {item.displayName}
      </span>
      {item.isElectronic !== undefined && (
        <span
          className={cn(
            "text-xs px-2 py-0.5 rounded",
            item.isElectronic
              ? "bg-green-100 text-green-700"
              : "bg-gray-100 text-gray-500",
          )}
        >
          {item.isElectronic ? "Electronic" : "Cash"}
        </span>
      )}
    </label>
  );
}

// ============================================================================
// Tax Rate Item Component
// ============================================================================

interface TaxRateItemProps {
  item: POSPreviewTaxRate;
  isSelected: boolean;
  onToggle: () => void;
  disabled?: boolean;
}

function TaxRateItem({
  item,
  isSelected,
  onToggle,
  disabled,
}: TaxRateItemProps): JSX.Element {
  return (
    <label
      className={cn(
        "flex items-center gap-3 p-3 border-b last:border-b-0 hover:bg-gray-50 cursor-pointer",
        disabled && "opacity-50 cursor-not-allowed",
      )}
    >
      <Checkbox
        checked={isSelected}
        onCheckedChange={() => !disabled && onToggle()}
        disabled={disabled}
        className="w-4 h-4"
      />
      <span className="font-mono text-xs text-gray-400 w-16 shrink-0">
        {item.posCode}
      </span>
      <span className="flex-1 text-sm text-gray-700 truncate">{item.name}</span>
      <span className="text-sm font-medium text-gray-600 w-20 text-right">
        {(item.rate * 100).toFixed(2)}%
      </span>
      {item.jurisdiction && (
        <span className="text-xs text-gray-400 w-24 truncate">
          {item.jurisdiction}
        </span>
      )}
    </label>
  );
}

// ============================================================================
// Main Component
// ============================================================================

/**
 * Sync options step with full item lists and individual selection checkboxes.
 *
 * Features:
 * - Displays ALL items found in each category
 * - Individual checkbox for each item
 * - Select All / Deselect All per category
 * - Master toggle to enable/disable entire category
 * - Auto-sync schedule configuration
 *
 * @example
 * ```tsx
 * <Step3SyncOptions
 *   syncOptions={state.syncOptions}
 *   onSyncOptionsChange={updateSyncOptions}
 *   canProceed={canGoNext}
 *   onNext={goNext}
 *   onBack={goBack}
 *   preview={connectionTestResult?.data?.preview}
 *   onInitSelectedItems={initSelectedItemsFromPreview}
 *   onToggleItem={toggleItemSelection}
 *   onSelectAll={selectAllItems}
 *   onDeselectAll={deselectAllItems}
 * />
 * ```
 */
export function Step3SyncOptions({
  syncOptions,
  onSyncOptionsChange,
  canProceed,
  onNext,
  onBack,
  preview,
  onInitSelectedItems,
  onToggleItem,
  onSelectAll,
  onDeselectAll,
}: Step3SyncOptionsProps): JSX.Element {
  // Initialize selected items from preview when component mounts
  useEffect(() => {
    if (preview && syncOptions.selectedItems.departments.size === 0) {
      onInitSelectedItems(preview);
    }
  }, [
    preview,
    syncOptions.selectedItems.departments.size,
    onInitSelectedItems,
  ]);

  // Computed counts
  const deptPosCodes = useMemo(
    () => preview?.departments?.items.map((d) => d.posCode) || [],
    [preview?.departments?.items],
  );
  const tenderPosCodes = useMemo(
    () => preview?.tenderTypes?.items.map((t) => t.posCode) || [],
    [preview?.tenderTypes?.items],
  );
  const taxPosCodes = useMemo(
    () => preview?.taxRates?.items.map((t) => t.posCode) || [],
    [preview?.taxRates?.items],
  );

  const selectedDeptCount = syncOptions.selectedItems.departments.size;
  const selectedTenderCount = syncOptions.selectedItems.tenderTypes.size;
  const selectedTaxCount = syncOptions.selectedItems.taxRates.size;

  return (
    <div className="bg-white rounded-lg shadow-sm border p-6">
      <h2 className="text-lg font-medium text-gray-800 mb-2">
        Select Data to Import
      </h2>
      <p className="text-sm text-gray-500 mb-6">
        Review and select the specific items you want to import from your POS
        system.
        {preview && " All items are selected by default."}
      </p>

      {/* Departments Section */}
      <div
        className="border rounded-lg mb-4"
        data-testid="sync-section-departments"
      >
        <EntitySectionHeader
          title="Departments"
          icon={Folder}
          totalCount={preview?.departments?.count || 0}
          selectedCount={selectedDeptCount}
          isEnabled={syncOptions.syncDepartments}
          onToggleEnabled={(enabled) =>
            onSyncOptionsChange({ syncDepartments: enabled })
          }
          onSelectAll={() => onSelectAll("departments", deptPosCodes)}
          onDeselectAll={() => onDeselectAll("departments")}
        />
        {syncOptions.syncDepartments && preview?.departments?.items && (
          <div className="max-h-64 overflow-y-auto">
            {preview.departments.items.map((item) => (
              <DepartmentItem
                key={item.posCode}
                item={item}
                isSelected={syncOptions.selectedItems.departments.has(
                  item.posCode,
                )}
                onToggle={() => onToggleItem("departments", item.posCode)}
              />
            ))}
          </div>
        )}
        {syncOptions.syncDepartments &&
          !preview?.departments?.items?.length && (
            <div className="p-4 text-sm text-gray-400 text-center">
              No departments found in POS
            </div>
          )}
      </div>

      {/* Tender Types Section */}
      <div
        className="border rounded-lg mb-4"
        data-testid="sync-section-tenderTypes"
      >
        <EntitySectionHeader
          title="Tender Types"
          icon={CreditCard}
          totalCount={preview?.tenderTypes?.count || 0}
          selectedCount={selectedTenderCount}
          isEnabled={syncOptions.syncTenders}
          onToggleEnabled={(enabled) =>
            onSyncOptionsChange({ syncTenders: enabled })
          }
          onSelectAll={() => onSelectAll("tenderTypes", tenderPosCodes)}
          onDeselectAll={() => onDeselectAll("tenderTypes")}
        />
        {syncOptions.syncTenders && preview?.tenderTypes?.items && (
          <div className="max-h-64 overflow-y-auto">
            {preview.tenderTypes.items.map((item) => (
              <TenderItem
                key={item.posCode}
                item={item}
                isSelected={syncOptions.selectedItems.tenderTypes.has(
                  item.posCode,
                )}
                onToggle={() => onToggleItem("tenderTypes", item.posCode)}
              />
            ))}
          </div>
        )}
        {syncOptions.syncTenders && !preview?.tenderTypes?.items?.length && (
          <div className="p-4 text-sm text-gray-400 text-center">
            No tender types found in POS
          </div>
        )}
      </div>

      {/* Tax Rates Section */}
      <div
        className="border rounded-lg mb-4"
        data-testid="sync-section-taxRates"
      >
        <EntitySectionHeader
          title="Tax Rates"
          icon={Percent}
          totalCount={preview?.taxRates?.count || 0}
          selectedCount={selectedTaxCount}
          isEnabled={syncOptions.syncTaxRates}
          onToggleEnabled={(enabled) =>
            onSyncOptionsChange({ syncTaxRates: enabled })
          }
          onSelectAll={() => onSelectAll("taxRates", taxPosCodes)}
          onDeselectAll={() => onDeselectAll("taxRates")}
        />
        {syncOptions.syncTaxRates && preview?.taxRates?.items && (
          <div className="max-h-64 overflow-y-auto">
            {preview.taxRates.items.map((item) => (
              <TaxRateItem
                key={item.posCode}
                item={item}
                isSelected={syncOptions.selectedItems.taxRates.has(
                  item.posCode,
                )}
                onToggle={() => onToggleItem("taxRates", item.posCode)}
              />
            ))}
          </div>
        )}
        {syncOptions.syncTaxRates && !preview?.taxRates?.items?.length && (
          <div className="p-4 text-sm text-gray-400 text-center">
            No tax rates found in POS
          </div>
        )}
      </div>

      {/* Cashiers - Coming Soon */}
      <div
        className="border rounded-lg mb-6"
        data-testid="sync-section-cashiers"
      >
        <EntitySectionHeader
          title="Cashiers"
          icon={Users}
          totalCount={0}
          selectedCount={0}
          isEnabled={false}
          onToggleEnabled={() => {}}
          onSelectAll={() => {}}
          onDeselectAll={() => {}}
          disabled
          comingSoon
        />
      </div>

      {/* Auto-Sync Schedule Section */}
      <div className="border-t pt-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <p className="font-medium text-gray-800">Auto-Sync</p>
            <p className="text-sm text-gray-500">
              Automatically sync data on a schedule
            </p>
          </div>
          <Switch
            id="auto-sync"
            checked={syncOptions.autoSyncEnabled}
            onCheckedChange={(checked: boolean) =>
              onSyncOptionsChange({ autoSyncEnabled: checked })
            }
            data-testid="auto-sync-toggle"
          />
        </div>

        {/* Sync Frequency Selection */}
        <div
          className={cn(
            "transition-opacity",
            !syncOptions.autoSyncEnabled && "opacity-50 pointer-events-none",
          )}
        >
          <Label className="block text-sm font-medium text-gray-700 mb-2">
            Sync Frequency
          </Label>
          <div className="grid grid-cols-4 gap-2">
            {SYNC_INTERVAL_OPTIONS.map((option) => {
              const isSelected =
                syncOptions.syncIntervalMinutes === option.value;

              return (
                <label
                  key={option.value}
                  className={cn(
                    "flex items-center justify-center p-3 border rounded-lg cursor-pointer transition-colors text-sm",
                    "hover:bg-gray-50",
                    isSelected && "border-blue-500 bg-blue-50",
                  )}
                  data-testid={`sync-interval-${option.value}`}
                >
                  <input
                    type="radio"
                    name="sync-interval"
                    value={option.value}
                    checked={isSelected}
                    onChange={() =>
                      onSyncOptionsChange({ syncIntervalMinutes: option.value })
                    }
                    className="sr-only"
                    disabled={!syncOptions.autoSyncEnabled}
                  />
                  {option.label}
                </label>
              );
            })}
          </div>
        </div>
      </div>

      {/* Selection Summary */}
      <div className="mt-6 p-4 bg-blue-50 rounded-lg">
        <p className="text-sm font-medium text-blue-800">Selection Summary</p>
        <div className="mt-2 text-sm text-blue-700 space-y-1">
          {syncOptions.syncDepartments && (
            <p>
              • {selectedDeptCount} department
              {selectedDeptCount !== 1 ? "s" : ""} selected
            </p>
          )}
          {syncOptions.syncTenders && (
            <p>
              • {selectedTenderCount} tender type
              {selectedTenderCount !== 1 ? "s" : ""} selected
            </p>
          )}
          {syncOptions.syncTaxRates && (
            <p>
              • {selectedTaxCount} tax rate{selectedTaxCount !== 1 ? "s" : ""}{" "}
              selected
            </p>
          )}
          {!syncOptions.syncDepartments &&
            !syncOptions.syncTenders &&
            !syncOptions.syncTaxRates && (
              <p className="text-blue-500">No categories selected for import</p>
            )}
        </div>
      </div>

      {/* Navigation */}
      <div className="flex justify-between mt-6">
        <Button
          variant="outline"
          onClick={onBack}
          className="px-6"
          data-testid="step3-back-button"
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back
        </Button>
        <Button
          onClick={onNext}
          disabled={!canProceed}
          className={cn("px-6", "bg-blue-600 hover:bg-blue-700 text-white")}
          data-testid="step3-next-button"
        >
          Next
          <ArrowRight className="ml-2 h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

export default Step3SyncOptions;

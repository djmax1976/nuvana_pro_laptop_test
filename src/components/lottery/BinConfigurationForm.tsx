"use client";

/**
 * Bin Configuration Form Component
 * Form for configuring lottery bins for a store
 *
 * Story 6.13: Lottery Database Enhancements & Bin Management
 * AC #1: Configure bins, set names/locations/display order, add/remove bins, save configuration
 */

import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Plus, Trash2, ArrowUp, ArrowDown } from "lucide-react";
import {
  getBinConfiguration,
  createBinConfiguration,
  updateBinConfiguration,
  type BinConfigurationItem,
} from "@/lib/api/lottery";

interface BinConfigurationFormProps {
  storeId: string;
}

/**
 * Bin item in form state
 */
interface BinFormItem extends BinConfigurationItem {
  id: string; // Temporary ID for form management
}

export function BinConfigurationForm({ storeId }: BinConfigurationFormProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Form state
  const [bins, setBins] = useState<BinFormItem[]>([]);
  const [hasChanges, setHasChanges] = useState(false);
  const [initialBins, setInitialBins] = useState<BinFormItem[]>([]);

  // Fetch existing configuration
  const {
    data: configData,
    isLoading: isLoadingConfig,
    isError: isConfigError,
    error: configError,
  } = useQuery({
    queryKey: ["bin-configuration", storeId],
    queryFn: async () => {
      try {
        const response = await getBinConfiguration(storeId);
        if (response.success) {
          return response.data;
        }
        // If no config exists, return null (will show initial setup)
        return null;
      } catch (error: any) {
        // 404 means no config exists yet - this is fine
        if (error?.status === 404) {
          return null;
        }
        throw error;
      }
    },
    enabled: !!storeId,
  });

  // Initialize form when config loads
  useEffect(() => {
    if (configData) {
      const formBins: BinFormItem[] = configData.bin_template.map(
        (bin, index) => ({
          ...bin,
          id: `bin-${index}`,
        }),
      );
      setBins(formBins);
      setInitialBins(formBins);
      setHasChanges(false);
    } else if (configData === null && !isLoadingConfig) {
      // No config exists - show initial setup with default bins
      const defaultBins: BinFormItem[] = Array.from({ length: 24 }, (_, i) => ({
        id: `bin-${i}`,
        name: `Bin ${i + 1}`,
        location: "",
        display_order: i,
      }));
      setBins(defaultBins);
      setInitialBins(defaultBins);
      setHasChanges(false);
    }
  }, [configData, isLoadingConfig]);

  // Save mutation
  const saveMutation = useMutation({
    mutationFn: async (binTemplate: BinConfigurationItem[]) => {
      if (configData) {
        // Update existing config
        const response = await updateBinConfiguration(storeId, {
          bin_template: binTemplate,
        });
        if (!response.success) {
          throw new Error("Failed to update bin configuration");
        }
        return response.data;
      } else {
        // Create new config
        const response = await createBinConfiguration(storeId, {
          bin_template: binTemplate,
        });
        if (!response.success) {
          throw new Error("Failed to create bin configuration");
        }
        return response.data;
      }
    },
    onSuccess: (data) => {
      queryClient.setQueryData(["bin-configuration", storeId], data);
      setInitialBins(
        data.bin_template.map((bin, index) => ({
          ...bin,
          id: `bin-${index}`,
        })),
      );
      setHasChanges(false);
      toast({
        title: "Configuration saved",
        description: "Bin configuration has been saved successfully.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Save failed",
        description: error.message || "Failed to save bin configuration",
        variant: "destructive",
      });
    },
  });

  // Validation
  const validateBins = (): { valid: boolean; errors: string[] } => {
    const errors: string[] = [];

    // Check bin count (1-200)
    if (bins.length < 1) {
      errors.push("At least 1 bin is required");
    }
    if (bins.length > 200) {
      errors.push("Maximum 200 bins allowed per store");
    }

    // Check for duplicate display orders
    const displayOrders = bins.map((b) => b.display_order);
    const uniqueOrders = new Set(displayOrders);
    if (displayOrders.length !== uniqueOrders.size) {
      errors.push("Display orders must be unique");
    }

    // Check for empty names
    const emptyNames = bins.filter((b) => !b.name || b.name.trim() === "");
    if (emptyNames.length > 0) {
      errors.push("All bins must have a name");
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  };

  // Handlers
  const handleBinChange = (
    index: number,
    field: keyof BinFormItem,
    value: string | number,
  ) => {
    setBins((prev) => {
      const updated = [...prev];
      // eslint-disable-next-line security/detect-object-injection
      updated[index] = { ...updated[index], [field]: value };
      // Auto-update display_order if reordering
      if (field === "display_order") {
        // Reorder all bins to maintain sequential order
        updated.sort((a, b) => a.display_order - b.display_order);
        updated.forEach((bin, i) => {
          bin.display_order = i;
        });
      }
      return updated;
    });
    setHasChanges(true);
  };

  const handleAddBin = () => {
    const newOrder = bins.length;
    const newBin: BinFormItem = {
      id: `bin-${Date.now()}`,
      name: `Bin ${newOrder + 1}`,
      location: "",
      display_order: newOrder,
    };
    setBins((prev) => [...prev, newBin]);
    setHasChanges(true);
  };

  const handleRemoveBin = (index: number) => {
    if (bins.length <= 1) {
      toast({
        title: "Cannot remove",
        description: "At least one bin is required",
        variant: "destructive",
      });
      return;
    }
    setBins((prev) => {
      const updated = prev.filter((_, i) => i !== index);
      // Reorder remaining bins
      updated.forEach((bin, i) => {
        bin.display_order = i;
      });
      return updated;
    });
    setHasChanges(true);
  };

  const handleMoveUp = (index: number) => {
    if (index === 0) return;
    setBins((prev) => {
      const updated = [...prev];
      // eslint-disable-next-line security/detect-object-injection
      const temp = updated[index - 1];
      // eslint-disable-next-line security/detect-object-injection
      updated[index - 1] = updated[index];
      // eslint-disable-next-line security/detect-object-injection
      updated[index] = temp;
      // Update display orders
      updated.forEach((bin, i) => {
        bin.display_order = i;
      });
      return updated;
    });
    setHasChanges(true);
  };

  const handleMoveDown = (index: number) => {
    if (index === bins.length - 1) return;
    setBins((prev) => {
      const updated = [...prev];
      // eslint-disable-next-line security/detect-object-injection
      const temp = updated[index];
      // eslint-disable-next-line security/detect-object-injection
      updated[index] = updated[index + 1];
      // eslint-disable-next-line security/detect-object-injection
      updated[index + 1] = temp;
      // Update display orders
      updated.forEach((bin, i) => {
        bin.display_order = i;
      });
      return updated;
    });
    setHasChanges(true);
  };

  const handleSave = () => {
    const validation = validateBins();
    if (!validation.valid) {
      toast({
        title: "Validation failed",
        description: validation.errors.join(", "),
        variant: "destructive",
      });
      return;
    }

    // Prepare bin template (remove temporary IDs)
    const binTemplate: BinConfigurationItem[] = bins.map((bin) => ({
      name: bin.name.trim(),
      location: bin.location?.trim() || undefined,
      display_order: bin.display_order,
    }));

    saveMutation.mutate(binTemplate);
  };

  // Loading state
  if (isLoadingConfig) {
    return (
      <div className="rounded-lg border p-8 text-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground mx-auto" />
        <p className="text-muted-foreground mt-4">
          Loading bin configuration...
        </p>
      </div>
    );
  }

  // Error state
  if (isConfigError && configError && (configError as any)?.status !== 404) {
    return (
      <div className="rounded-lg border border-destructive p-8 text-center">
        <p className="text-destructive">
          Failed to load bin configuration:{" "}
          {configError instanceof Error ? configError.message : "Unknown error"}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6" data-testid="bin-configuration-form">
      {/* Header with Add and Save buttons */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Bin Configuration</h2>
          <p className="text-sm text-muted-foreground">
            Configure {bins.length} bin{bins.length !== 1 ? "s" : ""} for this
            store
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            onClick={handleAddBin}
            variant="outline"
            size="sm"
            data-testid="add-bin-button"
          >
            <Plus className="h-4 w-4 mr-2" />
            Add Bin
          </Button>
          <Button
            onClick={handleSave}
            disabled={!hasChanges || saveMutation.isPending}
            data-testid="save-configuration-button"
          >
            {saveMutation.isPending ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Saving...
              </>
            ) : (
              "Save Configuration"
            )}
          </Button>
        </div>
      </div>

      {/* Bin List */}
      <div className="space-y-4">
        {bins.map((bin, index) => (
          <div
            key={bin.id}
            className="rounded-lg border p-4 space-y-4"
            data-testid={`bin-item-${index}`}
          >
            <div className="flex items-start justify-between">
              <div className="flex-1 grid grid-cols-1 md:grid-cols-3 gap-4">
                {/* Bin Name */}
                <div className="space-y-2">
                  <Label htmlFor={`bin-name-${index}`}>
                    Bin Name <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id={`bin-name-${index}`}
                    value={bin.name}
                    onChange={(e) =>
                      handleBinChange(index, "name", e.target.value)
                    }
                    placeholder="Bin name"
                    data-testid={`bin-name-input-${index}`}
                  />
                </div>

                {/* Location */}
                <div className="space-y-2">
                  <Label htmlFor={`bin-location-${index}`}>Location</Label>
                  <Input
                    id={`bin-location-${index}`}
                    value={bin.location || ""}
                    onChange={(e) =>
                      handleBinChange(index, "location", e.target.value)
                    }
                    placeholder="Physical location"
                    data-testid={`bin-location-input-${index}`}
                  />
                </div>

                {/* Display Order (read-only, shown for reference) */}
                <div className="space-y-2">
                  <Label htmlFor={`bin-order-${index}`}>Display Order</Label>
                  <Input
                    id={`bin-order-${index}`}
                    value={bin.display_order}
                    readOnly
                    className="bg-muted"
                    data-testid={`bin-order-input-${index}`}
                  />
                </div>
              </div>

              {/* Actions */}
              <div className="flex gap-1 ml-4">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleMoveUp(index)}
                  disabled={index === 0}
                  data-testid={`bin-move-up-${index}`}
                  aria-label="Move up"
                >
                  <ArrowUp className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleMoveDown(index)}
                  disabled={index === bins.length - 1}
                  data-testid={`bin-move-down-${index}`}
                  aria-label="Move down"
                >
                  <ArrowDown className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleRemoveBin(index)}
                  disabled={bins.length <= 1}
                  data-testid={`bin-remove-${index}`}
                  aria-label="Remove bin"
                >
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Empty state */}
      {bins.length === 0 && (
        <div className="rounded-lg border border-dashed p-8 text-center">
          <p className="text-muted-foreground">No bins configured</p>
          <Button
            onClick={handleAddBin}
            variant="outline"
            className="mt-4"
            data-testid="add-first-bin-button"
          >
            <Plus className="h-4 w-4 mr-2" />
            Add First Bin
          </Button>
        </div>
      )}
    </div>
  );
}

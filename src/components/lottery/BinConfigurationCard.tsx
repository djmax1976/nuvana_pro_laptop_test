"use client";

/**
 * Bin Configuration Card Component
 * Placeholder UI for configuring the number of lottery bins per store
 *
 * This is a simplified interface that allows setting the number of bins.
 * The actual bin reconciliation and detailed configuration will be
 * implemented in the MyStore dashboard.
 */

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Settings, Check, AlertCircle } from "lucide-react";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

interface BinConfigurationCardProps {
  storeId: string;
  storeName: string;
}

interface BinTemplate {
  name: string;
  location?: string;
  display_order: number;
}

interface BinConfiguration {
  config_id: string;
  store_id: string;
  bin_template: BinTemplate[];
  created_at: string;
  updated_at: string;
}

/**
 * Generate bin template array from count
 */
function generateBinTemplate(count: number): BinTemplate[] {
  return Array.from({ length: count }, (_, i) => ({
    name: `Bin ${i + 1}`,
    display_order: i,
  }));
}

/**
 * BinConfigurationCard component
 * Simple UI for setting number of bins per store
 */
export function BinConfigurationCard({
  storeId,
  storeName,
}: BinConfigurationCardProps) {
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [currentConfig, setCurrentConfig] = useState<BinConfiguration | null>(
    null,
  );
  const [binCount, setBinCount] = useState<number>(8); // Default 8 bins
  const [hasChanges, setHasChanges] = useState(false);

  // Fetch existing configuration
  useEffect(() => {
    const fetchConfig = async () => {
      setIsLoading(true);
      try {
        const response = await fetch(
          `${API_BASE_URL}/api/lottery/bins/configuration/${storeId}`,
          {
            credentials: "include",
          },
        );

        if (response.ok) {
          const data = await response.json();
          if (data.success && data.data) {
            setCurrentConfig(data.data);
            setBinCount(data.data.bin_template?.length || 8);
          }
        } else if (response.status === 404) {
          // No configuration exists yet - that's fine
          setCurrentConfig(null);
        }
      } catch (error) {
        console.error("Failed to fetch bin configuration:", error);
      } finally {
        setIsLoading(false);
      }
    };

    if (storeId) {
      fetchConfig();
    }
  }, [storeId]);

  // Track changes
  useEffect(() => {
    if (currentConfig) {
      const currentBinCount = currentConfig.bin_template?.length || 0;
      setHasChanges(binCount !== currentBinCount);
    } else {
      setHasChanges(true); // New config always has changes
    }
  }, [binCount, currentConfig]);

  // Handle bin count change
  const handleBinCountChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const value = parseInt(e.target.value, 10);
      if (!isNaN(value) && value >= 1 && value <= 50) {
        setBinCount(value);
      }
    },
    [],
  );

  // Save configuration
  const handleSave = useCallback(async () => {
    setIsSaving(true);
    try {
      const binTemplate = generateBinTemplate(binCount);
      const method = currentConfig ? "PUT" : "POST";

      const response = await fetch(
        `${API_BASE_URL}/api/lottery/bins/configuration/${storeId}`,
        {
          method,
          headers: {
            "Content-Type": "application/json",
          },
          credentials: "include",
          body: JSON.stringify({ bin_template: binTemplate }),
        },
      );

      if (response.ok) {
        const data = await response.json();
        if (data.success) {
          setCurrentConfig(data.data);
          setHasChanges(false);
          toast({
            title: "Configuration saved",
            description: `Bin configuration updated to ${binCount} bins for ${storeName}`,
          });
        }
      } else {
        const errorData = await response.json();
        throw new Error(
          errorData.error?.message || "Failed to save configuration",
        );
      }
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Failed to save configuration";
      toast({
        title: "Error",
        description: errorMessage,
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
    }
  }, [binCount, currentConfig, storeId, storeName, toast]);

  if (isLoading) {
    return (
      <Card className="w-full">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Settings className="h-5 w-5" />
            Bin Configuration
          </CardTitle>
        </CardHeader>
        <CardContent className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Settings className="h-5 w-5" />
          Bin Configuration
        </CardTitle>
        <CardDescription>
          Configure the number of lottery bins for this store. This will be used
          for bin assignment during pack activation and reconciliation.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Current Status */}
        {currentConfig ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Check className="h-4 w-4 text-green-500" />
            <span>
              Currently configured: {currentConfig.bin_template?.length || 0}{" "}
              bins
            </span>
          </div>
        ) : (
          <div className="flex items-center gap-2 text-sm text-amber-600">
            <AlertCircle className="h-4 w-4" />
            <span>No bin configuration set for this store</span>
          </div>
        )}

        {/* Bin Count Input */}
        <div className="space-y-2">
          <Label htmlFor="bin-count">Number of Bins</Label>
          <div className="flex items-center gap-4">
            <Input
              id="bin-count"
              type="number"
              min={1}
              max={50}
              value={binCount}
              onChange={handleBinCountChange}
              className="w-24"
              disabled={isSaving}
            />
            <span className="text-sm text-muted-foreground">
              (1-50 bins supported)
            </span>
          </div>
        </div>

        {/* Preview */}
        <div className="space-y-2">
          <Label className="text-muted-foreground">Preview</Label>
          <div className="flex flex-wrap gap-2">
            {Array.from({ length: Math.min(binCount, 12) }, (_, i) => (
              <div
                key={i}
                className="px-3 py-1 bg-muted rounded-md text-sm font-medium"
              >
                Bin {i + 1}
              </div>
            ))}
            {binCount > 12 && (
              <div className="px-3 py-1 text-sm text-muted-foreground">
                +{binCount - 12} more
              </div>
            )}
          </div>
        </div>

        {/* Save Button */}
        <div className="pt-2">
          <Button
            onClick={handleSave}
            disabled={isSaving || !hasChanges}
            className="w-full sm:w-auto"
          >
            {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {currentConfig ? "Update Configuration" : "Save Configuration"}
          </Button>
        </div>

        {/* Future Feature Notice */}
        <div className="mt-4 p-3 bg-muted/50 rounded-md">
          <p className="text-sm text-muted-foreground">
            <strong>Coming Soon:</strong> Detailed bin reconciliation and
            management will be available in the MyStore dashboard, allowing
            cashiers to assign packs to specific bins and reconcile inventory.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

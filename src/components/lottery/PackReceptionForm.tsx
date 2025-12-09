"use client";

/**
 * Pack Reception Form Component
 * Form for receiving lottery packs via 24-digit serialized numbers
 *
 * Story: 6.12 - Serialized Pack Reception with Batch Processing
 * AC #1, #2, #3, #4, #5: Serialized input, parsing, validation, batch submission
 */

import {
  useState,
  useCallback,
  useRef,
  useEffect,
  type ChangeEvent,
} from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { Loader2, X } from "lucide-react";
import { receivePackBatch } from "@/lib/api/lottery";
import { parseSerializedNumber } from "@/lib/utils/lottery-serial-parser";

/**
 * Pack item in reception list
 */
interface PackItem {
  serial: string;
  game_code: string;
  pack_number: string;
  serial_start: string;
  game_name?: string;
  game_id?: string;
  error?: string;
  isValidating?: boolean;
}

interface PackReceptionFormProps {
  storeId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

/**
 * PackReceptionForm component
 * Dialog form for receiving lottery packs via serialized numbers
 * Supports batch processing with auto-generating input fields
 */
export function PackReceptionForm({
  storeId,
  open,
  onOpenChange,
  onSuccess,
}: PackReceptionFormProps) {
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [packList, setPackList] = useState<PackItem[]>([]);
  const [inputValue, setInputValue] = useState<string>("");
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceTimer = useRef<NodeJS.Timeout | null>(null);

  // Clear debounce timer on unmount
  useEffect(() => {
    return () => {
      if (debounceTimer.current) {
        clearTimeout(debounceTimer.current);
      }
    };
  }, []);

  // Reset form when dialog closes
  useEffect(() => {
    if (!open) {
      setPackList([]);
      setInputValue("");
      if (debounceTimer.current) {
        clearTimeout(debounceTimer.current);
        debounceTimer.current = null;
      }
    }
  }, [open]);

  // Maintain focus on input after clearing
  useEffect(() => {
    if (open && inputRef.current) {
      inputRef.current.focus();
    }
  }, [open, packList.length]);

  /**
   * Clear input and refocus for next entry
   */
  const clearInputAndFocus = useCallback(() => {
    setInputValue("");
    // Focus will be maintained via the useEffect that triggers on packList.length changes
  }, []);

  /**
   * Parse and add serialized number to list
   * Client-side parsing only - validation happens on batch submit
   */
  const handleSerialComplete = useCallback(
    (serial: string): void => {
      // Validate format first (client-side)
      if (!/^\d{24}$/.test(serial)) {
        // Not yet 24 digits - wait for more input
        return;
      }

      try {
        // Parse serial client-side
        const parsed = parseSerializedNumber(serial);

        // Check if pack already exists in list (duplicate in same session)
        const existingPack = packList.find((p) => p.serial === serial);
        if (existingPack) {
          toast({
            title: "Duplicate pack",
            description: "Pack already exists in reception list",
            variant: "destructive",
          });
          // Clear input and maintain focus for retry
          clearInputAndFocus();
          return;
        }

        // Add to list optimistically (validation happens on submit)
        const newPack: PackItem = {
          serial,
          game_code: parsed.game_code,
          pack_number: parsed.pack_number,
          serial_start: parsed.serial_start,
        };

        setPackList((prev) => [...prev, newPack]);

        // Clear input for next entry (focus maintained via useEffect)
        clearInputAndFocus();
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : "Invalid serial format";
        toast({
          title: "Invalid serial",
          description: errorMessage,
          variant: "destructive",
        });
        // Clear input on error too
        clearInputAndFocus();
      }
    },
    [packList, toast, clearInputAndFocus],
  );

  /**
   * Handle input change with debouncing
   */
  const handleInputChange = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      const cleanedValue = e.target.value.replace(/\D/g, ""); // Only allow digits
      setInputValue(cleanedValue);

      // Clear existing debounce timer
      if (debounceTimer.current) {
        clearTimeout(debounceTimer.current);
      }

      // Set new debounce timer (400ms delay)
      debounceTimer.current = setTimeout(() => {
        if (cleanedValue.length === 24) {
          handleSerialComplete(cleanedValue);
        }
      }, 400);
    },
    [handleSerialComplete],
  );

  /**
   * Remove pack from list
   */
  const handleRemovePack = useCallback((index: number) => {
    setPackList((prev) => prev.filter((_, i) => i !== index));
  }, []);

  /**
   * Handle batch submission
   */
  const handleSubmit = useCallback(async () => {
    if (packList.length === 0) {
      toast({
        title: "No packs to receive",
        description: "Please enter at least one valid pack",
        variant: "destructive",
      });
      return;
    }

    setIsSubmitting(true);
    try {
      // Submit all packs via batch API
      const serials = packList.map((pack) => pack.serial);
      const response = await receivePackBatch({
        serialized_numbers: serials,
        store_id: storeId,
      });

      if (response.success && response.data) {
        const createdCount = response.data.created.length;
        const duplicateCount = response.data.duplicates.length;
        const errorCount = response.data.errors.length;

        if (createdCount > 0) {
          toast({
            title: "Packs received",
            description: `Successfully received ${createdCount} pack(s)${
              duplicateCount > 0
                ? `, ${duplicateCount} duplicate(s) skipped`
                : ""
            }${errorCount > 0 ? `, ${errorCount} error(s)` : ""}`,
          });
        } else {
          // Build detailed error message
          let errorDetails = "All packs were duplicates or had errors.";
          if (response.data.errors.length > 0) {
            // Show first error for brevity, include serial for debugging
            const firstError = response.data.errors[0];
            errorDetails = `Error: ${firstError.error}`;
            if (response.data.errors.length > 1) {
              errorDetails += ` (+${response.data.errors.length - 1} more errors)`;
            }
          } else if (duplicateCount > 0) {
            errorDetails = `All ${duplicateCount} pack(s) already exist in the system.`;
          }
          toast({
            title: "No packs received",
            description: errorDetails,
            variant: "destructive",
          });
          return;
        }

        // Reset form
        setPackList([]);
        setInputValue("");
        onOpenChange(false);
        onSuccess?.();
      } else {
        throw new Error("Batch submission failed");
      }
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Failed to receive packs";
      toast({
        title: "Error",
        description: errorMessage,
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  }, [packList, storeId, toast, onOpenChange, onSuccess]);

  const handleOpenChange = (newOpen: boolean) => {
    if (!isSubmitting) {
      onOpenChange(newOpen);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Receive Lottery Packs</DialogTitle>
          <DialogDescription>
            Enter 24-digit serialized numbers to receive multiple packs. The
            form will automatically validate and add packs to the reception
            list.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Single Input Field */}
          <div className="space-y-2">
            <label htmlFor="serial-input" className="text-sm font-medium">
              Serialized Number (24 digits)
            </label>
            <Input
              id="serial-input"
              ref={inputRef}
              value={inputValue}
              onChange={handleInputChange}
              placeholder="000000000000000000000000"
              disabled={isSubmitting}
              maxLength={24}
              data-testid="serial-input"
              className="font-mono"
              autoFocus
              aria-label="Enter 24-digit serialized number"
            />
          </div>

          {/* Pack List */}
          {packList.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium">
                  Packs Ready to Receive ({packList.length})
                </label>
              </div>
              <div className="border rounded-md divide-y max-h-60 overflow-y-auto">
                {packList.map((pack, index) => (
                  <div
                    key={index}
                    className="p-3 flex items-center justify-between hover:bg-muted/50"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="font-medium truncate">
                        {pack.game_name || `Game ${pack.game_code}`}
                      </div>
                      <div className="text-sm text-muted-foreground">
                        Pack: {pack.pack_number} | Serial Start:{" "}
                        {pack.serial_start}
                      </div>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => handleRemovePack(index)}
                      disabled={isSubmitting}
                      data-testid={`remove-pack-${index}`}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => handleOpenChange(false)}
            disabled={isSubmitting}
          >
            Cancel
          </Button>
          <Button
            type="button"
            onClick={handleSubmit}
            disabled={isSubmitting || packList.length === 0}
            data-testid="submit-batch-reception"
          >
            {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Receive {packList.length > 0 ? `${packList.length} ` : ""}Pack
            {packList.length !== 1 ? "s" : ""}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

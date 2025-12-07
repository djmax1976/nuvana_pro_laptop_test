"use client";

/**
 * Pack Activation Form Component
 * Form for activating a lottery pack (changing status from RECEIVED to ACTIVE)
 *
 * Story: 6.10 - Lottery Management UI
 * AC #3: Pack activation form with pack selection (filtered to RECEIVED status)
 */

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Loader2 } from "lucide-react";

/**
 * Pack option for dropdown (filtered to RECEIVED status)
 */
export interface PackOption {
  pack_id: string;
  pack_number: string;
  game: {
    game_id: string;
    name: string;
  };
  serial_start: string;
  serial_end: string;
}

interface PackActivationFormProps {
  packs: PackOption[]; // Should be filtered to RECEIVED status packs only
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
  onActivate: (packId: string) => Promise<void>;
}

/**
 * PackActivationForm component
 * Dialog form for activating a lottery pack
 * Filters packs to RECEIVED status only
 */
export function PackActivationForm({
  packs,
  open,
  onOpenChange,
  onSuccess,
  onActivate,
}: PackActivationFormProps) {
  const { toast } = useToast();
  const [selectedPackId, setSelectedPackId] = useState<string>("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const selectedPack = packs.find((p) => p.pack_id === selectedPackId);

  const handleActivate = async () => {
    if (!selectedPackId) {
      toast({
        title: "Error",
        description: "Please select a pack to activate",
        variant: "destructive",
      });
      return;
    }

    setIsSubmitting(true);
    try {
      await onActivate(selectedPackId);

      toast({
        title: "Pack activated",
        description: `Pack ${selectedPack?.pack_number || selectedPackId} has been activated successfully.`,
      });

      setSelectedPackId("");
      onOpenChange(false);
      onSuccess?.();
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Failed to activate pack";
      toast({
        title: "Error",
        description: errorMessage,
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleOpenChange = (newOpen: boolean) => {
    if (!isSubmitting) {
      onOpenChange(newOpen);
      if (!newOpen) {
        setSelectedPackId("");
      }
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Activate Lottery Pack</DialogTitle>
          <DialogDescription>
            Select a pack with RECEIVED status to activate. The pack status will
            change to ACTIVE.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="pack-select">Pack</Label>
            <Select
              value={selectedPackId}
              onValueChange={setSelectedPackId}
              disabled={isSubmitting}
            >
              <SelectTrigger id="pack-select" data-testid="pack-select">
                <SelectValue placeholder="Select a pack to activate" />
              </SelectTrigger>
              <SelectContent>
                {packs.length === 0 ? (
                  <SelectItem value="no-packs" disabled>
                    No packs with RECEIVED status available
                  </SelectItem>
                ) : (
                  packs.map((pack) => (
                    <SelectItem
                      key={pack.pack_id}
                      value={pack.pack_id}
                      data-testid={`pack-option-${pack.pack_id}`}
                    >
                      {pack.pack_number} - {pack.game.name} ({pack.serial_start}{" "}
                      - {pack.serial_end})
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
            {selectedPack && (
              <div className="rounded-md border p-3 text-sm">
                <div className="font-medium">Pack Details</div>
                <div className="mt-1 space-y-1 text-muted-foreground">
                  <div>Game: {selectedPack.game.name}</div>
                  <div>
                    Serial Range: {selectedPack.serial_start} -{" "}
                    {selectedPack.serial_end}
                  </div>
                </div>
              </div>
            )}
          </div>
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
            onClick={handleActivate}
            disabled={isSubmitting || !selectedPackId}
          >
            {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Activate Pack
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

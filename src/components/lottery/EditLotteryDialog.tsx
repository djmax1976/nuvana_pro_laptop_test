"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { Loader2 } from "lucide-react";
import { useState, useEffect } from "react";
import { type LotteryPackResponse } from "@/lib/api/lottery";
import { usePackDetails, useUpdatePack } from "@/hooks/useLottery";

/**
 * Form validation schema matching backend pack update schema
 * Mirrors backend validation client-side for immediate feedback
 * Same schema as AddLotteryDialog for consistency
 */
const editLotteryFormSchema = z
  .object({
    game_id: z.string().uuid("Game must be selected"),
    pack_number: z
      .string()
      .min(1, "Pack number is required")
      .max(50, "Pack number must be 50 characters or less")
      .trim(),
    serial_start: z
      .string()
      .min(1, "Serial start is required")
      .max(100, "Serial start must be 100 characters or less")
      .regex(/^\d+$/, "Serial start must contain only numeric characters")
      .trim(),
    serial_end: z
      .string()
      .min(1, "Serial end is required")
      .max(100, "Serial end must be 100 characters or less")
      .regex(/^\d+$/, "Serial end must contain only numeric characters")
      .trim(),
    bin_id: z
      .string()
      .uuid("Bin must be a valid UUID")
      .optional()
      .or(z.literal("")),
  })
  .refine(
    (data) => {
      const start = parseInt(data.serial_start, 10);
      const end = parseInt(data.serial_end, 10);
      if (isNaN(start) || isNaN(end)) {
        return false;
      }
      return end >= start;
    },
    {
      message: "Serial end must be greater than or equal to serial start",
      path: ["serial_end"],
    },
  );

type EditLotteryFormValues = z.infer<typeof editLotteryFormSchema>;

interface EditLotteryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  packId: string | null;
  onSuccess?: () => void;
}

/**
 * EditLotteryDialog component
 * Dialog form for editing an existing lottery pack
 * Uses React Hook Form with Zod validation matching backend schema
 *
 * @requirements
 * - AC #5: Edit icon button opens form/modal with lottery pack details
 * - AC #5: Form allows modification of pack information
 * - AC #5: Form submission calls update API endpoint
 * - AC #5: Table refreshes after successful update
 * - AC #7: Error messages displayed for failed operations
 * - AC #7: Loading states shown during API calls
 */
export function EditLotteryDialog({
  open,
  onOpenChange,
  packId,
  onSuccess,
}: EditLotteryDialogProps) {
  const { toast } = useToast();
  const updatePackMutation = useUpdatePack();

  // Fetch pack details when dialog opens and packId is provided
  const {
    data: packData,
    isLoading: isLoadingPack,
    isError: isPackError,
    error: packError,
  } = usePackDetails(packId, { enabled: open && !!packId });

  const form = useForm<EditLotteryFormValues>({
    resolver: zodResolver(editLotteryFormSchema),
    defaultValues: {
      game_id: "",
      pack_number: "",
      serial_start: "",
      serial_end: "",
      bin_id: "",
    },
  });

  // Populate form when pack data loads
  useEffect(() => {
    if (packData && open) {
      form.reset({
        game_id: packData.game_id,
        pack_number: packData.pack_number,
        serial_start: packData.serial_start,
        serial_end: packData.serial_end,
        bin_id: packData.current_bin_id || "",
      });
    }
  }, [packData, open, form]);

  // Reset form when dialog closes
  useEffect(() => {
    if (!open) {
      form.reset({
        game_id: "",
        pack_number: "",
        serial_start: "",
        serial_end: "",
        bin_id: "",
      });
    }
  }, [open, form]);

  const handleSubmit = async (values: EditLotteryFormValues) => {
    if (!packId) {
      toast({
        title: "Error",
        description: "Pack ID is required",
        variant: "destructive",
      });
      return;
    }

    try {
      const response = await updatePackMutation.mutateAsync({
        packId,
        data: {
          game_id: values.game_id,
          pack_number: values.pack_number,
          serial_start: values.serial_start,
          serial_end: values.serial_end,
          bin_id: values.bin_id || undefined,
        },
      });

      if (response.success) {
        toast({
          title: "Pack updated",
          description: `Pack ${values.pack_number} has been updated successfully.`,
        });

        form.reset();
        onOpenChange(false);
        onSuccess?.();
      } else {
        throw new Error(response.message || "Failed to update pack");
      }
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Failed to update pack";
      toast({
        title: "Error",
        description: errorMessage,
        variant: "destructive",
      });
    }
  };

  const handleOpenChange = (newOpen: boolean) => {
    if (!updatePackMutation.isPending) {
      onOpenChange(newOpen);
      if (!newOpen) {
        form.reset();
      }
    }
  };

  const isSubmitting = updatePackMutation.isPending;

  // Loading state while fetching pack details
  if (isLoadingPack && open && packId) {
    return (
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Edit Lottery Pack</DialogTitle>
            <DialogDescription>Loading pack details...</DialogDescription>
          </DialogHeader>
          <div className="flex items-center justify-center p-8">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  // Error state if pack details fail to load
  if (isPackError && open && packId) {
    return (
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Edit Lottery Pack</DialogTitle>
            <DialogDescription>Failed to load pack details</DialogDescription>
          </DialogHeader>
          <div className="p-4 text-center">
            <p className="text-destructive">
              {packError?.message || "Unknown error"}
            </p>
            <Button
              variant="outline"
              onClick={() => handleOpenChange(false)}
              className="mt-4"
            >
              Close
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  // TODO: Fetch games and bins from API (Task 7)
  // For now, using empty arrays - will be populated when API functions are added
  const games: Array<{ game_id: string; name: string }> = [];
  const bins: Array<{ bin_id: string; name: string }> = [];

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        className="sm:max-w-[500px] max-h-[90vh] overflow-y-auto"
        aria-describedby="edit-lottery-description"
      >
        <DialogHeader>
          <DialogTitle>Edit Lottery Pack</DialogTitle>
          <DialogDescription id="edit-lottery-description">
            Modify pack information. Changes will update the existing lottery
            pack.
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form
            onSubmit={form.handleSubmit(handleSubmit)}
            className="space-y-4"
          >
            {/* Game Selection */}
            <FormField
              control={form.control}
              name="game_id"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Game</FormLabel>
                  <Select
                    onValueChange={field.onChange}
                    value={field.value}
                    disabled={updatePackMutation.isPending}
                  >
                    <FormControl>
                      <SelectTrigger data-testid="game-select">
                        <SelectValue placeholder="Select a game" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {/* Show current game from pack data if available */}
                      {packData?.game_id && (
                        <SelectItem
                          key={packData.game_id}
                          value={packData.game_id}
                          data-testid={`game-option-${packData.game_id}`}
                        >
                          {packData.game?.name || `Game ${packData.game_id}`}
                        </SelectItem>
                      )}
                      {games.length === 0 && !packData?.game_id ? (
                        <SelectItem value="no-games" disabled>
                          No games available (TODO: Fetch from API)
                        </SelectItem>
                      ) : (
                        games
                          .filter((game) => game.game_id !== packData?.game_id)
                          .map((game) => (
                            <SelectItem
                              key={game.game_id}
                              value={game.game_id}
                              data-testid={`game-option-${game.game_id}`}
                            >
                              {game.name}
                            </SelectItem>
                          ))
                      )}
                    </SelectContent>
                  </Select>
                  <FormDescription>
                    Select the lottery game for this pack
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Pack Number */}
            <FormField
              control={form.control}
              name="pack_number"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Pack Number</FormLabel>
                  <FormControl>
                    <Input
                      {...field}
                      placeholder="PACK-001"
                      disabled={updatePackMutation.isPending}
                      data-testid="pack-number-input"
                      maxLength={50}
                    />
                  </FormControl>
                  <FormDescription>
                    Unique pack number (max 50 characters)
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Serial Start */}
            <FormField
              control={form.control}
              name="serial_start"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Serial Start</FormLabel>
                  <FormControl>
                    <Input
                      {...field}
                      placeholder="0001"
                      disabled={updatePackMutation.isPending}
                      data-testid="serial-start-input"
                      maxLength={100}
                    />
                  </FormControl>
                  <FormDescription>
                    Starting serial number (numeric only)
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Serial End */}
            <FormField
              control={form.control}
              name="serial_end"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Serial End</FormLabel>
                  <FormControl>
                    <Input
                      {...field}
                      placeholder="9999"
                      disabled={updatePackMutation.isPending}
                      data-testid="serial-end-input"
                      maxLength={100}
                    />
                  </FormControl>
                  <FormDescription>
                    Ending serial number (numeric only, must be greater than or
                    equal to start)
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Bin Assignment (Optional) */}
            <FormField
              control={form.control}
              name="bin_id"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Bin (Optional)</FormLabel>
                  <Select
                    onValueChange={(value) =>
                      field.onChange(value === "none" ? "" : value)
                    }
                    value={field.value || "none"}
                    disabled={updatePackMutation.isPending}
                  >
                    <FormControl>
                      <SelectTrigger data-testid="bin-select">
                        <SelectValue placeholder="Select a bin (optional)" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="none">None</SelectItem>
                      {bins.length === 0 ? (
                        <SelectItem value="no-bins" disabled>
                          No bins available (TODO: Fetch from API)
                        </SelectItem>
                      ) : (
                        bins.map((bin) => (
                          <SelectItem
                            key={bin.bin_id}
                            value={bin.bin_id}
                            data-testid={`bin-option-${bin.bin_id}`}
                          >
                            {bin.name}
                          </SelectItem>
                        ))
                      )}
                    </SelectContent>
                  </Select>
                  <FormDescription>
                    Assign pack to a storage bin (optional)
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => handleOpenChange(false)}
                disabled={updatePackMutation.isPending}
                className="focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={updatePackMutation.isPending}
                className="focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2"
                aria-label={
                  updatePackMutation.isPending
                    ? "Updating pack..."
                    : "Update lottery pack"
                }
              >
                {updatePackMutation.isPending && (
                  <Loader2
                    className="mr-2 h-4 w-4 animate-spin"
                    aria-hidden="true"
                  />
                )}
                Update Pack
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

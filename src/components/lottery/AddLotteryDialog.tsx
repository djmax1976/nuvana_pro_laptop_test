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
import { usePackReception } from "@/hooks/useLottery";
import { Loader2 } from "lucide-react";
import { useState, useEffect } from "react";

/**
 * Form validation schema matching backend pack reception schema
 * Mirrors backend validation client-side for immediate feedback
 */
const addLotteryFormSchema = z
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

type AddLotteryFormValues = z.infer<typeof addLotteryFormSchema>;

interface AddLotteryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  storeId?: string;
  onSuccess?: () => void;
}

/**
 * AddLotteryDialog component
 * Dialog form for adding a new lottery pack
 * Uses React Hook Form with Zod validation matching backend schema
 *
 * @requirements
 * - AC #4: "+ Add New Lottery" button opens form/modal
 * - AC #4: Form fields: game selection, pack_number, serial_start, serial_end, bin assignment
 * - AC #4: Form validation (required fields, serial range validation)
 * - AC #4: Integrate with POST /api/lottery/packs/receive API endpoint
 * - AC #4: Handle form submission with loading state
 * - AC #4: Display success/error messages
 * - AC #4: Refresh table after successful submission
 */
export function AddLotteryDialog({
  open,
  onOpenChange,
  storeId,
  onSuccess,
}: AddLotteryDialogProps) {
  const { toast } = useToast();
  const packReceptionMutation = usePackReception();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const form = useForm<AddLotteryFormValues>({
    resolver: zodResolver(addLotteryFormSchema),
    defaultValues: {
      game_id: "",
      pack_number: "",
      serial_start: "",
      serial_end: "",
      bin_id: "",
    },
  });

  // Reset form when dialog opens/closes
  useEffect(() => {
    if (open) {
      form.reset({
        game_id: "",
        pack_number: "",
        serial_start: "",
        serial_end: "",
        bin_id: "",
      });
    }
  }, [open, form]);

  const handleSubmit = async (values: AddLotteryFormValues) => {
    if (!storeId) {
      toast({
        title: "Error",
        description: "Store ID is required",
        variant: "destructive",
      });
      return;
    }

    setIsSubmitting(true);
    try {
      const response = await packReceptionMutation.mutateAsync({
        game_id: values.game_id,
        pack_number: values.pack_number,
        serial_start: values.serial_start,
        serial_end: values.serial_end,
        store_id: storeId,
        bin_id: values.bin_id || undefined,
      });

      if (response.success) {
        toast({
          title: "Pack received",
          description: `Pack ${values.pack_number} has been received successfully.`,
        });

        form.reset();
        onOpenChange(false);
        onSuccess?.();
      } else {
        throw new Error(response.message || "Failed to receive pack");
      }
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Failed to receive pack";
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
        form.reset();
      }
    }
  };

  // TODO: Fetch games and bins from API (Task 7)
  // For now, using empty arrays - will be populated when API functions are added
  const games: Array<{ game_id: string; name: string }> = [];
  const bins: Array<{ bin_id: string; name: string }> = [];

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        className="sm:max-w-[500px] max-h-[90vh] overflow-y-auto"
        aria-describedby="add-lottery-description"
      >
        <DialogHeader>
          <DialogTitle>Add New Lottery Pack</DialogTitle>
          <DialogDescription id="add-lottery-description">
            Enter pack information to create a new lottery pack. The pack will
            be created with RECEIVED status.
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
                    disabled={isSubmitting}
                  >
                    <FormControl>
                      <SelectTrigger data-testid="game-select">
                        <SelectValue placeholder="Select a game" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {games.length === 0 ? (
                        <SelectItem value="no-games" disabled>
                          No games available (TODO: Fetch from API)
                        </SelectItem>
                      ) : (
                        games.map((game) => (
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
                      disabled={isSubmitting}
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
                      disabled={isSubmitting}
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
                      disabled={isSubmitting}
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
                    disabled={isSubmitting}
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
                disabled={isSubmitting}
                className="focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={isSubmitting}
                className="focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2"
                aria-label={
                  isSubmitting ? "Creating pack..." : "Create lottery pack"
                }
              >
                {isSubmitting && (
                  <Loader2
                    className="mr-2 h-4 w-4 animate-spin"
                    aria-hidden="true"
                  />
                )}
                Create Pack
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

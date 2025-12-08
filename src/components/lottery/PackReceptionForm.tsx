"use client";

/**
 * Pack Reception Form Component
 * Form for receiving a new lottery pack
 *
 * Story: 6.10 - Lottery Management UI
 * AC #2: Pack reception form with game selection, pack_number, serial range, bin assignment
 */

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
import { useState } from "react";

/**
 * Form validation schema matching backend pack reception schema
 * Mirrors backend validation client-side for immediate feedback
 * Required: game_id, pack_number, serial_start, serial_end
 * Optional: bin_id
 */
const packReceptionFormSchema = z
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
      // Validate serial_end >= serial_start (numeric comparison)
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

type PackReceptionFormValues = z.infer<typeof packReceptionFormSchema>;

/**
 * Game option for dropdown
 */
export interface GameOption {
  game_id: string;
  name: string;
  description?: string;
}

/**
 * Bin option for dropdown
 */
export interface BinOption {
  bin_id: string;
  name: string;
  location?: string;
}

interface PackReceptionFormProps {
  storeId: string;
  games: GameOption[];
  bins?: BinOption[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
  onSubmit: (
    data: PackReceptionFormValues & { store_id: string },
  ) => Promise<void>;
}

/**
 * PackReceptionForm component
 * Dialog form for receiving a new lottery pack
 * Uses React Hook Form with Zod validation matching backend schema
 */
export function PackReceptionForm({
  storeId,
  games,
  bins = [],
  open,
  onOpenChange,
  onSuccess,
  onSubmit,
}: PackReceptionFormProps) {
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const form = useForm<PackReceptionFormValues>({
    resolver: zodResolver(packReceptionFormSchema),
    defaultValues: {
      game_id: "",
      pack_number: "",
      serial_start: "",
      serial_end: "",
      bin_id: "",
    },
  });

  const handleSubmit = async (values: PackReceptionFormValues) => {
    setIsSubmitting(true);
    try {
      await onSubmit({
        ...values,
        store_id: storeId,
        bin_id: values.bin_id || undefined,
      });

      toast({
        title: "Pack received",
        description: `Pack ${values.pack_number} has been received successfully.`,
      });

      form.reset();
      onOpenChange(false);
      onSuccess?.();
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

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Receive Lottery Pack</DialogTitle>
          <DialogDescription>
            Enter pack information to receive a new lottery pack. The pack will
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
                          No games available
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
                      placeholder="0100"
                      disabled={isSubmitting}
                      data-testid="serial-end-input"
                      maxLength={100}
                    />
                  </FormControl>
                  <FormDescription>
                    Ending serial number (must be &gt;= serial start, numeric
                    only)
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Bin Assignment (Optional) */}
            {bins.length > 0 && (
              <FormField
                control={form.control}
                name="bin_id"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Bin Assignment (Optional)</FormLabel>
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
                        {bins.map((bin) => (
                          <SelectItem
                            key={bin.bin_id}
                            value={bin.bin_id}
                            data-testid={`bin-option-${bin.bin_id}`}
                          >
                            {bin.name}
                            {bin.location && ` - ${bin.location}`}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormDescription>
                      Assign pack to a physical storage bin (optional)
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => handleOpenChange(false)}
                disabled={isSubmitting}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting && (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                )}
                Receive Pack
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

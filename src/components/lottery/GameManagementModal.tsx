"use client";

import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { useToast } from "@/hooks/use-toast";
import { Loader2, Save } from "lucide-react";
import { useUpdateGame } from "@/hooks/useLottery";

/**
 * Game form validation schema
 * MCP Guidance Applied:
 * - FE-002: FORM_VALIDATION - Mirror backend validation client-side
 * - SEC-014: INPUT_VALIDATION - Strict type and format constraints
 */
const gameFormSchema = z.object({
  name: z
    .string()
    .min(1, "Game name is required")
    .max(255, "Game name must be 255 characters or less")
    .trim(),
  game_code: z.string().regex(/^\d{4}$/, "Game code must be exactly 4 digits"),
  price: z
    .string()
    .min(1, "Price is required")
    .refine((val) => !isNaN(parseFloat(val)) && parseFloat(val) > 0, {
      message: "Price must be greater than 0",
    }),
  pack_value: z
    .string()
    .min(1, "Pack value is required")
    .refine((val) => !isNaN(parseFloat(val)) && parseFloat(val) >= 1, {
      message: "Pack value must be at least 1",
    }),
  status: z.enum(["ACTIVE", "INACTIVE", "DISCONTINUED"]),
});

type GameFormValues = z.infer<typeof gameFormSchema>;

interface GameManagementModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  storeId: string;
  game: {
    game_id: string;
    game_name: string;
    game_code: string;
    price: number | null;
    pack_value?: number | null;
    status?: string;
  } | null;
  onSuccess?: () => void;
}

/**
 * GameManagementModal component
 * Modal for managing game details only (no packs list)
 *
 * Features:
 * - Edit game information (name, code, price, pack value, status)
 *
 * MCP Guidance Applied:
 * - FE-002: FORM_VALIDATION - Client-side validation mirroring backend
 * - SEC-014: INPUT_VALIDATION - Strict allowlists for enums
 * - FE-007: CSRF_UI - Forms use server-validated tokens via httpOnly cookies
 * - API-009: IDOR - Server validates ownership; UI just displays user's data
 */
export function GameManagementModal({
  open,
  onOpenChange,
  game,
  onSuccess,
}: GameManagementModalProps) {
  const { toast } = useToast();

  // Mutations
  const updateGameMutation = useUpdateGame();

  // Game form
  const gameForm = useForm<GameFormValues>({
    resolver: zodResolver(gameFormSchema),
    defaultValues: {
      name: "",
      game_code: "",
      price: "",
      pack_value: "",
      status: "ACTIVE",
    },
  });

  // Populate game form when game data changes
  useEffect(() => {
    if (game && open) {
      gameForm.reset({
        name: game.game_name,
        game_code: game.game_code,
        price: game.price?.toString() || "",
        pack_value: game.pack_value?.toString() || "300",
        status:
          (game.status as "ACTIVE" | "INACTIVE" | "DISCONTINUED") || "ACTIVE",
      });
    }
  }, [game, open, gameForm]);

  // Handle game form submit
  const handleGameSubmit = async (values: GameFormValues) => {
    if (!game) return;

    try {
      const response = await updateGameMutation.mutateAsync({
        gameId: game.game_id,
        data: {
          name: values.name.trim().toUpperCase(),
          game_code: values.game_code,
          price: parseFloat(values.price),
          pack_value: parseFloat(values.pack_value),
          status: values.status,
        },
      });

      if (response.success) {
        toast({
          title: "Game updated",
          description: `Game "${values.name}" has been updated successfully.`,
        });
        onSuccess?.();
        onOpenChange(false);
      }
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Failed to update game";
      toast({
        title: "Error",
        description: errorMessage,
        variant: "destructive",
      });
    }
  };

  const handleClose = () => {
    if (!updateGameMutation.isPending) {
      onOpenChange(false);
    }
  };

  if (!game) return null;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent
        className="max-w-lg"
        aria-describedby="game-management-description"
      >
        <DialogHeader>
          <DialogTitle>Manage Game: {game.game_name}</DialogTitle>
          <DialogDescription id="game-management-description">
            Edit game details below.
          </DialogDescription>
        </DialogHeader>

        {/* Game Details Form */}
        <Form {...gameForm}>
          <form
            onSubmit={gameForm.handleSubmit(handleGameSubmit)}
            className="space-y-4"
          >
            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={gameForm.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Game Name</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        placeholder="LUCKY 7S"
                        disabled={updateGameMutation.isPending}
                        data-testid="game-name-input"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={gameForm.control}
                name="game_code"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Game Code</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        placeholder="0012"
                        maxLength={4}
                        disabled={updateGameMutation.isPending}
                        data-testid="game-code-input"
                      />
                    </FormControl>
                    <FormDescription>4-digit code</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={gameForm.control}
                name="price"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Ticket Price ($)</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        type="number"
                        step="0.01"
                        min="0.01"
                        placeholder="5.00"
                        disabled={updateGameMutation.isPending}
                        data-testid="game-price-input"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={gameForm.control}
                name="pack_value"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Pack Value ($)</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        type="number"
                        step="1"
                        min="1"
                        placeholder="300"
                        disabled={updateGameMutation.isPending}
                        data-testid="game-pack-value-input"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={gameForm.control}
                name="status"
                render={({ field }) => (
                  <FormItem className="col-span-2">
                    <FormLabel>Status</FormLabel>
                    <Select
                      onValueChange={field.onChange}
                      value={field.value}
                      disabled={updateGameMutation.isPending}
                    >
                      <FormControl>
                        <SelectTrigger data-testid="game-status-select">
                          <SelectValue placeholder="Select status" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="ACTIVE">Active</SelectItem>
                        <SelectItem value="INACTIVE">Inactive</SelectItem>
                        <SelectItem value="DISCONTINUED">
                          Discontinued
                        </SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <div className="flex justify-end gap-2 pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={handleClose}
                disabled={updateGameMutation.isPending}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={updateGameMutation.isPending}
                data-testid="save-game-button"
              >
                {updateGameMutation.isPending ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Save className="mr-2 h-4 w-4" />
                )}
                Save Changes
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

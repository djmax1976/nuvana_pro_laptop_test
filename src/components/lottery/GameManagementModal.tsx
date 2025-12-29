"use client";

import { useState, useEffect } from "react";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import {
  Loader2,
  Pencil,
  Trash2,
  CheckCircle,
  Eye,
  Save,
  X,
} from "lucide-react";
import {
  usePacksByGame,
  useUpdateGame,
  useUpdatePack,
  useDeletePack,
  useDepletePack,
} from "@/hooks/useLottery";
import type { LotteryPackResponse } from "@/lib/api/lottery";

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

/**
 * Pack edit form validation schema
 */
const packEditSchema = z
  .object({
    pack_number: z
      .string()
      .min(1, "Pack number is required")
      .max(50, "Pack number must be 50 characters or less")
      .trim(),
    serial_start: z
      .string()
      .min(1, "Serial start is required")
      .regex(/^\d+$/, "Serial start must be numeric"),
    serial_end: z
      .string()
      .min(1, "Serial end is required")
      .regex(/^\d+$/, "Serial end must be numeric"),
  })
  .refine(
    (data) => {
      const start = parseInt(data.serial_start, 10);
      const end = parseInt(data.serial_end, 10);
      return !isNaN(start) && !isNaN(end) && end >= start;
    },
    {
      message: "Serial end must be >= serial start",
      path: ["serial_end"],
    },
  );

type PackEditValues = z.infer<typeof packEditSchema>;

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
 * Modal for managing game details and associated packs
 *
 * Features:
 * - Edit game information (name, code, price, pack value, status)
 * - View all packs for the game
 * - Edit RECEIVED packs (pack number, serial range)
 * - Mark ACTIVE packs as sold
 * - Delete RECEIVED packs
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
  storeId,
  game,
  onSuccess,
}: GameManagementModalProps) {
  const { toast } = useToast();
  const [editingPackId, setEditingPackId] = useState<string | null>(null);
  const [deletePackId, setDeletePackId] = useState<string | null>(null);
  const [depletePackId, setDepletePackId] = useState<string | null>(null);

  // Fetch packs for this game
  const {
    data: packs,
    isLoading: isLoadingPacks,
    refetch: refetchPacks,
  } = usePacksByGame(game?.game_id, storeId, { enabled: open && !!game });

  // Mutations
  const updateGameMutation = useUpdateGame();
  const updatePackMutation = useUpdatePack();
  const deletePackMutation = useDeletePack();
  const depletePackMutation = useDepletePack();

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

  // Pack edit form
  const packForm = useForm<PackEditValues>({
    resolver: zodResolver(packEditSchema),
    defaultValues: {
      pack_number: "",
      serial_start: "",
      serial_end: "",
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

  // Reset state when modal closes
  useEffect(() => {
    if (!open) {
      setEditingPackId(null);
      setDeletePackId(null);
      setDepletePackId(null);
      packForm.reset();
    }
  }, [open, packForm]);

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

  // Start editing a pack
  const startEditingPack = (pack: LotteryPackResponse) => {
    setEditingPackId(pack.pack_id);
    packForm.reset({
      pack_number: pack.pack_number,
      serial_start: pack.serial_start,
      serial_end: pack.serial_end,
    });
  };

  // Handle pack edit submit
  const handlePackEditSubmit = async (values: PackEditValues) => {
    if (!editingPackId) return;

    try {
      const response = await updatePackMutation.mutateAsync({
        packId: editingPackId,
        data: {
          pack_number: values.pack_number.trim(),
          serial_start: values.serial_start.trim(),
          serial_end: values.serial_end.trim(),
        },
      });

      if (response.success) {
        toast({
          title: "Pack updated",
          description: `Pack ${values.pack_number} has been updated.`,
        });
        setEditingPackId(null);
        packForm.reset();
        refetchPacks();
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

  // Handle pack deletion
  const handleDeletePack = async () => {
    if (!deletePackId) return;

    try {
      const response = await deletePackMutation.mutateAsync(deletePackId);

      if (response.success) {
        toast({
          title: "Pack deleted",
          description: "Pack has been deleted successfully.",
        });
        setDeletePackId(null);
        refetchPacks();
        onSuccess?.();
      }
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Failed to delete pack";
      toast({
        title: "Error",
        description: errorMessage,
        variant: "destructive",
      });
    }
  };

  // Handle marking pack as sold
  const handleDepletePack = async () => {
    if (!depletePackId) return;

    try {
      const response = await depletePackMutation.mutateAsync({
        packId: depletePackId,
      });

      if (response.success) {
        toast({
          title: "Pack marked as sold",
          description: `Pack ${response.data.pack_number} has been marked as sold out.`,
        });
        setDepletePackId(null);
        refetchPacks();
        onSuccess?.();
      }
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Failed to mark pack as sold";
      toast({
        title: "Error",
        description: errorMessage,
        variant: "destructive",
      });
    }
  };

  const handleClose = () => {
    if (
      !updateGameMutation.isPending &&
      !updatePackMutation.isPending &&
      !deletePackMutation.isPending &&
      !depletePackMutation.isPending
    ) {
      onOpenChange(false);
    }
  };

  // Get pack to delete/deplete for confirmation dialog
  const packToDelete = packs?.find((p) => p.pack_id === deletePackId);
  const packToDeplete = packs?.find((p) => p.pack_id === depletePackId);

  if (!game) return null;

  return (
    <>
      <Dialog open={open} onOpenChange={handleClose}>
        <DialogContent
          className="max-w-4xl max-h-[90vh] overflow-y-auto"
          aria-describedby="game-management-description"
        >
          <DialogHeader>
            <DialogTitle>Manage Game: {game.game_name}</DialogTitle>
            <DialogDescription id="game-management-description">
              Edit game details and manage associated packs.
            </DialogDescription>
          </DialogHeader>

          {/* Game Details Section */}
          <div className="space-y-4">
            <h3 className="text-lg font-semibold">Game Details</h3>
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
                      <FormItem>
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
                <div className="flex justify-end">
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
                    Save Game Changes
                  </Button>
                </div>
              </form>
            </Form>
          </div>

          <div className="my-6 border-t border-border" />

          {/* Packs Section */}
          <div className="space-y-4">
            <h3 className="text-lg font-semibold">
              Packs ({packs?.length || 0} total)
            </h3>

            {isLoadingPacks ? (
              <div className="flex items-center justify-center p-8">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : !packs || packs.length === 0 ? (
              <div className="p-8 text-center text-muted-foreground">
                No packs found for this game.
              </div>
            ) : (
              <div className="rounded-md border overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Pack #</TableHead>
                      <TableHead>Serial Range</TableHead>
                      <TableHead>Bin</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {packs.map((pack) => {
                      const isEditing = editingPackId === pack.pack_id;
                      const canEdit = pack.status === "RECEIVED";
                      const canDelete = pack.status === "RECEIVED";
                      const canMarkSold = pack.status === "ACTIVE";

                      return (
                        <TableRow
                          key={pack.pack_id}
                          data-testid={`pack-row-${pack.pack_id}`}
                        >
                          {isEditing ? (
                            // Editing mode
                            <>
                              <TableCell>
                                <Input
                                  {...packForm.register("pack_number")}
                                  className="w-24"
                                  data-testid="edit-pack-number"
                                />
                              </TableCell>
                              <TableCell>
                                <div className="flex items-center gap-1">
                                  <Input
                                    {...packForm.register("serial_start")}
                                    className="w-20"
                                    data-testid="edit-serial-start"
                                  />
                                  <span>-</span>
                                  <Input
                                    {...packForm.register("serial_end")}
                                    className="w-20"
                                    data-testid="edit-serial-end"
                                  />
                                </div>
                              </TableCell>
                              <TableCell>{pack.bin?.name || "—"}</TableCell>
                              <TableCell>
                                <Badge variant="secondary">{pack.status}</Badge>
                              </TableCell>
                              <TableCell className="text-right">
                                <div className="flex items-center justify-end gap-2">
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    onClick={() => {
                                      setEditingPackId(null);
                                      packForm.reset();
                                    }}
                                    disabled={updatePackMutation.isPending}
                                  >
                                    <X className="h-4 w-4" />
                                  </Button>
                                  <Button
                                    size="sm"
                                    onClick={packForm.handleSubmit(
                                      handlePackEditSubmit,
                                    )}
                                    disabled={updatePackMutation.isPending}
                                    data-testid="save-pack-button"
                                  >
                                    {updatePackMutation.isPending ? (
                                      <Loader2 className="h-4 w-4 animate-spin" />
                                    ) : (
                                      <Save className="h-4 w-4" />
                                    )}
                                  </Button>
                                </div>
                              </TableCell>
                            </>
                          ) : (
                            // Display mode
                            <>
                              <TableCell className="font-mono">
                                {pack.pack_number}
                              </TableCell>
                              <TableCell className="font-mono">
                                {pack.serial_start} - {pack.serial_end}
                              </TableCell>
                              <TableCell>{pack.bin?.name || "—"}</TableCell>
                              <TableCell>
                                <Badge
                                  variant={
                                    pack.status === "ACTIVE"
                                      ? "success"
                                      : pack.status === "RECEIVED"
                                        ? "secondary"
                                        : "outline"
                                  }
                                >
                                  {pack.status}
                                </Badge>
                              </TableCell>
                              <TableCell className="text-right">
                                <div className="flex items-center justify-end gap-1">
                                  {canEdit && (
                                    <Button
                                      size="sm"
                                      variant="ghost"
                                      onClick={() => startEditingPack(pack)}
                                      title="Edit pack"
                                      data-testid={`edit-pack-${pack.pack_id}`}
                                    >
                                      <Pencil className="h-4 w-4" />
                                    </Button>
                                  )}
                                  {canMarkSold && (
                                    <Button
                                      size="sm"
                                      variant="ghost"
                                      onClick={() =>
                                        setDepletePackId(pack.pack_id)
                                      }
                                      title="Mark as sold"
                                      data-testid={`deplete-pack-${pack.pack_id}`}
                                    >
                                      <CheckCircle className="h-4 w-4 text-green-600" />
                                    </Button>
                                  )}
                                  {canDelete && (
                                    <Button
                                      size="sm"
                                      variant="ghost"
                                      onClick={() =>
                                        setDeletePackId(pack.pack_id)
                                      }
                                      title="Delete pack"
                                      className="text-destructive hover:text-destructive"
                                      data-testid={`delete-pack-${pack.pack_id}`}
                                    >
                                      <Trash2 className="h-4 w-4" />
                                    </Button>
                                  )}
                                  {!canEdit && !canDelete && !canMarkSold && (
                                    <Button
                                      size="sm"
                                      variant="ghost"
                                      title="View only"
                                      disabled
                                    >
                                      <Eye className="h-4 w-4" />
                                    </Button>
                                  )}
                                </div>
                              </TableCell>
                            </>
                          )}
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>

          <div className="flex justify-end pt-4">
            <Button variant="outline" onClick={handleClose}>
              Close
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog
        open={!!deletePackId}
        onOpenChange={(open) => !open && setDeletePackId(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Pack?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete pack{" "}
              <strong>{packToDelete?.pack_number}</strong>? This action cannot
              be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deletePackMutation.isPending}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeletePack}
              disabled={deletePackMutation.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deletePackMutation.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : null}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Mark Sold Confirmation Dialog */}
      <AlertDialog
        open={!!depletePackId}
        onOpenChange={(open) => !open && setDepletePackId(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Mark Pack as Sold?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to mark pack{" "}
              <strong>{packToDeplete?.pack_number}</strong> as sold out? This
              will change its status to DEPLETED.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={depletePackMutation.isPending}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDepletePack}
              disabled={depletePackMutation.isPending}
            >
              {depletePackMutation.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : null}
              Mark as Sold
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

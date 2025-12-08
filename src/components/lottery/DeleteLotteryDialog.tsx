"use client";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { Loader2, AlertTriangle } from "lucide-react";
import { usePackDetails, useDeletePack } from "@/hooks/useLottery";

interface DeleteLotteryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  packId: string | null;
  onSuccess?: () => void;
}

/**
 * DeleteLotteryDialog component
 * Confirmation dialog for deleting a lottery pack
 * Displays pack details and requires explicit confirmation before deletion
 *
 * @requirements
 * - AC #6: Delete icon button opens confirmation dialog
 * - AC #6: Confirmation dialog displays lottery pack details
 * - AC #6: Deletion only occurs upon confirmation
 * - AC #6: Table refreshes after successful deletion
 * - AC #7: Error messages displayed for failed operations
 * - AC #7: Loading states shown during API calls
 */
export function DeleteLotteryDialog({
  open,
  onOpenChange,
  packId,
  onSuccess,
}: DeleteLotteryDialogProps) {
  const { toast } = useToast();
  const deletePackMutation = useDeletePack();

  // Fetch pack details when dialog opens and packId is provided
  const {
    data: packData,
    isLoading: isLoadingPack,
    isError: isPackError,
    error: packError,
  } = usePackDetails(packId, { enabled: open && !!packId });

  const handleDelete = async () => {
    if (!packId) {
      toast({
        title: "Error",
        description: "Pack ID is required",
        variant: "destructive",
      });
      return;
    }

    try {
      const response = await deletePackMutation.mutateAsync(packId);

      if (response.success) {
        toast({
          title: "Pack deleted",
          description: `Pack ${packData?.pack_number || packId} has been deleted successfully.`,
        });

        onOpenChange(false);
        onSuccess?.();
      } else {
        throw new Error(response.message || "Failed to delete pack");
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

  const handleOpenChange = (newOpen: boolean) => {
    if (!deletePackMutation.isPending) {
      onOpenChange(newOpen);
    }
  };

  const isDeleting = deletePackMutation.isPending;

  // Loading state while fetching pack details
  if (isLoadingPack && open && packId) {
    return (
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Delete Lottery Pack</DialogTitle>
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
            <DialogTitle>Delete Lottery Pack</DialogTitle>
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

  // Pack details for display (sanitized via React's automatic escaping)
  const packNumber = packData?.pack_number || "Unknown";
  const gameName = packData?.game?.name || "Unknown";
  const binName = packData?.bin?.name || "N/A";

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        className="sm:max-w-[500px] max-h-[90vh] overflow-y-auto"
        aria-describedby="delete-lottery-description"
      >
        <DialogHeader>
          <DialogTitle>Delete Lottery Pack</DialogTitle>
          <DialogDescription id="delete-lottery-description">
            This action cannot be undone. This will permanently delete the
            lottery pack.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div
            className="flex items-start gap-3 rounded-lg border border-destructive/50 bg-destructive/10 p-4"
            role="alert"
            aria-live="polite"
          >
            <AlertTriangle
              className="h-5 w-5 text-destructive mt-0.5"
              aria-hidden="true"
            />
            <div className="flex-1 space-y-1">
              <p className="text-sm font-medium text-destructive">
                Warning: This action is permanent
              </p>
              <p className="text-sm text-muted-foreground">
                Deleting this pack will remove it from the system and cannot be
                reversed.
              </p>
            </div>
          </div>
          <div className="space-y-2">
            <p className="text-sm font-medium">Pack Details:</p>
            <div className="rounded-md bg-muted p-3 space-y-1 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Pack Number:</span>
                <span className="font-medium">{packNumber}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Game:</span>
                <span className="font-medium">{gameName}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Bin:</span>
                <span className="font-medium">{binName}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Status:</span>
                <span className="font-medium">{packData?.status || "N/A"}</span>
              </div>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => handleOpenChange(false)}
            disabled={deletePackMutation.isPending}
            className="focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2"
          >
            Cancel
          </Button>
          <Button
            type="button"
            variant="destructive"
            onClick={handleDelete}
            disabled={deletePackMutation.isPending}
            data-testid="confirm-delete-button"
            className="focus:outline-none focus:ring-2 focus:ring-destructive focus:ring-offset-2"
            aria-label={
              deletePackMutation.isPending
                ? "Deleting pack..."
                : `Delete pack ${packNumber}`
            }
          >
            {deletePackMutation.isPending && (
              <Loader2
                className="mr-2 h-4 w-4 animate-spin"
                aria-hidden="true"
              />
            )}
            Delete Pack
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

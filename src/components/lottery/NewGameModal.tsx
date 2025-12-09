"use client";

/**
 * New Game Modal Component
 * Modal for creating a new lottery game when an unknown game code is encountered
 * during pack reception.
 *
 * Features:
 * - Auto-uppercase game name input
 * - Displays the game code from the scanned serial
 * - Creates game and allows pack reception to continue
 */

import { useState, useCallback, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { createGame } from "@/lib/api/lottery";

interface GameToCreate {
  serial: string;
  game_code: string;
  pack_number: string;
  serial_start: string;
  price?: number;
}

interface NewGameModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  gamesToCreate: GameToCreate[];
  onGamesCreated: (
    createdGameCodes: string[],
    createdGames: Map<string, { name: string; price: number }>,
  ) => void;
  onCancel: () => void;
}

/**
 * NewGameModal component
 * Prompts user to enter game names for unknown game codes
 */
export function NewGameModal({
  open,
  onOpenChange,
  gamesToCreate,
  onGamesCreated,
  onCancel,
}: NewGameModalProps) {
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [gameName, setGameName] = useState("");
  const [gamePrice, setGamePrice] = useState<string>("");
  const [createdGameCodes, setCreatedGameCodes] = useState<string[]>([]);
  const [createdGames, setCreatedGames] = useState<
    Map<string, { name: string; price: number }>
  >(new Map());

  // Get unique game codes (multiple packs might have same game code)
  const uniqueGameCodes = Array.from(
    new Map(gamesToCreate.map((g) => [g.game_code, g])).values(),
  );

  // eslint-disable-next-line security/detect-object-injection -- currentIndex is a controlled state variable bounded by array length
  const currentGame = uniqueGameCodes[currentIndex];
  const totalGames = uniqueGameCodes.length;
  const isLastGame = currentIndex === totalGames - 1;

  // Reset state when modal opens
  useEffect(() => {
    if (open) {
      setCurrentIndex(0);
      setGameName("");
      setGamePrice("");
      setCreatedGameCodes([]);
      setCreatedGames(new Map());
    }
  }, [open]);

  // Handle game name input with auto-uppercase
  const handleGameNameChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setGameName(e.target.value.toUpperCase());
    },
    [],
  );

  // Handle price input - only allow valid currency format
  const handlePriceChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const value = e.target.value;
      // Allow empty, digits, and one decimal point with up to 2 decimal places
      if (value === "" || /^\d+\.?\d{0,2}$/.test(value)) {
        setGamePrice(value);
      }
    },
    [],
  );

  // Handle creating the current game
  const handleCreateGame = useCallback(async () => {
    if (!currentGame || !gameName.trim()) {
      toast({
        title: "Error",
        description: "Game name is required",
        variant: "destructive",
      });
      return;
    }

    if (!gamePrice || parseFloat(gamePrice) <= 0) {
      toast({
        title: "Error",
        description: "Please enter a valid price",
        variant: "destructive",
      });
      return;
    }

    const price = parseFloat(gamePrice);

    setIsSubmitting(true);
    try {
      const response = await createGame({
        game_code: currentGame.game_code,
        name: gameName.trim(),
        price: price,
      });

      if (response.success) {
        const newCreatedCodes = [...createdGameCodes, currentGame.game_code];
        setCreatedGameCodes(newCreatedCodes);

        // Track the created game with its data
        const newCreatedGames = new Map(createdGames);
        newCreatedGames.set(currentGame.game_code, {
          name: gameName.trim(),
          price,
        });
        setCreatedGames(newCreatedGames);

        toast({
          title: "Game created",
          description: `Game "${gameName.trim()}" (${currentGame.game_code}) - $${price.toFixed(2)} created successfully`,
        });

        if (isLastGame) {
          // All games created, notify parent with game data
          onGamesCreated(newCreatedCodes, newCreatedGames);
          onOpenChange(false);
        } else {
          // Move to next game
          setCurrentIndex((prev) => prev + 1);
          setGameName("");
          setGamePrice("");
        }
      } else {
        throw new Error("Failed to create game");
      }
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Failed to create game";
      toast({
        title: "Error",
        description: errorMessage,
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  }, [
    currentGame,
    gameName,
    gamePrice,
    isLastGame,
    createdGameCodes,
    createdGames,
    toast,
    onGamesCreated,
    onOpenChange,
  ]);

  // Handle cancel
  const handleCancel = useCallback(() => {
    onCancel();
    onOpenChange(false);
  }, [onCancel, onOpenChange]);

  // Handle key press for Enter submission
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (
        e.key === "Enter" &&
        gameName.trim() &&
        gamePrice &&
        parseFloat(gamePrice) > 0 &&
        !isSubmitting
      ) {
        e.preventDefault();
        handleCreateGame();
      }
    },
    [gameName, gamePrice, isSubmitting, handleCreateGame],
  );

  if (!currentGame) {
    return null;
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[450px]">
        <DialogHeader>
          <DialogTitle>New Game Found</DialogTitle>
          <DialogDescription>
            {totalGames > 1
              ? `Game ${currentIndex + 1} of ${totalGames}: `
              : ""}
            The game code <strong>{currentGame.game_code}</strong> was not found
            in the database. Please enter a name for this game to continue.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Game Code Display */}
          <div className="space-y-2">
            <Label className="text-muted-foreground">Game Code</Label>
            <div className="text-lg font-mono font-semibold">
              {currentGame.game_code}
            </div>
          </div>

          {/* Game Name Input */}
          <div className="space-y-2">
            <Label htmlFor="game-name">
              Game Name <span className="text-destructive">*</span>
            </Label>
            <Input
              id="game-name"
              value={gameName}
              onChange={handleGameNameChange}
              onKeyDown={handleKeyDown}
              placeholder="MEGA MILLIONS"
              disabled={isSubmitting}
              maxLength={255}
              className="uppercase"
              autoFocus
              data-testid="new-game-name-input"
            />
            <p className="text-xs text-muted-foreground">
              Enter the official lottery game name (auto-uppercase)
            </p>
          </div>

          {/* Price Input */}
          <div className="space-y-2">
            <Label htmlFor="game-price">
              Price ($) <span className="text-destructive">*</span>
            </Label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                $
              </span>
              <Input
                id="game-price"
                value={gamePrice}
                onChange={handlePriceChange}
                onKeyDown={handleKeyDown}
                placeholder="2.00"
                disabled={isSubmitting}
                className="pl-7"
                data-testid="new-game-price-input"
              />
            </div>
            <p className="text-xs text-muted-foreground">
              Enter the ticket price (e.g., 1, 2, 5, 10, 20)
            </p>
          </div>

          {/* Pack Info */}
          <div className="text-sm text-muted-foreground bg-muted p-3 rounded-md">
            <strong>Pack Number:</strong> {currentGame.pack_number}
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button
            type="button"
            variant="outline"
            onClick={handleCancel}
            disabled={isSubmitting}
          >
            Cancel Reception
          </Button>
          <Button
            type="button"
            onClick={handleCreateGame}
            disabled={
              isSubmitting ||
              !gameName.trim() ||
              !gamePrice ||
              parseFloat(gamePrice) <= 0
            }
            data-testid="create-game-button"
          >
            {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {isLastGame ? "Create & Receive Packs" : "Create & Next"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

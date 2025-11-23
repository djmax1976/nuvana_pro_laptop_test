"use client";

import { useState } from "react";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  confirmText?: string;
  cancelText?: string;
  requiresTextConfirmation?: boolean;
  confirmationText?: string;
  confirmationLabel?: string;
  onConfirm: () => void | Promise<void>;
  destructive?: boolean;
  isLoading?: boolean;
}

/**
 * ConfirmDialog component
 * A reusable confirmation dialog with optional text input confirmation
 * Supports both simple and high-friction confirmations
 */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmText = "Confirm",
  cancelText = "Cancel",
  requiresTextConfirmation = false,
  confirmationText = "DELETE",
  confirmationLabel = `Type "${confirmationText}" to confirm`,
  onConfirm,
  destructive = false,
  isLoading = false,
}: ConfirmDialogProps) {
  const [inputValue, setInputValue] = useState("");

  const handleConfirm = async () => {
    try {
      await onConfirm();
      setInputValue("");
      onOpenChange(false);
    } catch (error) {
      console.error("Error in onConfirm:", error);
      // Don't close dialog on error - let user retry or cancel
    }
  };

  const handleCancel = () => {
    setInputValue("");
    onOpenChange(false);
  };

  const isConfirmDisabled =
    isLoading || (requiresTextConfirmation && inputValue !== confirmationText);

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
          {requiresTextConfirmation && (
            <div className="space-y-2 pt-2">
              <Label htmlFor="confirm-input" className="text-sm font-medium">
                {confirmationLabel}
              </Label>
              <Input
                id="confirm-input"
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                placeholder={confirmationText}
                disabled={isLoading}
                className="font-mono"
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !isConfirmDisabled) {
                    handleConfirm();
                  }
                }}
              />
            </div>
          )}
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={handleCancel} disabled={isLoading}>
            {cancelText}
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={handleConfirm}
            disabled={isConfirmDisabled}
            className={
              destructive
                ? "bg-destructive text-destructive-foreground hover:bg-destructive/90"
                : ""
            }
          >
            {isLoading ? "Processing..." : confirmText}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

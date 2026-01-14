/**
 * Edit Connection Modal Component
 *
 * Modal dialog for editing file paths (export_path, import_path) on an existing
 * POS integration configuration. This allows authorized users to change
 * folder paths after initial setup.
 *
 * Security Standards Applied:
 * - SEC-014: INPUT_VALIDATION - Path length validation
 * - FE-002: FORM_VALIDATION - Client-side validation before API call
 * - API-001: VALIDATION - Backend validates all inputs independently
 *
 * @module components/pos-integration/EditConnectionModal
 */

import { useState, useCallback } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, FolderOpen } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import {
  useUpdatePOSIntegration,
  getErrorMessage,
} from "@/lib/api/pos-integration";
import type { POSIntegration } from "@/types/pos-integration";

// ============================================================================
// Types
// ============================================================================

interface EditConnectionModalProps {
  /** Whether the modal is open */
  open: boolean;
  /** Callback when modal is closed */
  onOpenChange: (open: boolean) => void;
  /** Store ID for API calls */
  storeId: string;
  /** Current POS integration data */
  integration: POSIntegration;
  /** Callback on successful save */
  onSaveSuccess?: () => void;
}

interface FormData {
  /** BOOutbox path - POS exports data here, Nuvana reads from here */
  outboxPath: string;
  /** BOInbox path - Nuvana writes data here, POS reads from here */
  inboxPath: string;
}

interface FormErrors {
  outboxPath?: string;
  inboxPath?: string;
}

// ============================================================================
// Constants
// ============================================================================

const MAX_PATH_LENGTH = 1024;

// ============================================================================
// Component
// ============================================================================

/**
 * Modal for editing POS connection file paths.
 *
 * Features:
 * - Edit export path (BOOutbox - where Nuvana reads from)
 * - Edit import path (BOInbox - where Nuvana writes to)
 * - Client-side validation with max length check
 * - Loading state during save
 * - Toast notifications for success/error
 *
 * @example
 * ```tsx
 * <EditConnectionModal
 *   open={isEditOpen}
 *   onOpenChange={setIsEditOpen}
 *   storeId={storeId}
 *   integration={posIntegration}
 *   onSaveSuccess={() => refetchIntegration()}
 * />
 * ```
 */
export function EditConnectionModal({
  open,
  onOpenChange,
  storeId,
  integration,
  onSaveSuccess,
}: EditConnectionModalProps): JSX.Element {
  const { toast } = useToast();
  const updateMutation = useUpdatePOSIntegration();

  // Form state initialized with current integration values
  // xml_gateway_path = BOOutbox (where POS puts files for Nuvana to read)
  // host = BOInbox (where Nuvana puts files for POS to read)
  const [formData, setFormData] = useState<FormData>({
    outboxPath: integration.xml_gateway_path || "",
    inboxPath: integration.host || "",
  });
  const [errors, setErrors] = useState<FormErrors>({});
  const [isSaving, setIsSaving] = useState(false);

  /**
   * Validate form data
   * SEC-014: INPUT_VALIDATION - Validate path lengths
   */
  const validateForm = useCallback((): boolean => {
    const newErrors: FormErrors = {};

    if (formData.outboxPath.length > MAX_PATH_LENGTH) {
      newErrors.outboxPath = `Outbox path must be at most ${MAX_PATH_LENGTH} characters`;
    }

    if (formData.inboxPath.length > MAX_PATH_LENGTH) {
      newErrors.inboxPath = `Inbox path must be at most ${MAX_PATH_LENGTH} characters`;
    }

    // At least one path should be provided
    if (!formData.outboxPath.trim() && !formData.inboxPath.trim()) {
      newErrors.outboxPath = "At least one path is required";
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }, [formData]);

  /**
   * Handle form field change
   */
  const handleChange = useCallback(
    (field: keyof FormData) => (e: React.ChangeEvent<HTMLInputElement>) => {
      setFormData((prev) => ({
        ...prev,
        [field]: e.target.value,
      }));
      // Clear error when user starts typing
      // eslint-disable-next-line security/detect-object-injection -- field is a controlled string literal
      if (Object.hasOwn(errors, field) && errors[field]) {
        setErrors((prev) => ({
          ...prev,
          [field]: undefined,
        }));
      }
    },
    [errors],
  );

  /**
   * Handle form submission
   * FE-002: FORM_VALIDATION - Validate before API call
   */
  const handleSave = useCallback(async () => {
    if (!validateForm()) {
      return;
    }

    setIsSaving(true);

    try {
      // export_path = BOOutbox (where POS exports, Nuvana reads)
      // import_path = BOInbox (where Nuvana writes, POS imports)
      await updateMutation.mutateAsync({
        storeId,
        data: {
          export_path: formData.outboxPath.trim() || undefined,
          import_path: formData.inboxPath.trim() || undefined,
        },
      });

      toast({
        title: "Connection Updated",
        description: "File paths have been updated successfully.",
      });

      onSaveSuccess?.();
      onOpenChange(false);
    } catch (error) {
      const errorMessage = getErrorMessage(error);
      toast({
        title: "Update Failed",
        description: errorMessage,
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
    }
  }, [
    validateForm,
    updateMutation,
    storeId,
    formData,
    toast,
    onSaveSuccess,
    onOpenChange,
  ]);

  /**
   * Handle modal close - reset form to current integration values
   */
  const handleOpenChange = useCallback(
    (open: boolean) => {
      if (!open) {
        // Reset form when closing
        setFormData({
          outboxPath: integration.xml_gateway_path || "",
          inboxPath: integration.host || "",
        });
        setErrors({});
      }
      onOpenChange(open);
    },
    [integration, onOpenChange],
  );

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        className="sm:max-w-md"
        data-testid="edit-connection-modal"
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FolderOpen className="h-5 w-5 text-primary" />
            Edit File Paths
          </DialogTitle>
          <DialogDescription>
            Update the folder paths for file-based POS communication.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* BOOutbox - POS exports here, Nuvana reads from here */}
          <div className="space-y-2">
            <Label
              htmlFor="edit-outbox-path"
              className="text-sm font-medium text-gray-700"
            >
              Outbox Path{" "}
              <span className="text-gray-400 font-normal">(POS → Nuvana)</span>
            </Label>
            <Input
              id="edit-outbox-path"
              type="text"
              value={formData.outboxPath}
              onChange={handleChange("outboxPath")}
              placeholder="e.g., C:\GILBARCO\BOOutbox"
              disabled={isSaving}
              className={errors.outboxPath ? "border-red-500" : ""}
              data-testid="edit-outbox-path"
              autoComplete="off"
            />
            {errors.outboxPath ? (
              <p className="text-xs text-red-500">{errors.outboxPath}</p>
            ) : (
              <p className="text-xs text-gray-400">
                POS writes data here • Nuvana reads from this folder
              </p>
            )}
          </div>

          {/* BOInbox - Nuvana writes here, POS reads from here */}
          <div className="space-y-2">
            <Label
              htmlFor="edit-inbox-path"
              className="text-sm font-medium text-gray-700"
            >
              Inbox Path{" "}
              <span className="text-gray-400 font-normal">(Nuvana → POS)</span>
            </Label>
            <Input
              id="edit-inbox-path"
              type="text"
              value={formData.inboxPath}
              onChange={handleChange("inboxPath")}
              placeholder="e.g., C:\GILBARCO\BOInbox"
              disabled={isSaving}
              className={errors.inboxPath ? "border-red-500" : ""}
              data-testid="edit-inbox-path"
              autoComplete="off"
            />
            {errors.inboxPath ? (
              <p className="text-xs text-red-500">{errors.inboxPath}</p>
            ) : (
              <p className="text-xs text-gray-400">
                Nuvana writes data here • POS reads from this folder
              </p>
            )}
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button
            type="button"
            variant="outline"
            onClick={() => handleOpenChange(false)}
            disabled={isSaving}
          >
            Cancel
          </Button>
          <Button
            type="button"
            onClick={handleSave}
            disabled={isSaving}
            data-testid="edit-connection-save"
          >
            {isSaving ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                Saving...
              </>
            ) : (
              "Save Changes"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default EditConnectionModal;

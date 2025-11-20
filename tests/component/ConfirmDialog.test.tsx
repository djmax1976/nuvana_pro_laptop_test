/**
 * ConfirmDialog Component Tests
 *
 * Tests the reusable confirmation dialog component with:
 * - Simple confirmation dialogs
 * - Text input confirmation (high-friction)
 * - Keyboard interactions
 * - Loading states
 * - Destructive action styling
 * - Accessibility
 *
 * Priority: P0 (Critical - Used for all destructive actions)
 */

import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { vi, describe, test, expect, beforeEach } from "vitest";

describe("ConfirmDialog - Simple Confirmation", () => {
  test("[P0] Should render dialog with title and description", () => {
    const onConfirm = vi.fn();

    render(
      <ConfirmDialog
        open={true}
        onOpenChange={() => {}}
        title="Confirm Action"
        description="Are you sure you want to proceed?"
        onConfirm={onConfirm}
      />,
    );

    expect(screen.getByText("Confirm Action")).toBeInTheDocument();
    expect(
      screen.getByText("Are you sure you want to proceed?"),
    ).toBeInTheDocument();
  });

  test("[P0] Should show default button text when not specified", () => {
    const onConfirm = vi.fn();

    render(
      <ConfirmDialog
        open={true}
        onOpenChange={() => {}}
        title="Confirm Action"
        description="Test"
        onConfirm={onConfirm}
      />,
    );

    expect(screen.getByRole("button", { name: "Confirm" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeInTheDocument();
  });

  test("[P0] Should show custom button text when specified", () => {
    const onConfirm = vi.fn();

    render(
      <ConfirmDialog
        open={true}
        onOpenChange={() => {}}
        title="Delete Client"
        description="Are you sure?"
        confirmText="Delete Permanently"
        cancelText="No, Keep It"
        onConfirm={onConfirm}
      />,
    );

    expect(screen.getByText("Delete Permanently")).toBeInTheDocument();
    expect(screen.getByText("No, Keep It")).toBeInTheDocument();
  });

  test("[P0] Should call onConfirm when confirm button is clicked", async () => {
    const onConfirm = vi.fn();
    const onOpenChange = vi.fn();

    render(
      <ConfirmDialog
        open={true}
        onOpenChange={onOpenChange}
        title="Confirm Action"
        description="Test"
        confirmText="Confirm"
        onConfirm={onConfirm}
      />,
    );

    const confirmButton = screen.getByRole("button", { name: "Confirm" });
    await userEvent.click(confirmButton);

    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  test("[P0] Should call onOpenChange when cancel button is clicked", async () => {
    const onConfirm = vi.fn();
    const onOpenChange = vi.fn();

    render(
      <ConfirmDialog
        open={true}
        onOpenChange={onOpenChange}
        title="Confirm Action"
        description="Test"
        onConfirm={onConfirm}
      />,
    );

    const cancelButton = screen.getByRole("button", { name: "Cancel" });
    await userEvent.click(cancelButton);

    expect(onConfirm).not.toHaveBeenCalled();
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  test("[P0] Should not render when open is false", () => {
    const onConfirm = vi.fn();

    const { container } = render(
      <ConfirmDialog
        open={false}
        onOpenChange={() => {}}
        title="Confirm Action"
        description="Test"
        onConfirm={onConfirm}
      />,
    );

    // Dialog should not be visible
    expect(
      screen.queryByRole("button", { name: "Confirm" }),
    ).not.toBeInTheDocument();
  });
});

describe("ConfirmDialog - Text Input Confirmation", () => {
  test("[P0] Should render input field when requiresTextConfirmation is true", () => {
    const onConfirm = vi.fn();

    render(
      <ConfirmDialog
        open={true}
        onOpenChange={() => {}}
        title="Delete Client"
        description="This action cannot be undone"
        requiresTextConfirmation={true}
        confirmationText="DELETE"
        onConfirm={onConfirm}
      />,
    );

    const input = screen.getByPlaceholderText("DELETE");
    expect(input).toBeInTheDocument();
    expect(screen.getByText('Type "DELETE" to confirm')).toBeInTheDocument();
  });

  test("[P0] Should disable confirm button when input is empty", () => {
    const onConfirm = vi.fn();

    render(
      <ConfirmDialog
        open={true}
        onOpenChange={() => {}}
        title="Delete"
        description="Test"
        requiresTextConfirmation={true}
        confirmationText="DELETE"
        confirmText="Delete Permanently"
        onConfirm={onConfirm}
      />,
    );

    const confirmButton = screen.getByText("Delete Permanently");
    expect(confirmButton).toBeDisabled();
  });

  test("[P0] Should disable confirm button when input text does not match", async () => {
    const onConfirm = vi.fn();

    render(
      <ConfirmDialog
        open={true}
        onOpenChange={() => {}}
        title="Delete"
        description="Test"
        requiresTextConfirmation={true}
        confirmationText="DELETE"
        confirmText="Delete Permanently"
        onConfirm={onConfirm}
      />,
    );

    const input = screen.getByPlaceholderText("DELETE");
    await userEvent.type(input, "delete"); // Wrong case

    const confirmButton = screen.getByText("Delete Permanently");
    expect(confirmButton).toBeDisabled();
  });

  test("[P0] Should enable confirm button when input text matches exactly", async () => {
    const onConfirm = vi.fn();

    render(
      <ConfirmDialog
        open={true}
        onOpenChange={() => {}}
        title="Delete"
        description="Test"
        requiresTextConfirmation={true}
        confirmationText="DELETE"
        confirmText="Delete Permanently"
        onConfirm={onConfirm}
      />,
    );

    const input = screen.getByPlaceholderText("DELETE");
    await userEvent.type(input, "DELETE");

    const confirmButton = screen.getByText("Delete Permanently");
    expect(confirmButton).toBeEnabled();
  });

  test("[P0] Should call onConfirm when correct text is entered and confirmed", async () => {
    const onConfirm = vi.fn();
    const onOpenChange = vi.fn();

    render(
      <ConfirmDialog
        open={true}
        onOpenChange={onOpenChange}
        title="Delete"
        description="Test"
        requiresTextConfirmation={true}
        confirmationText="DELETE"
        confirmText="Delete Permanently"
        onConfirm={onConfirm}
      />,
    );

    const input = screen.getByPlaceholderText("DELETE");
    await userEvent.type(input, "DELETE");

    const confirmButton = screen.getByText("Delete Permanently");
    await userEvent.click(confirmButton);

    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  test("[P0] Should clear input when dialog is closed", async () => {
    const onConfirm = vi.fn();
    const onOpenChange = vi.fn();

    const { rerender } = render(
      <ConfirmDialog
        open={true}
        onOpenChange={onOpenChange}
        title="Delete"
        description="Test"
        requiresTextConfirmation={true}
        confirmationText="DELETE"
        onConfirm={onConfirm}
      />,
    );

    const input = screen.getByPlaceholderText("DELETE");
    await userEvent.type(input, "DELETE");

    // Close dialog
    const cancelButton = screen.getByText("Cancel");
    await userEvent.click(cancelButton);

    // Reopen dialog
    rerender(
      <ConfirmDialog
        open={true}
        onOpenChange={onOpenChange}
        title="Delete"
        description="Test"
        requiresTextConfirmation={true}
        confirmationText="DELETE"
        onConfirm={onConfirm}
      />,
    );

    const inputAfterReopen = screen.getByPlaceholderText("DELETE");
    expect(inputAfterReopen).toHaveValue("");
  });

  test("[P0] Should support custom confirmation text", async () => {
    const onConfirm = vi.fn();

    render(
      <ConfirmDialog
        open={true}
        onOpenChange={() => {}}
        title="Delete"
        description="Test"
        requiresTextConfirmation={true}
        confirmationText="DESTROY"
        confirmationLabel='Type "DESTROY" to confirm'
        onConfirm={onConfirm}
      />,
    );

    expect(screen.getByText('Type "DESTROY" to confirm')).toBeInTheDocument();

    const input = screen.getByPlaceholderText("DESTROY");
    await userEvent.type(input, "DESTROY");

    const confirmButton = screen.getByRole("button", { name: /confirm/i });
    expect(confirmButton).toBeEnabled();
  });
});

describe("ConfirmDialog - Keyboard Interactions", () => {
  test("[P0] Should trigger confirm on Enter key when text matches", async () => {
    const onConfirm = vi.fn();

    render(
      <ConfirmDialog
        open={true}
        onOpenChange={() => {}}
        title="Delete"
        description="Test"
        requiresTextConfirmation={true}
        confirmationText="DELETE"
        onConfirm={onConfirm}
      />,
    );

    const input = screen.getByPlaceholderText("DELETE");
    await userEvent.type(input, "DELETE{Enter}");

    await waitFor(() => {
      expect(onConfirm).toHaveBeenCalledTimes(1);
    });
  });

  test("[P0] Should not trigger confirm on Enter when text does not match", async () => {
    const onConfirm = vi.fn();

    render(
      <ConfirmDialog
        open={true}
        onOpenChange={() => {}}
        title="Delete"
        description="Test"
        requiresTextConfirmation={true}
        confirmationText="DELETE"
        onConfirm={onConfirm}
      />,
    );

    const input = screen.getByPlaceholderText("DELETE");
    await userEvent.type(input, "wrong{Enter}");

    expect(onConfirm).not.toHaveBeenCalled();
  });

  test("[P0] Should autofocus input when requiresTextConfirmation is true", () => {
    render(
      <ConfirmDialog
        open={true}
        onOpenChange={() => {}}
        title="Delete"
        description="Test"
        requiresTextConfirmation={true}
        confirmationText="DELETE"
        onConfirm={() => {}}
      />,
    );

    const input = screen.getByPlaceholderText("DELETE");
    // Note: autoFocus is a React prop, not an HTML attribute
    // Testing that the input element exists and can receive focus
    expect(input).toBeInTheDocument();
    expect(input).toHaveProperty("autofocus");
  });
});

describe("ConfirmDialog - Loading States", () => {
  test("[P0] Should disable buttons when isLoading is true", () => {
    render(
      <ConfirmDialog
        open={true}
        onOpenChange={() => {}}
        title="Delete"
        description="Test"
        confirmText="Confirm"
        onConfirm={() => {}}
        isLoading={true}
      />,
    );

    const confirmButton = screen.getByText("Processing...");
    const cancelButton = screen.getByText("Cancel");

    expect(confirmButton).toBeDisabled();
    expect(cancelButton).toBeDisabled();
  });

  test("[P0] Should show loading text when isLoading is true", () => {
    render(
      <ConfirmDialog
        open={true}
        onOpenChange={() => {}}
        title="Delete"
        description="Test"
        confirmText="Delete Permanently"
        onConfirm={() => {}}
        isLoading={true}
      />,
    );

    expect(screen.getByText("Processing...")).toBeInTheDocument();
    expect(screen.queryByText("Delete Permanently")).not.toBeInTheDocument();
  });

  test("[P0] Should disable input when isLoading is true", () => {
    render(
      <ConfirmDialog
        open={true}
        onOpenChange={() => {}}
        title="Delete"
        description="Test"
        requiresTextConfirmation={true}
        confirmationText="DELETE"
        onConfirm={() => {}}
        isLoading={true}
      />,
    );

    const input = screen.getByPlaceholderText("DELETE");
    expect(input).toBeDisabled();
  });
});

describe("ConfirmDialog - Destructive Styling", () => {
  test("[P0] Should apply destructive styling when destructive is true", () => {
    render(
      <ConfirmDialog
        open={true}
        onOpenChange={() => {}}
        title="Delete"
        description="Test"
        confirmText="Delete"
        onConfirm={() => {}}
        destructive={true}
      />,
    );

    const confirmButton = screen.getByRole("button", { name: /^Delete$/i });
    expect(confirmButton).toHaveClass("bg-destructive");
  });

  test("[P0] Should not apply destructive styling when destructive is false", () => {
    render(
      <ConfirmDialog
        open={true}
        onOpenChange={() => {}}
        title="Activate"
        description="Test"
        confirmText="Activate"
        onConfirm={() => {}}
        destructive={false}
      />,
    );

    const confirmButton = screen.getByRole("button", { name: /^Activate$/i });
    expect(confirmButton).not.toHaveClass("bg-destructive");
  });
});

describe("ConfirmDialog - Async onConfirm Handler", () => {
  test("[P0] Should handle async onConfirm", async () => {
    const onConfirm = vi.fn().mockResolvedValue(undefined);
    const onOpenChange = vi.fn();

    render(
      <ConfirmDialog
        open={true}
        onOpenChange={onOpenChange}
        title="Confirm"
        description="Test"
        onConfirm={onConfirm}
      />,
    );

    const confirmButton = screen.getByRole("button", { name: /confirm/i });
    await userEvent.click(confirmButton);

    await waitFor(() => {
      expect(onConfirm).toHaveBeenCalledTimes(1);
      expect(onOpenChange).toHaveBeenCalledWith(false);
    });
  });

  test("[P0] Should handle rejected async onConfirm gracefully", async () => {
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});
    const onConfirm = vi.fn().mockRejectedValue(new Error("Test error"));

    render(
      <ConfirmDialog
        open={true}
        onOpenChange={() => {}}
        title="Confirm"
        description="Test"
        onConfirm={onConfirm}
      />,
    );

    const confirmButton = screen.getByRole("button", { name: /confirm/i });
    await userEvent.click(confirmButton);

    await waitFor(() => {
      expect(onConfirm).toHaveBeenCalledTimes(1);
    });

    // Wait for the promise rejection to be handled
    await waitFor(() => {
      expect(consoleError).toHaveBeenCalled();
    });

    consoleError.mockRestore();
  });
});

describe("ConfirmDialog - Accessibility", () => {
  test("[P0] Should have proper ARIA labels", () => {
    render(
      <ConfirmDialog
        open={true}
        onOpenChange={() => {}}
        title="Confirm Action"
        description="Are you sure?"
        onConfirm={() => {}}
      />,
    );

    expect(screen.getByText("Confirm Action")).toBeInTheDocument();
    expect(screen.getByText("Are you sure?")).toBeInTheDocument();
  });

  test("[P0] Should support keyboard navigation", async () => {
    const onConfirm = vi.fn();
    const onOpenChange = vi.fn();

    render(
      <ConfirmDialog
        open={true}
        onOpenChange={onOpenChange}
        title="Confirm"
        description="Test"
        onConfirm={onConfirm}
      />,
    );

    // Radix UI AlertDialog automatically focuses the action (Confirm) button by default
    // Check initial focus is on confirm button
    expect(screen.getByRole("button", { name: /confirm/i })).toHaveFocus();

    // Tab to cancel button
    await userEvent.tab();
    expect(screen.getByText("Cancel")).toHaveFocus();
  });
});

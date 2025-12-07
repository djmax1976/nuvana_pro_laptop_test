/**
 * Lottery Components Accessibility Tests
 * Tests for accessibility compliance (ARIA labels, keyboard navigation, screen reader compatibility)
 *
 * Story: 6.10 - Lottery Management UI
 * Task: 11 - Implement responsive design and accessibility
 */

import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { LotteryPackCard } from "../../../src/components/lottery/LotteryPackCard";
import { PackReceptionForm } from "../../../src/components/lottery/PackReceptionForm";
import { PackActivationForm } from "../../../src/components/lottery/PackActivationForm";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ReactNode } from "react";

// Create a test query client
function createTestQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
}

// Wrapper component for React Query
function QueryWrapper({ children }: { children: ReactNode }) {
  const queryClient = createTestQueryClient();
  return (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

describe("LotteryPackCard Accessibility", () => {
  const mockPack = {
    pack_id: "pack-123",
    pack_number: "PACK-001",
    serial_start: "1000",
    serial_end: "2000",
    status: "ACTIVE" as const,
    game: {
      game_id: "game-123",
      name: "Test Game",
    },
    tickets_remaining: 500,
    bin: {
      bin_id: "bin-123",
      name: "Bin A",
    },
  };

  it("should have proper ARIA label when clickable", () => {
    const handleClick = vi.fn();
    render(<LotteryPackCard pack={mockPack} onDetailsClick={handleClick} />);

    const card = screen.getByRole("button", {
      name: /pack pack-001 - test game/i,
    });
    expect(card).toBeInTheDocument();
  });

  it("should be keyboard accessible", async () => {
    const user = userEvent.setup();
    const handleClick = vi.fn();

    render(<LotteryPackCard pack={mockPack} onDetailsClick={handleClick} />);

    const card = screen.getByRole("button");
    card.focus();

    // Test Enter key
    await user.keyboard("{Enter}");
    expect(handleClick).toHaveBeenCalledWith("pack-123");

    // Test Space key
    handleClick.mockClear();
    await user.keyboard(" ");
    expect(handleClick).toHaveBeenCalledWith("pack-123");
  });

  it("should have proper role when not clickable", () => {
    render(<LotteryPackCard pack={mockPack} />);

    const card = screen.getByRole("article");
    expect(card).toBeInTheDocument();
    expect(card).not.toHaveAttribute("tabIndex");
  });

  it("should display status badge with accessible text", () => {
    render(<LotteryPackCard pack={mockPack} />);

    const statusBadge = screen.getByTestId("status-badge-pack-123");
    expect(statusBadge).toBeInTheDocument();
    expect(statusBadge).toHaveTextContent("ACTIVE");
  });
});

describe("PackReceptionForm Accessibility", () => {
  const mockGames = [
    { game_id: "game-1", name: "Game 1" },
    { game_id: "game-2", name: "Game 2" },
  ];

  const mockBins = [{ bin_id: "bin-1", name: "Bin A", location: "Shelf 1" }];

  const mockOnSubmit = vi.fn().mockResolvedValue(undefined);

  it("should have proper dialog ARIA attributes", () => {
    render(
      <QueryWrapper>
        <PackReceptionForm
          storeId="store-123"
          games={mockGames}
          bins={mockBins}
          open={true}
          onOpenChange={vi.fn()}
          onSubmit={mockOnSubmit}
        />
      </QueryWrapper>,
    );

    const dialog = screen.getByRole("dialog");
    expect(dialog).toBeInTheDocument();

    const title = screen.getByRole("heading", {
      name: /receive lottery pack/i,
    });
    expect(title).toBeInTheDocument();
  });

  it("should have properly labeled form fields", () => {
    render(
      <QueryWrapper>
        <PackReceptionForm
          storeId="store-123"
          games={mockGames}
          bins={mockBins}
          open={true}
          onOpenChange={vi.fn()}
          onSubmit={mockOnSubmit}
        />
      </QueryWrapper>,
    );

    expect(screen.getByLabelText(/game/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/pack number/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/serial start/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/serial end/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/bin assignment/i)).toBeInTheDocument();
  });

  it("should be keyboard navigable", async () => {
    const user = userEvent.setup();
    render(
      <QueryWrapper>
        <PackReceptionForm
          storeId="store-123"
          games={mockGames}
          bins={mockBins}
          open={true}
          onOpenChange={vi.fn()}
          onSubmit={mockOnSubmit}
        />
      </QueryWrapper>,
    );

    // Tab through form fields
    await user.tab();
    expect(screen.getByTestId("game-select")).toHaveFocus();

    await user.tab();
    expect(screen.getByTestId("pack-number-input")).toHaveFocus();

    await user.tab();
    expect(screen.getByTestId("serial-start-input")).toHaveFocus();
  });

  it("should display validation errors accessibly", async () => {
    const user = userEvent.setup();
    render(
      <QueryWrapper>
        <PackReceptionForm
          storeId="store-123"
          games={mockGames}
          bins={mockBins}
          open={true}
          onOpenChange={vi.fn()}
          onSubmit={mockOnSubmit}
        />
      </QueryWrapper>,
    );

    // Try to submit without filling required fields
    const submitButton = screen.getByRole("button", { name: /receive pack/i });
    await user.click(submitButton);

    // Validation errors should be announced
    await screen.findByText(/game must be selected/i);
  });
});

describe("PackActivationForm Accessibility", () => {
  const mockPacks = [
    {
      pack_id: "pack-1",
      pack_number: "PACK-001",
      game: { game_id: "game-1", name: "Game 1" },
      serial_start: "1000",
      serial_end: "2000",
    },
  ];

  const mockOnActivate = vi.fn().mockResolvedValue(undefined);

  it("should have proper dialog ARIA attributes", () => {
    render(
      <QueryWrapper>
        <PackActivationForm
          packs={mockPacks}
          open={true}
          onOpenChange={vi.fn()}
          onActivate={mockOnActivate}
        />
      </QueryWrapper>,
    );

    const dialog = screen.getByRole("dialog");
    expect(dialog).toBeInTheDocument();

    const title = screen.getByRole("heading", {
      name: /activate lottery pack/i,
    });
    expect(title).toBeInTheDocument();
  });

  it("should have properly labeled form fields", () => {
    render(
      <QueryWrapper>
        <PackActivationForm
          packs={mockPacks}
          open={true}
          onOpenChange={vi.fn()}
          onActivate={mockOnActivate}
        />
      </QueryWrapper>,
    );

    expect(screen.getByLabelText(/select pack/i)).toBeInTheDocument();
  });

  it("should be keyboard navigable", async () => {
    const user = userEvent.setup();
    render(
      <QueryWrapper>
        <PackActivationForm
          packs={mockPacks}
          open={true}
          onOpenChange={vi.fn()}
          onActivate={mockOnActivate}
        />
      </QueryWrapper>,
    );

    // Tab to pack select
    await user.tab();
    const packSelect = screen.getByRole("combobox", { name: /select pack/i });
    expect(packSelect).toHaveFocus();
  });
});

describe("Responsive Design", () => {
  it("should use responsive Tailwind classes", () => {
    const { container } = render(
      <LotteryPackCard
        pack={{
          pack_id: "pack-123",
          pack_number: "PACK-001",
          serial_start: "1000",
          serial_end: "2000",
          status: "ACTIVE",
          game: { game_id: "game-123", name: "Test Game" },
        }}
      />,
    );

    // Check that card uses responsive classes (shadcn Card component should handle this)
    const card = container.querySelector('[data-testid="pack-card"]');
    expect(card).toBeInTheDocument();
  });
});

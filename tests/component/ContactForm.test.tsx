import "@testing-library/jest-dom/vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { ContactForm } from "@/components/homepage/ContactForm";

describe("ContactForm component", () => {
  const fillForm = () => {
    fireEvent.change(screen.getByLabelText(/Name/i), {
      target: { value: "John Doe" },
    });
    fireEvent.change(screen.getByLabelText(/Email/i), {
      target: { value: "john.doe@example.com" },
    });
    fireEvent.change(screen.getByLabelText(/Message/i), {
      target: { value: "This is a demo message" },
    });
  };

  it("renders all required inputs and button", () => {
    render(<ContactForm />);

    expect(screen.getByLabelText(/Name/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Email/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Message/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Send Message/i })).toBeTruthy();
  });

  it("enables submit button when valid data is entered", async () => {
    render(<ContactForm />);

    fillForm();

    expect(screen.getByRole("button", { name: /Send Message/i })).toBeEnabled();
  });

  it("shows loading and success states when submitting", async () => {
    render(<ContactForm />);

    vi.spyOn(global, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({}),
    } as Response);

    fillForm();

    fireEvent.click(screen.getByRole("button", { name: /Send Message/i }));

    expect(screen.getByText(/Sending/i)).toBeInTheDocument();

    expect(
      await screen.findByText(/Thank you! We'll be in touch soon/i),
    ).toBeInTheDocument();
  });
});

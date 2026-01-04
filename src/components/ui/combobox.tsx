"use client";

/**
 * Simple Searchable Dropdown Component
 *
 * Click to open, see all options, type to filter. That's it.
 */

import * as React from "react";
import { Check, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

export interface ComboboxOption {
  value: string;
  label: string;
  disabled?: boolean;
}

export interface ComboboxProps {
  value: string;
  onValueChange: (value: string) => void;
  options: ComboboxOption[];
  placeholder?: string;
  emptyMessage?: string;
  disabled?: boolean;
  isLoading?: boolean;
  className?: string;
  testId?: string;
}

export function Combobox({
  value,
  onValueChange,
  options,
  placeholder = "Select...",
  emptyMessage = "No results found",
  disabled = false,
  isLoading = false,
  className,
  testId,
}: ComboboxProps) {
  const [open, setOpen] = React.useState(false);
  const [search, setSearch] = React.useState("");
  const containerRef = React.useRef<HTMLDivElement>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);

  // Get display label for current value
  const displayLabel = React.useMemo(() => {
    const option = options.find((opt) => opt.value === value);
    return option?.label || "";
  }, [options, value]);

  // Filter options based on search - instant, no delay
  const filteredOptions = React.useMemo(() => {
    if (!search) return options;
    const searchLower = search.toLowerCase();
    return options.filter((opt) =>
      opt.label.toLowerCase().includes(searchLower),
    );
  }, [options, search]);

  // Close dropdown when clicking outside
  React.useEffect(() => {
    if (!open) return;

    const handleClickOutside = (event: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setOpen(false);
        setSearch("");
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  // Focus input when dropdown opens
  React.useEffect(() => {
    if (open && inputRef.current) {
      inputRef.current.focus();
    }
  }, [open]);

  // Handle keyboard navigation
  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === "Escape") {
      setOpen(false);
      setSearch("");
    } else if (event.key === "Enter" && filteredOptions.length === 1) {
      // Auto-select if only one match
      onValueChange(filteredOptions[0].value);
      setOpen(false);
      setSearch("");
    }
  };

  const handleSelect = (optionValue: string) => {
    onValueChange(optionValue === value ? "" : optionValue);
    setOpen(false);
    setSearch("");
  };

  const handleTriggerClick = () => {
    if (!disabled) {
      setOpen(!open);
      if (!open) {
        setSearch("");
      }
    }
  };

  return (
    <div ref={containerRef} className="relative w-full">
      {/* Trigger Button */}
      <button
        type="button"
        role="combobox"
        aria-expanded={open}
        aria-controls="combobox-options"
        aria-haspopup="listbox"
        disabled={disabled}
        data-testid={testId}
        onClick={handleTriggerClick}
        className={cn(
          "flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background",
          "focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
          "disabled:cursor-not-allowed disabled:opacity-50",
          !value && "text-muted-foreground",
          className,
        )}
      >
        <span className="truncate">{displayLabel || placeholder}</span>
        <ChevronDown
          className={cn(
            "ml-2 h-4 w-4 shrink-0 opacity-50 transition-transform",
            open && "rotate-180",
          )}
        />
      </button>

      {/* Dropdown */}
      {open && (
        <div
          id="combobox-options"
          role="listbox"
          className={cn(
            "absolute left-0 top-full z-[200] mt-1 w-full",
            "max-h-60 overflow-hidden rounded-md border bg-popover shadow-md",
          )}
        >
          {/* Search Input - same field for typing */}
          <div className="border-b p-2">
            <input
              ref={inputRef}
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={placeholder}
              className={cn(
                "w-full rounded-sm border-0 bg-transparent px-2 py-1 text-sm",
                "focus:outline-none focus:ring-0",
                "placeholder:text-muted-foreground",
              )}
              data-testid={testId ? `${testId}-input` : undefined}
            />
          </div>

          {/* Options List */}
          <div className="max-h-48 overflow-y-auto p-1">
            {isLoading ? (
              <div className="py-6 text-center text-sm text-muted-foreground">
                Loading...
              </div>
            ) : filteredOptions.length === 0 ? (
              <div className="py-6 text-center text-sm text-muted-foreground">
                {emptyMessage}
              </div>
            ) : (
              filteredOptions.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  disabled={option.disabled}
                  onClick={() => handleSelect(option.value)}
                  className={cn(
                    "relative flex w-full cursor-pointer select-none items-center rounded-sm px-2 py-1.5 text-sm",
                    "hover:bg-accent hover:text-accent-foreground",
                    "focus:bg-accent focus:text-accent-foreground focus:outline-none",
                    option.disabled && "pointer-events-none opacity-50",
                    value === option.value && "bg-accent",
                  )}
                  data-testid={
                    testId ? `${testId}-option-${option.value}` : undefined
                  }
                >
                  <Check
                    className={cn(
                      "mr-2 h-4 w-4",
                      value === option.value ? "opacity-100" : "opacity-0",
                    )}
                  />
                  {option.label}
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default Combobox;

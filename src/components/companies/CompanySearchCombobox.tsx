"use client";

import { useState, useEffect, useRef } from "react";
import { useDebounce } from "@/hooks/useDebounce";
import { useCompanies, type Company } from "@/lib/api/companies";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { Check, ChevronsUpDown, Loader2 } from "lucide-react";

interface CompanySearchComboboxProps {
  value?: string;
  onValueChange: (companyId: string, company: Company | null) => void;
  label?: string;
  placeholder?: string;
  disabled?: boolean;
  error?: string;
}

/**
 * CompanySearchCombobox component
 * Searchable dropdown for selecting companies with debounced search
 * Features:
 * - Debounced search (500ms) to minimize API calls
 * - Keyboard navigation (arrow keys, enter, escape)
 * - Shows loading state during search
 * - Displays company name and status
 * - Accessible with proper ARIA attributes
 */
export function CompanySearchCombobox({
  value,
  onValueChange,
  label = "Company",
  placeholder = "Search companies...",
  disabled = false,
  error,
}: CompanySearchComboboxProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const [selectedCompany, setSelectedCompany] = useState<Company | null>(null);
  const [highlightedIndex, setHighlightedIndex] = useState(0);

  const debouncedSearch = useDebounce(searchQuery, 500);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Fetch companies based on search query
  // Only fetch if search query is at least 2 characters
  // Filter to ACTIVE companies only for store creation
  const shouldFetch = debouncedSearch.trim().length >= 2;
  const { data: companiesData, isLoading } = useCompanies(
    {
      search: debouncedSearch || undefined,
      status: "ACTIVE",
      limit: 50,
    },
    { enabled: shouldFetch },
  );

  const companies = companiesData?.data || [];

  // Load selected company on mount if value is provided
  useEffect(() => {
    if (value && !selectedCompany) {
      const company = companies.find((c) => c.company_id === value);
      if (company) {
        setSelectedCompany(company);
        setSearchQuery(company.name);
      }
    }
  }, [value, companies, selectedCompany]);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Reset highlighted index when companies change
  useEffect(() => {
    setHighlightedIndex(0);
  }, [companies]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const query = e.target.value;
    setSearchQuery(query);
    setIsOpen(true);

    // Clear selection if user modifies the search
    if (selectedCompany && query !== selectedCompany.name) {
      setSelectedCompany(null);
      onValueChange("", null);
    }
  };

  const handleSelectCompany = (company: Company) => {
    setSelectedCompany(company);
    setSearchQuery(company.name);
    onValueChange(company.company_id, company);
    setIsOpen(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!isOpen && (e.key === "ArrowDown" || e.key === "ArrowUp")) {
      setIsOpen(true);
      return;
    }

    if (!isOpen) return;

    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        setHighlightedIndex((prev) =>
          prev < companies.length - 1 ? prev + 1 : prev,
        );
        break;
      case "ArrowUp":
        e.preventDefault();
        setHighlightedIndex((prev) => (prev > 0 ? prev - 1 : 0));
        break;
      case "Enter":
        e.preventDefault();
        if (companies[highlightedIndex]) {
          handleSelectCompany(companies[highlightedIndex]);
        }
        break;
      case "Escape":
        e.preventDefault();
        setIsOpen(false);
        break;
    }
  };

  const handleInputFocus = () => {
    setIsOpen(true);
  };

  return (
    <div ref={dropdownRef} className="relative space-y-2">
      {label && <Label htmlFor="company-search">{label}</Label>}

      <div className="relative">
        <Input
          ref={inputRef}
          id="company-search"
          type="text"
          value={searchQuery}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          onFocus={handleInputFocus}
          placeholder={placeholder}
          disabled={disabled}
          className={cn(
            "pr-10",
            error && "border-red-500 focus-visible:ring-red-500",
          )}
          autoComplete="off"
          role="combobox"
          aria-expanded={isOpen}
          aria-controls="company-listbox"
          aria-autocomplete="list"
          aria-activedescendant={
            isOpen && companies[highlightedIndex]
              ? `company-option-${highlightedIndex}`
              : undefined
          }
        />

        <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-3">
          {isLoading ? (
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          ) : (
            <ChevronsUpDown className="h-4 w-4 text-muted-foreground" />
          )}
        </div>
      </div>

      {error && <p className="text-sm text-red-500">{error}</p>}

      {isOpen && (
        <div
          id="company-listbox"
          role="listbox"
          className="absolute z-50 mt-1 max-h-60 w-full overflow-auto rounded-md border bg-popover shadow-md"
        >
          {searchQuery.trim().length < 2 ? (
            <div className="p-4 text-center text-sm text-muted-foreground">
              Type at least 2 characters to search
            </div>
          ) : isLoading ? (
            <div className="flex items-center justify-center p-4 text-sm text-muted-foreground">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Searching companies...
            </div>
          ) : companies.length === 0 ? (
            <div className="p-4 text-center text-sm text-muted-foreground">
              No active companies found matching &quot;{debouncedSearch}&quot;
            </div>
          ) : (
            <ul className="py-1">
              {companies.map((company, index) => {
                const isSelected =
                  selectedCompany?.company_id === company.company_id;
                const isHighlighted = highlightedIndex === index;

                return (
                  <li
                    key={company.company_id}
                    id={`company-option-${index}`}
                    role="option"
                    aria-selected={isSelected}
                    onClick={() => handleSelectCompany(company)}
                    onMouseEnter={() => setHighlightedIndex(index)}
                    className={cn(
                      "relative flex cursor-pointer select-none items-center px-3 py-2 text-sm outline-none transition-colors",
                      isHighlighted && "bg-accent",
                      isSelected && "font-medium",
                    )}
                  >
                    <div className="flex flex-1 items-center gap-2">
                      <span>{company.name}</span>
                      {company.status !== "ACTIVE" && (
                        <span className="text-xs text-muted-foreground">
                          ({company.status})
                        </span>
                      )}
                    </div>
                    {isSelected && <Check className="h-4 w-4" />}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}

      <p className="text-xs text-muted-foreground">
        Type at least 2 characters to search by company name, owner name, or
        owner email
      </p>
    </div>
  );
}

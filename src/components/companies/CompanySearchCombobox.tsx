"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import { useDebounce } from "@/hooks/useDebounce";
import { useCompanies, type Company } from "@/lib/api/companies";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { Check, ChevronsUpDown, Loader2, Clock } from "lucide-react";

interface CompanySearchComboboxProps {
  value?: string;
  onValueChange: (companyId: string, company: Company | null) => void;
  label?: string;
  placeholder?: string;
  disabled?: boolean;
  error?: string;
  /** Test ID for the input element */
  testId?: string;
}

/**
 * CompanySearchCombobox component
 * Searchable dropdown for selecting companies with debounced search
 * Features:
 * - Shows recent companies (top 10) on focus before typing
 * - Debounced search (500ms) to minimize API calls when typing
 * - Keyboard navigation (arrow keys, enter, escape)
 * - Shows loading state during search
 * - Displays company name and status
 * - Accessible with proper ARIA attributes
 */
export function CompanySearchCombobox({
  value,
  onValueChange,
  label = "Company",
  placeholder = "Search or select a company...",
  disabled = false,
  error,
  testId,
}: CompanySearchComboboxProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const [selectedCompany, setSelectedCompany] = useState<Company | null>(null);
  const [highlightedIndex, setHighlightedIndex] = useState(0);

  const debouncedSearch = useDebounce(searchQuery, 500);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Determine if we're in search mode (2+ characters typed)
  const isSearchMode = debouncedSearch.trim().length >= 2;

  // Fetch recent companies (shown on focus when no search query)
  // Fetches top 10 most recently active companies
  const { data: recentCompaniesData, isLoading: isLoadingRecent } =
    useCompanies(
      {
        status: "ACTIVE",
        limit: 10,
      },
      { enabled: isOpen && !isSearchMode },
    );

  // Fetch companies based on search query (only when searching)
  // Filter to ACTIVE companies only for store creation
  const { data: searchCompaniesData, isLoading: isLoadingSearch } =
    useCompanies(
      {
        search: debouncedSearch || undefined,
        status: "ACTIVE",
        limit: 50,
      },
      { enabled: isSearchMode },
    );

  // Determine which companies to display and loading state
  const isLoading = isSearchMode ? isLoadingSearch : isLoadingRecent;
  const companies = useMemo(() => {
    if (isSearchMode) {
      return searchCompaniesData?.data || [];
    }
    return recentCompaniesData?.data || [];
  }, [isSearchMode, searchCompaniesData?.data, recentCompaniesData?.data]);

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

  // Track if the value was ever set externally (controlled mode)
  const wasValueSet = useRef(false);
  useEffect(() => {
    if (value) {
      wasValueSet.current = true;
    }
  }, [value]);

  // Reset internal state when value prop is cleared externally (controlled mode only)
  useEffect(() => {
    if (!value && selectedCompany && wasValueSet.current) {
      setSelectedCompany(null);
      setSearchQuery("");
    }
  }, [value, selectedCompany]);

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
        // eslint-disable-next-line security/detect-object-injection -- highlightedIndex is a controlled number index
        if (companies[highlightedIndex]) {
          // eslint-disable-next-line security/detect-object-injection -- highlightedIndex is a controlled number index
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
            // eslint-disable-next-line security/detect-object-injection -- highlightedIndex is a controlled number index
            isOpen && companies[highlightedIndex]
              ? `company-option-${highlightedIndex}`
              : undefined
          }
          data-testid={testId}
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
          data-testid={testId ? `${testId}-dropdown` : undefined}
        >
          {isLoading ? (
            <div className="flex items-center justify-center p-4 text-sm text-muted-foreground">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              {isSearchMode
                ? "Searching companies..."
                : "Loading recent companies..."}
            </div>
          ) : companies.length === 0 ? (
            <div className="p-4 text-center text-sm text-muted-foreground">
              {isSearchMode
                ? `No active companies found matching "${debouncedSearch}"`
                : "No companies available"}
            </div>
          ) : (
            <>
              {/* Show header for recent companies when not searching */}
              {!isSearchMode && (
                <div className="flex items-center gap-2 border-b px-3 py-2 text-xs font-medium text-muted-foreground">
                  <Clock className="h-3 w-3" />
                  Recent Companies
                </div>
              )}
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
                      data-testid={
                        testId ? `${testId}-option-${index}` : undefined
                      }
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
            </>
          )}
        </div>
      )}

      <p className="text-xs text-muted-foreground">
        Click to see recent companies, or type to search by name, owner, or
        email
      </p>
    </div>
  );
}

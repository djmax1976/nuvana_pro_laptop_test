import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Currency formatter cache
 * Keyed by locale and currency to reuse Intl.NumberFormat instances
 */
const currencyFormatterCache = new Map<string, Intl.NumberFormat>();

/**
 * Get cache key for currency formatter
 */
function getFormatterKey(locale: string, currency: string): string {
  return `${locale}-${currency}`;
}

/**
 * Get or create a memoized currency formatter
 * @param locale - Locale string (e.g., "en-US", "en-GB")
 * @param currency - ISO 4217 currency code (e.g., "USD", "EUR", "GBP")
 * @returns Intl.NumberFormat instance
 */
function getCurrencyFormatter(
  locale: string = "en-US",
  currency: string = "USD",
): Intl.NumberFormat {
  const key = getFormatterKey(locale, currency);

  if (!currencyFormatterCache.has(key)) {
    currencyFormatterCache.set(
      key,
      new Intl.NumberFormat(locale, {
        style: "currency",
        currency,
      }),
    );
  }

  return currencyFormatterCache.get(key)!;
}

/**
 * Format a number as currency
 * Uses a memoized Intl.NumberFormat instance for performance
 *
 * @param value - The numeric value to format
 * @param currency - Optional ISO 4217 currency code (default: "USD")
 * @param locale - Optional locale string (default: "en-US")
 * @returns Formatted currency string
 *
 * @example
 * formatCurrency(1234.56) // "$1,234.56"
 * formatCurrency(1234.56, "EUR") // "€1,234.56"
 * formatCurrency(1234.56, "GBP", "en-GB") // "£1,234.56"
 */
export function formatCurrency(
  value: number,
  currency?: string,
  locale?: string,
): string {
  const formatter = getCurrencyFormatter(locale ?? "en-US", currency ?? "USD");
  return formatter.format(value);
}

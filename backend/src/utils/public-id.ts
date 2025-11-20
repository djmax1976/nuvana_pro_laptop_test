/**
 * Public ID generation utility
 * Generates enterprise-grade, prefixed public IDs for external-facing APIs
 *
 * Format: {prefix}_{cuid2}
 * Example: clt_clhzx1234abcd
 *
 * Benefits:
 * - Non-sequential (prevents enumeration attacks)
 * - Collision-resistant (cryptographically secure)
 * - K-sortable (maintains time-based ordering)
 * - Prefixed (prevents ID confusion across entities)
 * - URL-safe (no special characters)
 */

import { createId } from "@paralleldrive/cuid2";

/**
 * Entity prefixes for public IDs
 * Following Stripe's naming convention
 */
export const PUBLIC_ID_PREFIXES = {
  CLIENT: "clt",
  COMPANY: "cmp",
  STORE: "str",
  USER: "usr",
  TRANSACTION: "txn",
  SHIFT: "shf",
  POS_TERMINAL: "pos",
  ROLE: "rol",
  PERMISSION: "prm",
} as const;

export type PublicIdPrefix =
  (typeof PUBLIC_ID_PREFIXES)[keyof typeof PUBLIC_ID_PREFIXES];

/**
 * Generate a prefixed public ID
 *
 * @param prefix - Entity prefix (e.g., 'clt' for client)
 * @returns Prefixed public ID (e.g., 'clt_clhzx1234abcd')
 *
 * @example
 * const clientId = generatePublicId(PUBLIC_ID_PREFIXES.CLIENT);
 * // Returns: 'clt_clhzx1234abcd'
 */
export function generatePublicId(prefix: PublicIdPrefix): string {
  const id = createId();
  return `${prefix}_${id}`;
}

/**
 * Validate a public ID format
 *
 * @param publicId - The public ID to validate
 * @returns True if valid format, false otherwise
 *
 * @example
 * isValidPublicId('clt_clhzx1234'); // true
 * isValidPublicId('invalid'); // false
 */
export function isValidPublicId(publicId: string): boolean {
  // Format: prefix_id
  // Prefix: 3 lowercase letters
  // ID: alphanumeric characters (CUID2 format)
  const pattern = /^[a-z]{3}_[a-z0-9]{10,}$/;
  return pattern.test(publicId);
}

/**
 * Extract prefix from a public ID
 *
 * @param publicId - The public ID
 * @returns The prefix or null if invalid
 *
 * @example
 * extractPrefix('clt_clhzx1234'); // 'clt'
 */
export function extractPrefix(publicId: string): string | null {
  if (!isValidPublicId(publicId)) {
    return null;
  }
  return publicId.split("_")[0];
}

/**
 * Validate that a public ID matches expected prefix
 *
 * @param publicId - The public ID to validate
 * @param expectedPrefix - The expected prefix
 * @returns True if prefix matches
 *
 * @example
 * validatePrefix('clt_clhzx1234', PUBLIC_ID_PREFIXES.CLIENT); // true
 * validatePrefix('usr_abc123', PUBLIC_ID_PREFIXES.CLIENT); // false
 */
export function validatePrefix(
  publicId: string,
  expectedPrefix: PublicIdPrefix,
): boolean {
  const prefix = extractPrefix(publicId);
  return prefix === expectedPrefix;
}

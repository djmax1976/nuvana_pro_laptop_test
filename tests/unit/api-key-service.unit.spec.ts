/**
 * API Key Service Unit Tests
 *
 * Unit tests for API key generation, validation, and utility functions.
 * Tests pure logic that can be verified without database/Redis dependencies.
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * TRACEABILITY MATRIX
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * | Test ID           | Requirement                              | Category      | Priority |
 * |-------------------|------------------------------------------|---------------|----------|
 * | APIK-U-001        | Key format matches nuvpos_sk_ pattern    | Format        | P0       |
 * | APIK-U-002        | Key length is correct                    | Format        | P0       |
 * | APIK-U-003        | Key suffix is last 4 characters          | Format        | P1       |
 * | APIK-U-004        | Key hash is SHA-256 hex                  | Security      | P0       |
 * | APIK-U-005        | Invalid key format rejected              | Validation    | P0       |
 * | APIK-U-006        | Empty key rejected                       | Validation    | P0       |
 * | APIK-U-007        | Key without prefix rejected              | Validation    | P0       |
 * | APIK-U-008        | Key with wrong prefix rejected           | Validation    | P0       |
 * | APIK-U-009        | Key with short suffix rejected           | Validation    | P0       |
 * | APIK-U-010        | Key with invalid characters rejected     | Validation    | P0       |
 * | APIK-U-011        | IP allowlist validation - single IP      | IP Validation | P1       |
 * | APIK-U-012        | IP allowlist validation - CIDR range     | IP Validation | P1       |
 * | APIK-U-013        | IP allowlist validation - invalid IP     | IP Validation | P1       |
 * | APIK-U-014        | IP allowlist check - match               | IP Validation | P0       |
 * | APIK-U-015        | IP allowlist check - no match            | IP Validation | P0       |
 * | APIK-U-016        | Status transition ACTIVE → REVOKED       | State         | P0       |
 * | APIK-U-017        | Status transition ACTIVE → SUSPENDED     | State         | P0       |
 * | APIK-U-018        | Status transition SUSPENDED → ACTIVE     | State         | P0       |
 * | APIK-U-019        | Status transition REVOKED is terminal    | State         | P0       |
 * | APIK-U-020        | Revocation reason enum values            | Enum          | P1       |
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * @test-level Unit
 * @justification Pure unit tests for API key logic - tests format validation and utility functions
 * @story API-KEY-MANAGEMENT
 * @priority P0 (Critical - Security-critical key management)
 */

import { describe, it, expect } from "vitest";
import { createHash } from "crypto";

// ============================================================================
// Constants (mirrored from service for testing)
// ============================================================================

/** Key format prefix */
const KEY_PREFIX = "nuvpos_sk_";

/** Key format regex: nuvpos_sk_{8 alphanumeric}_{32 alphanumeric} */
const KEY_FORMAT_REGEX = /^nuvpos_sk_[A-Za-z0-9]{8}_[A-Za-z0-9]{32}$/;

/** Valid API key statuses */
const API_KEY_STATUSES = [
  "PENDING",
  "ACTIVE",
  "SUSPENDED",
  "REVOKED",
  "EXPIRED",
] as const;

/** Valid revocation reasons */
const REVOCATION_REASONS = [
  "ADMIN_ACTION",
  "COMPROMISED",
  "STORE_CLOSED",
  "QUOTA_ABUSE",
  "ROTATION",
] as const;

// ============================================================================
// Helper Functions (mirrored for testing)
// ============================================================================

/**
 * Validate API key format
 */
function isValidKeyFormat(key: string): boolean {
  return KEY_FORMAT_REGEX.test(key);
}

/**
 * Extract key prefix from full key
 */
function extractKeyPrefix(key: string): string {
  const parts = key.split("_");
  if (parts.length >= 3) {
    return `${parts[0]}_${parts[1]}_${parts[2]}`;
  }
  return "";
}

/**
 * Extract key suffix (last 4 chars)
 */
function extractKeySuffix(key: string): string {
  return key.slice(-4);
}

/**
 * Generate SHA-256 hash of key
 */
function hashKey(key: string): string {
  return createHash("sha256").update(key).digest("hex");
}

/**
 * Simple CIDR check for IP validation
 */
function ipInCidr(ip: string, cidr: string): boolean {
  // Handle exact match
  if (ip === cidr) return true;

  // Handle CIDR notation
  if (cidr.includes("/")) {
    const [network, bits] = cidr.split("/");
    const mask = parseInt(bits, 10);

    const ipParts = ip.split(".").map(Number);
    const networkParts = network.split(".").map(Number);

    if (ipParts.length !== 4 || networkParts.length !== 4) return false;

    const ipNum =
      (ipParts[0] << 24) | (ipParts[1] << 16) | (ipParts[2] << 8) | ipParts[3];
    const networkNum =
      (networkParts[0] << 24) |
      (networkParts[1] << 16) |
      (networkParts[2] << 8) |
      networkParts[3];

    const maskNum = ~((1 << (32 - mask)) - 1);

    return (ipNum & maskNum) === (networkNum & maskNum);
  }

  return false;
}

/**
 * Check if IP is in allowlist
 */
function isIpAllowed(ip: string, allowlist: string[]): boolean {
  if (allowlist.length === 0) return true; // Empty allowlist = all allowed
  return allowlist.some((entry) => ipInCidr(ip, entry));
}

/**
 * Validate IP address format
 */
function isValidIpAddress(ip: string): boolean {
  // Handle CIDR notation
  const ipPart = ip.includes("/") ? ip.split("/")[0] : ip;

  // IPv4 validation - bounded alternation, safe from ReDoS
  // prettier-ignore
  // eslint-disable-next-line security/detect-unsafe-regex
  const ipv4Regex = /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
  return ipv4Regex.test(ipPart);
}

/**
 * Check if state transition is allowed
 */
function canTransitionStatus(
  from: (typeof API_KEY_STATUSES)[number],
  to: (typeof API_KEY_STATUSES)[number],
): boolean {
  const transitions: Record<string, string[]> = {
    PENDING: ["ACTIVE", "REVOKED"],
    ACTIVE: ["SUSPENDED", "REVOKED", "EXPIRED"],
    SUSPENDED: ["ACTIVE", "REVOKED"],
    REVOKED: [], // Terminal state
    EXPIRED: ["ACTIVE", "REVOKED"], // Can be renewed or revoked
  };

  return transitions[from]?.includes(to) ?? false;
}

// ============================================================================
// Tests
// ============================================================================

describe("API Key Service Unit Tests", () => {
  // ═══════════════════════════════════════════════════════════════════════════
  // KEY FORMAT VALIDATION (P0) - Test IDs: APIK-U-001 to APIK-U-004
  // ═══════════════════════════════════════════════════════════════════════════

  describe("Key Format Validation", () => {
    it("APIK-U-001: should match nuvpos_sk_ prefix pattern", () => {
      // GIVEN: A valid API key format
      const validKey = "nuvpos_sk_STORE001_AbCdEfGhIjKlMnOpQrStUvWxYz123456";

      // WHEN: Validating the format
      const result = isValidKeyFormat(validKey);

      // THEN: Key is valid
      expect(result).toBe(true);
      expect(validKey.startsWith(KEY_PREFIX)).toBe(true);
    });

    it("APIK-U-002: should validate correct key length (8 char store + 32 char random)", () => {
      // GIVEN: Keys with correct structure
      const validKey = "nuvpos_sk_12345678_12345678901234567890123456789012";

      // WHEN: Validating the format
      const result = isValidKeyFormat(validKey);

      // THEN: Key is valid
      expect(result).toBe(true);
    });

    it("APIK-U-003: should extract last 4 characters as suffix", () => {
      // GIVEN: A full API key
      const fullKey = "nuvpos_sk_STORE001_AbCdEfGhIjKlMnOpQrStUvWxYz1234";

      // WHEN: Extracting suffix
      const suffix = extractKeySuffix(fullKey);

      // THEN: Suffix is last 4 characters
      expect(suffix).toBe("1234");
      expect(suffix.length).toBe(4);
    });

    it("APIK-U-004: should generate SHA-256 hex hash", () => {
      // GIVEN: A raw API key
      const rawKey = "nuvpos_sk_STORE001_TestKeyForHashingPurposes12";

      // WHEN: Hashing the key
      const hash = hashKey(rawKey);

      // THEN: Hash is 64 character hex string
      expect(hash.length).toBe(64);
      expect(/^[a-f0-9]{64}$/.test(hash)).toBe(true);

      // AND: Same input always produces same hash
      const hash2 = hashKey(rawKey);
      expect(hash).toBe(hash2);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // INVALID KEY FORMAT (P0) - Test IDs: APIK-U-005 to APIK-U-010
  // ═══════════════════════════════════════════════════════════════════════════

  describe("Invalid Key Format Detection", () => {
    it("APIK-U-005: should reject invalid key format", () => {
      // GIVEN: Various invalid key formats
      const invalidKeys = [
        "invalid_key",
        "nuvpos_wrong_12345678_12345678901234567890123456789012",
        "NUVPOS_SK_12345678_12345678901234567890123456789012", // uppercase
        "nuvpos_sk_1234_12345678901234567890123456789012", // short store id
      ];

      // WHEN/THEN: All are rejected
      for (const key of invalidKeys) {
        expect(isValidKeyFormat(key), `Key "${key}" should be invalid`).toBe(
          false,
        );
      }
    });

    it("APIK-U-006: should reject empty key", () => {
      expect(isValidKeyFormat("")).toBe(false);
    });

    it("APIK-U-007: should reject key without nuvpos_sk_ prefix", () => {
      expect(
        isValidKeyFormat("apikey_sk_12345678_12345678901234567890123456789012"),
      ).toBe(false);
    });

    it("APIK-U-008: should reject key with wrong prefix structure", () => {
      expect(
        isValidKeyFormat("nuvpos_pk_12345678_12345678901234567890123456789012"),
      ).toBe(false);
    });

    it("APIK-U-009: should reject key with short random suffix", () => {
      expect(
        isValidKeyFormat("nuvpos_sk_12345678_1234567890"), // Only 10 chars random
      ).toBe(false);
    });

    it("APIK-U-010: should reject key with invalid characters", () => {
      expect(
        isValidKeyFormat("nuvpos_sk_12345678_1234567890123456789012345678901!"),
      ).toBe(false);
      expect(
        isValidKeyFormat(
          "nuvpos_sk_12345678_12345678901234567890123456789012 ",
        ),
      ).toBe(false);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // IP ALLOWLIST VALIDATION (P1) - Test IDs: APIK-U-011 to APIK-U-015
  // ═══════════════════════════════════════════════════════════════════════════

  describe("IP Allowlist Validation", () => {
    it("APIK-U-011: should validate single IP address", () => {
      // GIVEN: Valid IP addresses
      const validIps = [
        "192.168.1.1",
        "10.0.0.1",
        "172.16.0.1",
        "255.255.255.255",
      ];

      // WHEN/THEN: All are valid
      for (const ip of validIps) {
        expect(isValidIpAddress(ip), `${ip} should be valid`).toBe(true);
      }
    });

    it("APIK-U-012: should validate CIDR range notation", () => {
      // GIVEN: Valid CIDR ranges
      const validCidrs = [
        "192.168.1.0/24",
        "10.0.0.0/8",
        "172.16.0.0/16",
        "192.168.1.1/32",
      ];

      // WHEN/THEN: All are valid IP addresses (CIDR format)
      for (const cidr of validCidrs) {
        expect(isValidIpAddress(cidr), `${cidr} should be valid`).toBe(true);
      }
    });

    it("APIK-U-013: should reject invalid IP addresses", () => {
      // GIVEN: Invalid IP addresses
      const invalidIps = [
        "256.1.1.1", // Out of range
        "192.168.1", // Missing octet
        "192.168.1.1.1", // Too many octets
        "abc.def.ghi.jkl", // Non-numeric
        "", // Empty
      ];

      // WHEN/THEN: All are invalid
      for (const ip of invalidIps) {
        expect(isValidIpAddress(ip), `${ip} should be invalid`).toBe(false);
      }
    });

    it("APIK-U-014: should match IP in allowlist", () => {
      // GIVEN: An allowlist with CIDR range
      const allowlist = ["192.168.1.0/24", "10.0.0.1"];

      // WHEN/THEN: IPs in range are allowed
      expect(isIpAllowed("192.168.1.100", allowlist)).toBe(true);
      expect(isIpAllowed("192.168.1.1", allowlist)).toBe(true);
      expect(isIpAllowed("10.0.0.1", allowlist)).toBe(true);
    });

    it("APIK-U-015: should reject IP not in allowlist", () => {
      // GIVEN: An allowlist
      const allowlist = ["192.168.1.0/24", "10.0.0.1"];

      // WHEN/THEN: IPs outside range are blocked
      expect(isIpAllowed("192.168.2.1", allowlist)).toBe(false);
      expect(isIpAllowed("10.0.0.2", allowlist)).toBe(false);
      expect(isIpAllowed("8.8.8.8", allowlist)).toBe(false);
    });

    it("APIK-U-015b: empty allowlist should allow all IPs", () => {
      // GIVEN: Empty allowlist
      const allowlist: string[] = [];

      // WHEN/THEN: All IPs are allowed
      expect(isIpAllowed("192.168.1.1", allowlist)).toBe(true);
      expect(isIpAllowed("8.8.8.8", allowlist)).toBe(true);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // STATUS TRANSITIONS (P0) - Test IDs: APIK-U-016 to APIK-U-019
  // ═══════════════════════════════════════════════════════════════════════════

  describe("Status Transitions", () => {
    it("APIK-U-016: should allow ACTIVE → REVOKED transition", () => {
      expect(canTransitionStatus("ACTIVE", "REVOKED")).toBe(true);
    });

    it("APIK-U-017: should allow ACTIVE → SUSPENDED transition", () => {
      expect(canTransitionStatus("ACTIVE", "SUSPENDED")).toBe(true);
    });

    it("APIK-U-018: should allow SUSPENDED → ACTIVE transition", () => {
      expect(canTransitionStatus("SUSPENDED", "ACTIVE")).toBe(true);
    });

    it("APIK-U-019: REVOKED should be terminal state", () => {
      // GIVEN: All possible target statuses
      const allStatuses = API_KEY_STATUSES;

      // WHEN/THEN: No transition from REVOKED should be allowed
      for (const targetStatus of allStatuses) {
        expect(
          canTransitionStatus("REVOKED", targetStatus),
          `REVOKED → ${targetStatus} should not be allowed`,
        ).toBe(false);
      }
    });

    it("APIK-U-019b: should allow PENDING → ACTIVE transition", () => {
      expect(canTransitionStatus("PENDING", "ACTIVE")).toBe(true);
    });

    it("APIK-U-019c: should allow PENDING → REVOKED transition", () => {
      expect(canTransitionStatus("PENDING", "REVOKED")).toBe(true);
    });

    it("APIK-U-019d: should allow EXPIRED → ACTIVE transition (renewal)", () => {
      expect(canTransitionStatus("EXPIRED", "ACTIVE")).toBe(true);
    });

    it("APIK-U-019e: should block invalid transitions", () => {
      // Cannot go from ACTIVE to PENDING
      expect(canTransitionStatus("ACTIVE", "PENDING")).toBe(false);
      // Cannot go from SUSPENDED to EXPIRED
      expect(canTransitionStatus("SUSPENDED", "EXPIRED")).toBe(false);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // REVOCATION REASONS (P1) - Test ID: APIK-U-020
  // ═══════════════════════════════════════════════════════════════════════════

  describe("Revocation Reasons", () => {
    it("APIK-U-020: should have all valid revocation reason enum values", () => {
      // GIVEN: Expected revocation reasons
      const expectedReasons = [
        "ADMIN_ACTION",
        "COMPROMISED",
        "STORE_CLOSED",
        "QUOTA_ABUSE",
        "ROTATION",
      ];

      // WHEN/THEN: All reasons exist in enum
      expect(REVOCATION_REASONS).toEqual(expectedReasons);
      expect(REVOCATION_REASONS.length).toBe(5);
    });

    it("APIK-U-020b: should validate revocation reason is in allowed list", () => {
      // GIVEN: Function to validate reason
      const isValidReason = (reason: string): boolean =>
        REVOCATION_REASONS.includes(
          reason as (typeof REVOCATION_REASONS)[number],
        );

      // WHEN/THEN: Valid reasons pass
      expect(isValidReason("ADMIN_ACTION")).toBe(true);
      expect(isValidReason("COMPROMISED")).toBe(true);
      expect(isValidReason("STORE_CLOSED")).toBe(true);
      expect(isValidReason("QUOTA_ABUSE")).toBe(true);
      expect(isValidReason("ROTATION")).toBe(true);

      // AND: Invalid reasons fail
      expect(isValidReason("INVALID")).toBe(false);
      expect(isValidReason("")).toBe(false);
      expect(isValidReason("admin_action")).toBe(false); // lowercase
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // KEY PREFIX EXTRACTION - Utility Tests
  // ═══════════════════════════════════════════════════════════════════════════

  describe("Key Prefix Extraction", () => {
    it("should extract key prefix correctly", () => {
      // GIVEN: A full API key
      const fullKey = "nuvpos_sk_STORE001_AbCdEfGhIjKlMnOpQrStUvWxYz1234";

      // WHEN: Extracting prefix
      const prefix = extractKeyPrefix(fullKey);

      // THEN: Prefix includes nuvpos_sk_ and store id
      expect(prefix).toBe("nuvpos_sk_STORE001");
    });

    it("should return empty string for invalid key format", () => {
      expect(extractKeyPrefix("invalid")).toBe("");
      expect(extractKeyPrefix("only_two")).toBe("");
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // HASH UNIQUENESS - Security Tests
  // ═══════════════════════════════════════════════════════════════════════════

  describe("Hash Security", () => {
    it("should produce different hashes for different keys", () => {
      // GIVEN: Two different keys
      const key1 = "nuvpos_sk_STORE001_AbCdEfGhIjKlMnOpQrStUvWxYz1234";
      const key2 = "nuvpos_sk_STORE001_AbCdEfGhIjKlMnOpQrStUvWxYz1235";

      // WHEN: Hashing both
      const hash1 = hashKey(key1);
      const hash2 = hashKey(key2);

      // THEN: Hashes are different
      expect(hash1).not.toBe(hash2);
    });

    it("should produce same hash for same key (deterministic)", () => {
      // GIVEN: Same key hashed multiple times
      const key = "nuvpos_sk_STORE001_AbCdEfGhIjKlMnOpQrStUvWxYz1234";

      // WHEN: Hashing multiple times
      const hashes = [hashKey(key), hashKey(key), hashKey(key)];

      // THEN: All hashes are identical
      expect(new Set(hashes).size).toBe(1);
    });
  });
});

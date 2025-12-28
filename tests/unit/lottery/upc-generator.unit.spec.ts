/**
 * UPC Generator Service Unit Tests
 *
 * Tests for the pure functions that generate 12-digit lottery ticket UPCs.
 *
 * UPC Formula:
 * [Game Code first 2 digits] + [Pack Number 7 digits] + [Ticket Number 3 digits]
 *
 * @module tests/unit/lottery/upc-generator.unit.spec
 */

import { describe, it, expect } from "vitest";
import {
  generatePackUPCs,
  validateGameCode,
  validatePackNumber,
  validateTicketsPerPack,
  parseUPC,
  isValidUPC,
  type UPCGenerationInput,
} from "../../../backend/src/services/lottery/upc-generator.service";

describe("UPC Generator Service", () => {
  // ===========================================================================
  // Game Code Validation Tests
  // ===========================================================================
  describe("validateGameCode", () => {
    it("should accept valid 4-digit game code", () => {
      const result = validateGameCode("0033");
      expect(result.valid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it("should accept game code with all zeros", () => {
      const result = validateGameCode("0000");
      expect(result.valid).toBe(true);
    });

    it("should accept game code with all nines", () => {
      const result = validateGameCode("9999");
      expect(result.valid).toBe(true);
    });

    it("should reject empty game code", () => {
      const result = validateGameCode("");
      expect(result.valid).toBe(false);
      expect(result.error).toContain("required");
    });

    it("should reject null game code", () => {
      const result = validateGameCode(null as unknown as string);
      expect(result.valid).toBe(false);
    });

    it("should reject undefined game code", () => {
      const result = validateGameCode(undefined as unknown as string);
      expect(result.valid).toBe(false);
    });

    it("should reject 3-digit game code", () => {
      const result = validateGameCode("003");
      expect(result.valid).toBe(false);
      expect(result.error).toContain("exactly 4 digits");
    });

    it("should reject 5-digit game code", () => {
      const result = validateGameCode("00033");
      expect(result.valid).toBe(false);
      expect(result.error).toContain("exactly 4 digits");
    });

    it("should reject game code with letters", () => {
      const result = validateGameCode("00AB");
      expect(result.valid).toBe(false);
    });

    it("should reject game code with special characters", () => {
      const result = validateGameCode("00-3");
      expect(result.valid).toBe(false);
    });
  });

  // ===========================================================================
  // Pack Number Validation Tests
  // ===========================================================================
  describe("validatePackNumber", () => {
    it("should accept valid 7-digit pack number", () => {
      const result = validatePackNumber("5633005");
      expect(result.valid).toBe(true);
    });

    it("should accept 1-digit pack number (will be padded)", () => {
      const result = validatePackNumber("1");
      expect(result.valid).toBe(true);
    });

    it("should accept 5-digit pack number (will be padded)", () => {
      const result = validatePackNumber("12345");
      expect(result.valid).toBe(true);
    });

    it("should reject empty pack number", () => {
      const result = validatePackNumber("");
      expect(result.valid).toBe(false);
      expect(result.error).toContain("required");
    });

    it("should reject null pack number", () => {
      const result = validatePackNumber(null as unknown as string);
      expect(result.valid).toBe(false);
    });

    it("should reject 8-digit pack number", () => {
      const result = validatePackNumber("12345678");
      expect(result.valid).toBe(false);
      expect(result.error).toContain("1-7 digits");
    });

    it("should reject pack number with letters", () => {
      const result = validatePackNumber("123ABC7");
      expect(result.valid).toBe(false);
    });

    it("should reject pack number with spaces", () => {
      const result = validatePackNumber("123 456");
      expect(result.valid).toBe(false);
    });
  });

  // ===========================================================================
  // Tickets Per Pack Validation Tests
  // ===========================================================================
  describe("validateTicketsPerPack", () => {
    it("should accept 15 tickets ($20 pack)", () => {
      const result = validateTicketsPerPack(15);
      expect(result.valid).toBe(true);
    });

    it("should accept 30 tickets ($10 pack)", () => {
      const result = validateTicketsPerPack(30);
      expect(result.valid).toBe(true);
    });

    it("should accept 60 tickets ($5 pack)", () => {
      const result = validateTicketsPerPack(60);
      expect(result.valid).toBe(true);
    });

    it("should accept 150 tickets ($2 pack)", () => {
      const result = validateTicketsPerPack(150);
      expect(result.valid).toBe(true);
    });

    it("should accept 300 tickets ($1 pack)", () => {
      const result = validateTicketsPerPack(300);
      expect(result.valid).toBe(true);
    });

    it("should accept 1 ticket (minimum)", () => {
      const result = validateTicketsPerPack(1);
      expect(result.valid).toBe(true);
    });

    it("should accept 999 tickets (maximum)", () => {
      const result = validateTicketsPerPack(999);
      expect(result.valid).toBe(true);
    });

    it("should reject 0 tickets", () => {
      const result = validateTicketsPerPack(0);
      expect(result.valid).toBe(false);
      expect(result.error).toContain("at least 1");
    });

    it("should reject negative tickets", () => {
      const result = validateTicketsPerPack(-5);
      expect(result.valid).toBe(false);
    });

    it("should reject 1000 tickets (exceeds 3-digit limit)", () => {
      const result = validateTicketsPerPack(1000);
      expect(result.valid).toBe(false);
      expect(result.error).toContain("cannot exceed 999");
    });

    it("should reject non-integer", () => {
      const result = validateTicketsPerPack(15.5);
      expect(result.valid).toBe(false);
      expect(result.error).toContain("integer");
    });

    it("should reject string value", () => {
      const result = validateTicketsPerPack("15" as unknown as number);
      expect(result.valid).toBe(false);
    });
  });

  // ===========================================================================
  // UPC Generation Tests
  // ===========================================================================
  describe("generatePackUPCs", () => {
    it("should generate correct UPCs for a $20 pack with 15 tickets", () => {
      const input: UPCGenerationInput = {
        gameCode: "0333", // First 2 digits = "03"
        packNumber: "5633005",
        ticketsPerPack: 15,
      };

      const result = generatePackUPCs(input);

      expect(result.success).toBe(true);
      expect(result.upcs).toHaveLength(15);
      expect(result.upcs[0]).toBe("035633005000"); // First ticket
      expect(result.upcs[14]).toBe("035633005014"); // Last ticket
    });

    it("should use first 2 digits of game code for UPC prefix", () => {
      const input: UPCGenerationInput = {
        gameCode: "1234",
        packNumber: "0000001",
        ticketsPerPack: 3,
      };

      const result = generatePackUPCs(input);

      expect(result.success).toBe(true);
      expect(result.upcs[0].substring(0, 2)).toBe("12"); // First 2 digits of game code
    });

    it("should pad short pack numbers to 7 digits", () => {
      const input: UPCGenerationInput = {
        gameCode: "0333", // First 2 digits = "03"
        packNumber: "123", // Short pack number
        ticketsPerPack: 2,
      };

      const result = generatePackUPCs(input);

      expect(result.success).toBe(true);
      // Pack number "123" should become "0000123"
      expect(result.upcs[0]).toBe("030000123000");
      expect(result.upcs[1]).toBe("030000123001");
    });

    it("should generate 3-digit ticket numbers starting from 000", () => {
      const input: UPCGenerationInput = {
        gameCode: "0055", // Any valid game code
        packNumber: "1234567",
        ticketsPerPack: 5,
      };

      const result = generatePackUPCs(input);

      expect(result.success).toBe(true);
      expect(result.upcs[0].slice(-3)).toBe("000");
      expect(result.upcs[1].slice(-3)).toBe("001");
      expect(result.upcs[2].slice(-3)).toBe("002");
      expect(result.upcs[3].slice(-3)).toBe("003");
      expect(result.upcs[4].slice(-3)).toBe("004");
    });

    it("should generate all 12-digit UPCs", () => {
      const input: UPCGenerationInput = {
        gameCode: "0055", // Any valid game code
        packNumber: "5633005",
        ticketsPerPack: 15,
      };

      const result = generatePackUPCs(input);

      expect(result.success).toBe(true);
      result.upcs.forEach((upc) => {
        expect(upc).toHaveLength(12);
        expect(upc).toMatch(/^\d{12}$/);
      });
    });

    it("should include correct metadata", () => {
      const input: UPCGenerationInput = {
        gameCode: "0333", // First 2 digits = "03"
        packNumber: "5633005",
        ticketsPerPack: 15,
      };

      const result = generatePackUPCs(input);

      expect(result.success).toBe(true);
      expect(result.metadata.gameCodePrefix).toBe("03");
      expect(result.metadata.packNumber).toBe("5633005");
      expect(result.metadata.ticketCount).toBe(15);
      expect(result.metadata.firstUpc).toBe("035633005000");
      expect(result.metadata.lastUpc).toBe("035633005014");
    });

    it("should fail with invalid game code", () => {
      const input: UPCGenerationInput = {
        gameCode: "00", // Invalid - too short
        packNumber: "5633005",
        ticketsPerPack: 15,
      };

      const result = generatePackUPCs(input);

      expect(result.success).toBe(false);
      expect(result.upcs).toHaveLength(0);
      expect(result.error).toContain("exactly 4 digits");
    });

    it("should fail with invalid pack number", () => {
      const input: UPCGenerationInput = {
        gameCode: "0055", // Any valid game code
        packNumber: "12345678", // Invalid - too long
        ticketsPerPack: 15,
      };

      const result = generatePackUPCs(input);

      expect(result.success).toBe(false);
      expect(result.upcs).toHaveLength(0);
      expect(result.error).toContain("1-7 digits");
    });

    it("should fail with invalid tickets per pack", () => {
      const input: UPCGenerationInput = {
        gameCode: "0055", // Any valid game code
        packNumber: "5633005",
        ticketsPerPack: 1000, // Invalid - exceeds 999
      };

      const result = generatePackUPCs(input);

      expect(result.success).toBe(false);
      expect(result.upcs).toHaveLength(0);
      expect(result.error).toContain("cannot exceed 999");
    });

    it("should handle single ticket pack", () => {
      const input: UPCGenerationInput = {
        gameCode: "0333", // First 2 digits = "03"
        packNumber: "5633005",
        ticketsPerPack: 1,
      };

      const result = generatePackUPCs(input);

      expect(result.success).toBe(true);
      expect(result.upcs).toHaveLength(1);
      expect(result.upcs[0]).toBe("035633005000");
    });

    it("should handle maximum 999 tickets", () => {
      const input: UPCGenerationInput = {
        gameCode: "0055", // First 2 digits = "00"
        packNumber: "5633005",
        ticketsPerPack: 999,
      };

      const result = generatePackUPCs(input);

      expect(result.success).toBe(true);
      expect(result.upcs).toHaveLength(999);
      expect(result.upcs[998]).toBe("005633005998"); // Last ticket is 998 (0-indexed)
    });
  });

  // ===========================================================================
  // UPC Parsing Tests
  // ===========================================================================
  describe("parseUPC", () => {
    it("should parse valid 12-digit UPC", () => {
      const result = parseUPC("035633005014");

      expect(result).not.toBeNull();
      expect(result!.gameCodePrefix).toBe("03");
      expect(result!.packNumber).toBe("5633005");
      expect(result!.ticketNumber).toBe("014");
    });

    it("should return null for 11-digit string", () => {
      const result = parseUPC("03563300501");
      expect(result).toBeNull();
    });

    it("should return null for 13-digit string", () => {
      const result = parseUPC("0356330050140");
      expect(result).toBeNull();
    });

    it("should return null for empty string", () => {
      const result = parseUPC("");
      expect(result).toBeNull();
    });

    it("should return null for null input", () => {
      const result = parseUPC(null as unknown as string);
      expect(result).toBeNull();
    });

    it("should return null for undefined input", () => {
      const result = parseUPC(undefined as unknown as string);
      expect(result).toBeNull();
    });

    it("should return null for UPC with letters", () => {
      const result = parseUPC("03563300501A");
      expect(result).toBeNull();
    });

    it("should return null for UPC with special characters", () => {
      const result = parseUPC("03-5633005-1");
      expect(result).toBeNull();
    });
  });

  // ===========================================================================
  // UPC Validation Tests
  // ===========================================================================
  describe("isValidUPC", () => {
    it("should return true for valid 12-digit UPC", () => {
      expect(isValidUPC("035633005014")).toBe(true);
    });

    it("should return true for UPC with all zeros", () => {
      expect(isValidUPC("000000000000")).toBe(true);
    });

    it("should return true for UPC with all nines", () => {
      expect(isValidUPC("999999999999")).toBe(true);
    });

    it("should return false for 11-digit string", () => {
      expect(isValidUPC("03563300501")).toBe(false);
    });

    it("should return false for 13-digit string", () => {
      expect(isValidUPC("0356330050140")).toBe(false);
    });

    it("should return false for empty string", () => {
      expect(isValidUPC("")).toBe(false);
    });

    it("should return false for string with letters", () => {
      expect(isValidUPC("03563300501A")).toBe(false);
    });

    it("should return false for null", () => {
      expect(isValidUPC(null as unknown as string)).toBe(false);
    });

    it("should return false for undefined", () => {
      expect(isValidUPC(undefined as unknown as string)).toBe(false);
    });

    it("should return false for number type", () => {
      expect(isValidUPC(35633005014 as unknown as string)).toBe(false);
    });
  });

  // ===========================================================================
  // Edge Cases and Real-World Scenarios
  // ===========================================================================
  describe("Real-World Scenarios", () => {
    it("should generate correct UPCs for $1 scratch-off (300 tickets)", () => {
      const input: UPCGenerationInput = {
        gameCode: "0001",
        packNumber: "1000001",
        ticketsPerPack: 300,
      };

      const result = generatePackUPCs(input);

      expect(result.success).toBe(true);
      expect(result.upcs).toHaveLength(300);
      expect(result.upcs[0]).toBe("001000001000"); // First: ticket 000
      expect(result.upcs[299]).toBe("001000001299"); // Last: ticket 299
    });

    it("should generate correct UPCs for $2 scratch-off (150 tickets)", () => {
      const input: UPCGenerationInput = {
        gameCode: "0002",
        packNumber: "2000001",
        ticketsPerPack: 150,
      };

      const result = generatePackUPCs(input);

      expect(result.success).toBe(true);
      expect(result.upcs).toHaveLength(150);
      expect(result.upcs[0]).toBe("002000001000");
      expect(result.upcs[149]).toBe("002000001149");
    });

    it("should generate correct UPCs for $5 scratch-off (60 tickets)", () => {
      const input: UPCGenerationInput = {
        gameCode: "0005",
        packNumber: "5000001",
        ticketsPerPack: 60,
      };

      const result = generatePackUPCs(input);

      expect(result.success).toBe(true);
      expect(result.upcs).toHaveLength(60);
      expect(result.upcs[0]).toBe("005000001000");
      expect(result.upcs[59]).toBe("005000001059");
    });

    it("should generate correct UPCs for $10 scratch-off (30 tickets)", () => {
      const input: UPCGenerationInput = {
        gameCode: "0010",
        packNumber: "1000001",
        ticketsPerPack: 30,
      };

      const result = generatePackUPCs(input);

      expect(result.success).toBe(true);
      expect(result.upcs).toHaveLength(30);
      // First 2 digits of "0010" = "00"
      expect(result.upcs[0]).toBe("001000001000");
      expect(result.upcs[29]).toBe("001000001029");
    });

    it("should generate correct UPCs for $20 scratch-off (15 tickets)", () => {
      const input: UPCGenerationInput = {
        gameCode: "0020",
        packNumber: "2000001",
        ticketsPerPack: 15,
      };

      const result = generatePackUPCs(input);

      expect(result.success).toBe(true);
      expect(result.upcs).toHaveLength(15);
      // First 2 digits of "0020" = "00"
      expect(result.upcs[0]).toBe("002000001000");
      expect(result.upcs[14]).toBe("002000001014");
    });

    it("should handle game code with high number", () => {
      const input: UPCGenerationInput = {
        gameCode: "9999",
        packNumber: "9999999",
        ticketsPerPack: 5,
      };

      const result = generatePackUPCs(input);

      expect(result.success).toBe(true);
      expect(result.upcs[0]).toBe("999999999000");
      expect(result.upcs[4]).toBe("999999999004");
    });

    it("should handle pack number starting with zeros", () => {
      const input: UPCGenerationInput = {
        gameCode: "0033", // First 2 digits = "00"
        packNumber: "0000001", // Leading zeros
        ticketsPerPack: 3,
      };

      const result = generatePackUPCs(input);

      expect(result.success).toBe(true);
      // First 2 digits of "0033" = "00", packNumber = "0000001"
      expect(result.upcs[0]).toBe("000000001000");
    });
  });
});

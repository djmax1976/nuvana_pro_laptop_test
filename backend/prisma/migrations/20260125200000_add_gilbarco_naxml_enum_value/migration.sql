-- Migration: Add GILBARCO_NAXML to POSSystemType enum
-- Purpose: Add the NAXML file-based exchange type for Gilbarco Passport XMLGateway
-- Required for: Store-level POS configuration to support NAXML file imports

-- Add GILBARCO_NAXML enum value
ALTER TYPE "POSSystemType" ADD VALUE IF NOT EXISTS 'GILBARCO_NAXML' AFTER 'GILBARCO_PASSPORT';

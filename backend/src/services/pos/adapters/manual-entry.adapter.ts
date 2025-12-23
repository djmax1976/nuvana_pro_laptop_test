/**
 * Manual Entry POS Adapter
 *
 * A no-op adapter for stores that don't have POS integration.
 * Returns empty arrays for all sync operations.
 *
 * @module services/pos/adapters/manual-entry.adapter
 */

import { BasePOSAdapter } from "../base-adapter";
import type {
  POSConnectionConfig,
  POSConnectionTestResult,
  POSDepartment,
  POSTenderType,
  POSCashier,
  POSTaxRate,
  POSAdapterCapabilities,
} from "../../../types/pos-integration.types";
import type { POSSystemType } from "@prisma/client";

/**
 * Manual Entry POS Adapter
 *
 * Used for stores that manually enter data rather than syncing from a POS.
 * All sync operations return empty arrays.
 */
export class ManualEntryAdapter extends BasePOSAdapter {
  readonly posType: POSSystemType = "MANUAL_ENTRY";
  readonly displayName = "Manual Entry (No POS)";

  /**
   * Get adapter capabilities
   * All sync capabilities are disabled for manual entry
   */
  getCapabilities(): POSAdapterCapabilities {
    return {
      syncDepartments: false,
      syncTenderTypes: false,
      syncCashiers: false,
      syncTaxRates: false,
      syncProducts: false,
      realTimeTransactions: false,
      webhookSupport: false,
    };
  }

  /**
   * Test connection always succeeds for manual entry
   */
  async testConnection(
    _config: POSConnectionConfig,
  ): Promise<POSConnectionTestResult> {
    return {
      success: true,
      message: "Manual entry mode - no POS connection required",
      latencyMs: 0,
    };
  }

  /**
   * Return empty departments array
   */
  async syncDepartments(
    _config: POSConnectionConfig,
  ): Promise<POSDepartment[]> {
    this.log("info", "Manual entry mode - no departments to sync");
    return [];
  }

  /**
   * Return empty tender types array
   */
  async syncTenderTypes(
    _config: POSConnectionConfig,
  ): Promise<POSTenderType[]> {
    this.log("info", "Manual entry mode - no tender types to sync");
    return [];
  }

  /**
   * Return empty cashiers array
   */
  async syncCashiers(_config: POSConnectionConfig): Promise<POSCashier[]> {
    this.log("info", "Manual entry mode - no cashiers to sync");
    return [];
  }

  /**
   * Return empty tax rates array
   */
  async syncTaxRates(_config: POSConnectionConfig): Promise<POSTaxRate[]> {
    this.log("info", "Manual entry mode - no tax rates to sync");
    return [];
  }
}

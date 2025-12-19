/**
 * POS Adapter Registry
 *
 * Central registry for all POS adapters. Provides a factory method
 * to get the appropriate adapter for a given POS type.
 *
 * @module services/pos/adapter-registry
 */

import type { POSAdapter } from "../../types/pos-integration.types";
import type { POSSystemType } from "@prisma/client";

import { GilbarcoPassportAdapter } from "./adapters/gilbarco-passport.adapter";
import { ManualEntryAdapter } from "./adapters/manual-entry.adapter";

/**
 * Singleton registry for POS adapters
 */
class POSAdapterRegistry {
  private readonly adapters: Map<POSSystemType, POSAdapter>;

  constructor() {
    this.adapters = new Map();
    this.registerDefaultAdapters();
  }

  /**
   * Register the default set of adapters
   */
  private registerDefaultAdapters(): void {
    // Gilbarco adapters
    this.register(new GilbarcoPassportAdapter());

    // Manual entry (no POS)
    this.register(new ManualEntryAdapter());

    // TODO: Add more adapters as they're implemented
    // this.register(new GilbarcoCommanderAdapter());
    // this.register(new VerifoneRuby2Adapter());
    // this.register(new CloverAdapter());
    // this.register(new SquareAdapter());
  }

  /**
   * Register an adapter
   */
  register(adapter: POSAdapter): void {
    this.adapters.set(adapter.posType, adapter);
    console.log(
      `[POSAdapterRegistry] Registered adapter: ${adapter.displayName} (${adapter.posType})`,
    );
  }

  /**
   * Get an adapter by POS type
   * @throws Error if adapter not found
   */
  getAdapter(posType: POSSystemType): POSAdapter {
    const adapter = this.adapters.get(posType);

    if (!adapter) {
      throw new Error(`No adapter registered for POS type: ${posType}`);
    }

    return adapter;
  }

  /**
   * Check if an adapter is registered for a POS type
   */
  hasAdapter(posType: POSSystemType): boolean {
    return this.adapters.has(posType);
  }

  /**
   * Get all registered POS types
   */
  getRegisteredTypes(): POSSystemType[] {
    return Array.from(this.adapters.keys());
  }

  /**
   * Get all adapters with their display names
   */
  getAdapterList(): Array<{ posType: POSSystemType; displayName: string }> {
    return Array.from(this.adapters.entries()).map(([posType, adapter]) => ({
      posType,
      displayName: adapter.displayName,
    }));
  }
}

/**
 * Singleton instance of the adapter registry
 */
export const posAdapterRegistry = new POSAdapterRegistry();

/**
 * Get an adapter for a specific POS type
 * Convenience function that delegates to the registry
 */
export function getPOSAdapter(posType: POSSystemType): POSAdapter {
  return posAdapterRegistry.getAdapter(posType);
}

/**
 * Check if an adapter exists for a POS type
 */
export function hasPOSAdapter(posType: POSSystemType): boolean {
  return posAdapterRegistry.hasAdapter(posType);
}

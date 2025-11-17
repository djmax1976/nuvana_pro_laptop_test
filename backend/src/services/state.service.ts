/**
 * State Management Service for OAuth CSRF Protection
 *
 * In-memory state store for development and testing.
 * In production, this should be replaced with Redis or another distributed cache.
 *
 * This service manages OAuth state parameters to prevent CSRF attacks by:
 * 1. Generating unique state values before OAuth redirect
 * 2. Storing state values with TTL (time-to-live)
 * 3. Validating state on callback (single-use, auto-delete after validation)
 */

interface StateEntry {
  state: string;
  createdAt: number;
  ttl: number; // milliseconds
}

class StateService {
  private states: Map<string, StateEntry> = new Map();
  private cleanupInterval: NodeJS.Timeout | null = null;

  constructor() {
    // Run cleanup every 60 seconds to remove expired states
    this.cleanupInterval = setInterval(() => {
      this.cleanupExpiredStates();
    }, 60000);
  }

  /**
   * Generate and store a new state parameter
   * @param ttl - Time-to-live in milliseconds (default: 5 minutes)
   * @returns Generated state string
   */
  generateState(ttl: number = 5 * 60 * 1000): string {
    const state = this.generateRandomString(32);
    this.states.set(state, {
      state,
      createdAt: Date.now(),
      ttl,
    });
    return state;
  }

  /**
   * Validate and consume a state parameter (single-use)
   * @param state - State parameter to validate
   * @returns True if valid, false if invalid or expired
   */
  validateState(state: string): boolean {
    const entry = this.states.get(state);

    if (!entry) {
      return false; // State not found
    }

    // Check if expired
    const now = Date.now();
    if (now - entry.createdAt > entry.ttl) {
      this.states.delete(state); // Clean up expired state
      return false;
    }

    // State is valid - delete it (single-use)
    this.states.delete(state);
    return true;
  }

  /**
   * Manually store a state (for testing purposes)
   * @param state - State string to store
   * @param ttl - Time-to-live in milliseconds (default: 5 minutes)
   */
  storeState(state: string, ttl: number = 5 * 60 * 1000): void {
    this.states.set(state, {
      state,
      createdAt: Date.now(),
      ttl,
    });
  }

  /**
   * Check if a state exists (without consuming it)
   * @param state - State parameter to check
   * @returns True if exists and not expired, false otherwise
   */
  hasState(state: string): boolean {
    const entry = this.states.get(state);
    if (!entry) {
      return false;
    }

    const now = Date.now();
    if (now - entry.createdAt > entry.ttl) {
      this.states.delete(state);
      return false;
    }

    return true;
  }

  /**
   * Remove expired states from memory
   */
  private cleanupExpiredStates(): void {
    const now = Date.now();
    for (const [state, entry] of this.states.entries()) {
      if (now - entry.createdAt > entry.ttl) {
        this.states.delete(state);
      }
    }
  }

  /**
   * Generate cryptographically random string
   * @param length - Length of string to generate
   * @returns Random string
   */
  private generateRandomString(length: number): string {
    const chars =
      "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
    let result = "";
    const crypto = require("crypto");
    const randomBytes = crypto.randomBytes(length);

    for (let i = 0; i < length; i++) {
      result += chars[randomBytes[i] % chars.length];
    }

    return result;
  }

  /**
   * Clear all states (for testing)
   */
  clearAll(): void {
    this.states.clear();
  }

  /**
   * Get number of stored states (for monitoring/testing)
   */
  getCount(): number {
    return this.states.size;
  }

  /**
   * Cleanup on shutdown
   */
  destroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
    this.states.clear();
  }
}

// Singleton instance
export const stateService = new StateService();

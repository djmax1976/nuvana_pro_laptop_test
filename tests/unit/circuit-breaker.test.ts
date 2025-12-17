/**
 * Circuit Breaker Unit Tests
 *
 * Tests for the circuit breaker pattern implementation used for database
 * and service resilience in Phase 5.
 *
 * @test-level Unit
 * @justification Tests pure circuit breaker logic in isolation
 * @story Phase 5 - Rate Limit/Circuit Breaker
 * @priority P1 (High - Core resilience logic)
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  CircuitBreaker,
  CircuitState,
  CircuitOpenError,
  CircuitTimeoutError,
  circuitBreakerRegistry,
} from "../../backend/src/utils/circuit-breaker";

describe("Phase5-UNIT: Circuit Breaker", () => {
  // ═══════════════════════════════════════════════════════════════════════════
  // CIRCUIT STATE MANAGEMENT TESTS
  // ═══════════════════════════════════════════════════════════════════════════

  describe("Circuit State Transitions", () => {
    let breaker: CircuitBreaker;

    beforeEach(() => {
      breaker = new CircuitBreaker({
        name: "test-circuit",
        timeout: 1000,
        failureThreshold: 3,
        failureRateThreshold: 50,
        volumeThreshold: 5,
        resetTimeout: 100, // Short for testing
        successThreshold: 2,
      });
    });

    it("should start in CLOSED state", () => {
      expect(breaker.getState()).toBe(CircuitState.CLOSED);
    });

    it("should remain CLOSED after successful operations", async () => {
      // Execute successful operations
      await breaker.fire(() => Promise.resolve("success"));
      await breaker.fire(() => Promise.resolve("success"));

      expect(breaker.getState()).toBe(CircuitState.CLOSED);
    });

    it("should transition to OPEN after failure threshold exceeded", async () => {
      // Execute failing operations
      for (let i = 0; i < 3; i++) {
        try {
          await breaker.fire(() => Promise.reject(new Error("failure")));
        } catch {
          // Expected
        }
      }

      expect(breaker.getState()).toBe(CircuitState.OPEN);
    });

    it("should transition to HALF_OPEN after reset timeout", async () => {
      // Trip the circuit
      for (let i = 0; i < 3; i++) {
        try {
          await breaker.fire(() => Promise.reject(new Error("failure")));
        } catch {
          // Expected
        }
      }
      expect(breaker.getState()).toBe(CircuitState.OPEN);

      // Wait for reset timeout
      await new Promise((resolve) => setTimeout(resolve, 150));

      // Check availability (triggers state transition)
      expect(breaker.isAvailable()).toBe(true);
      expect(breaker.getState()).toBe(CircuitState.HALF_OPEN);
    });

    it("should transition HALF_OPEN to CLOSED after success threshold", async () => {
      // Trip the circuit
      for (let i = 0; i < 3; i++) {
        try {
          await breaker.fire(() => Promise.reject(new Error("failure")));
        } catch {
          // Expected
        }
      }

      // Wait for reset timeout
      await new Promise((resolve) => setTimeout(resolve, 150));

      // Execute successful operations in half-open
      await breaker.fire(() => Promise.resolve("success"));
      await breaker.fire(() => Promise.resolve("success"));

      expect(breaker.getState()).toBe(CircuitState.CLOSED);
    });

    it("should transition HALF_OPEN back to OPEN on any failure", async () => {
      // Trip the circuit
      for (let i = 0; i < 3; i++) {
        try {
          await breaker.fire(() => Promise.reject(new Error("failure")));
        } catch {
          // Expected
        }
      }

      // Wait for reset timeout
      await new Promise((resolve) => setTimeout(resolve, 150));

      // Verify we're in half-open
      expect(breaker.isAvailable()).toBe(true);
      expect(breaker.getState()).toBe(CircuitState.HALF_OPEN);

      // Execute one more failure
      try {
        await breaker.fire(() => Promise.reject(new Error("failure")));
      } catch {
        // Expected
      }

      expect(breaker.getState()).toBe(CircuitState.OPEN);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // TIMEOUT HANDLING TESTS
  // ═══════════════════════════════════════════════════════════════════════════

  describe("Timeout Handling", () => {
    it("should throw CircuitTimeoutError when operation exceeds timeout", async () => {
      const breaker = new CircuitBreaker({
        name: "timeout-test",
        timeout: 50, // 50ms timeout
        failureThreshold: 5,
        resetTimeout: 1000,
      });

      const slowOperation = () =>
        new Promise<string>((resolve) => {
          setTimeout(() => resolve("too slow"), 200);
        });

      await expect(breaker.fire(slowOperation)).rejects.toThrow(
        CircuitTimeoutError,
      );
    });

    it("should complete successfully within timeout", async () => {
      const breaker = new CircuitBreaker({
        name: "timeout-test",
        timeout: 200,
        failureThreshold: 5,
        resetTimeout: 1000,
      });

      const fastOperation = () =>
        new Promise<string>((resolve) => {
          setTimeout(() => resolve("fast"), 50);
        });

      const result = await breaker.fire(fastOperation);
      expect(result).toBe("fast");
    });

    it("should increment timeout counter", async () => {
      const breaker = new CircuitBreaker({
        name: "timeout-counter-test",
        timeout: 50,
        failureThreshold: 5,
        resetTimeout: 1000,
      });

      try {
        await breaker.fire(
          () => new Promise((resolve) => setTimeout(resolve, 200)),
        );
      } catch {
        // Expected
      }

      const metrics = breaker.getMetrics();
      expect(metrics.timeouts).toBe(1);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // CIRCUIT OPEN ERROR TESTS
  // ═══════════════════════════════════════════════════════════════════════════

  describe("Circuit Open Behavior", () => {
    it("should throw CircuitOpenError when circuit is OPEN", async () => {
      const breaker = new CircuitBreaker({
        name: "open-test",
        timeout: 1000,
        failureThreshold: 2,
        resetTimeout: 10000, // Long timeout to keep circuit open
      });

      // Trip the circuit
      for (let i = 0; i < 2; i++) {
        try {
          await breaker.fire(() => Promise.reject(new Error("failure")));
        } catch {
          // Expected
        }
      }

      // Attempt to use tripped circuit
      await expect(breaker.fire(() => Promise.resolve("test"))).rejects.toThrow(
        CircuitOpenError,
      );
    });

    it("should track rejected requests in metrics", async () => {
      const breaker = new CircuitBreaker({
        name: "rejected-test",
        timeout: 1000,
        failureThreshold: 2,
        resetTimeout: 10000,
      });

      // Trip the circuit
      for (let i = 0; i < 2; i++) {
        try {
          await breaker.fire(() => Promise.reject(new Error("failure")));
        } catch {
          // Expected
        }
      }

      // Try to fire when open (should be rejected)
      try {
        await breaker.fire(() => Promise.resolve("test"));
      } catch {
        // Expected
      }

      const metrics = breaker.getMetrics();
      expect(metrics.rejectedRequests).toBe(1);
    });

    it("CircuitOpenError should include circuit name and reset timeout", async () => {
      const breaker = new CircuitBreaker({
        name: "error-info-test",
        timeout: 1000,
        failureThreshold: 1,
        resetTimeout: 5000,
      });

      // Trip the circuit
      try {
        await breaker.fire(() => Promise.reject(new Error("failure")));
      } catch {
        // Expected
      }

      // Catch the CircuitOpenError
      try {
        await breaker.fire(() => Promise.resolve("test"));
        expect.fail("Should have thrown");
      } catch (error) {
        expect(error).toBeInstanceOf(CircuitOpenError);
        const openError = error as CircuitOpenError;
        expect(openError.circuitName).toBe("error-info-test");
        expect(openError.resetTimeout).toBe(5000);
      }
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // FALLBACK TESTS
  // ═══════════════════════════════════════════════════════════════════════════

  describe("Fallback Behavior", () => {
    it("should use fallback when circuit is open", async () => {
      const breaker = new CircuitBreaker({
        name: "fallback-test",
        timeout: 1000,
        failureThreshold: 1,
        resetTimeout: 10000,
      });

      // Trip the circuit
      try {
        await breaker.fire(() => Promise.reject(new Error("failure")));
      } catch {
        // Expected
      }

      // Use fireWithFallback
      const result = await breaker.fireWithFallback(
        () => Promise.resolve("primary"),
        () => Promise.resolve("fallback"),
      );

      expect(result).toBe("fallback");
    });

    it("should use primary when circuit is closed and operation succeeds", async () => {
      const breaker = new CircuitBreaker({
        name: "primary-test",
        timeout: 1000,
        failureThreshold: 5,
        resetTimeout: 10000,
      });

      const result = await breaker.fireWithFallback(
        () => Promise.resolve("primary"),
        () => Promise.resolve("fallback"),
      );

      expect(result).toBe("primary");
    });

    it("should try fallback when primary fails", async () => {
      const breaker = new CircuitBreaker({
        name: "fallback-on-error-test",
        timeout: 1000,
        failureThreshold: 10, // High threshold so circuit stays closed
        resetTimeout: 10000,
      });

      const result = await breaker.fireWithFallback(
        () => Promise.reject(new Error("primary failed")),
        () => Promise.resolve("fallback succeeded"),
      );

      expect(result).toBe("fallback succeeded");
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // METRICS TESTS
  // ═══════════════════════════════════════════════════════════════════════════

  describe("Metrics Tracking", () => {
    it("should track total requests", async () => {
      const breaker = new CircuitBreaker({
        name: "metrics-total-test",
        timeout: 1000,
        failureThreshold: 10,
        resetTimeout: 1000,
      });

      await breaker.fire(() => Promise.resolve("1"));
      await breaker.fire(() => Promise.resolve("2"));
      await breaker.fire(() => Promise.resolve("3"));

      const metrics = breaker.getMetrics();
      expect(metrics.totalRequests).toBe(3);
    });

    it("should track successful and failed requests", async () => {
      const breaker = new CircuitBreaker({
        name: "metrics-success-fail-test",
        timeout: 1000,
        failureThreshold: 10,
        resetTimeout: 1000,
      });

      await breaker.fire(() => Promise.resolve("success"));
      await breaker.fire(() => Promise.resolve("success"));
      try {
        await breaker.fire(() => Promise.reject(new Error("fail")));
      } catch {
        // Expected
      }

      const metrics = breaker.getMetrics();
      expect(metrics.successfulRequests).toBe(2);
      expect(metrics.failedRequests).toBe(1);
    });

    it("should calculate failure rate correctly", async () => {
      const breaker = new CircuitBreaker({
        name: "metrics-rate-test",
        timeout: 1000,
        failureThreshold: 10,
        resetTimeout: 1000,
      });

      // 2 successes, 2 failures = 50% failure rate
      await breaker.fire(() => Promise.resolve("success"));
      await breaker.fire(() => Promise.resolve("success"));
      try {
        await breaker.fire(() => Promise.reject(new Error("fail")));
      } catch {
        // Expected
      }
      try {
        await breaker.fire(() => Promise.reject(new Error("fail")));
      } catch {
        // Expected
      }

      const metrics = breaker.getMetrics();
      expect(metrics.failureRate).toBe(50);
    });

    it("should track last success and failure times", async () => {
      const breaker = new CircuitBreaker({
        name: "metrics-times-test",
        timeout: 1000,
        failureThreshold: 10,
        resetTimeout: 1000,
      });

      const beforeSuccess = new Date();
      await breaker.fire(() => Promise.resolve("success"));
      const afterSuccess = new Date();

      const beforeFailure = new Date();
      try {
        await breaker.fire(() => Promise.reject(new Error("fail")));
      } catch {
        // Expected
      }
      const afterFailure = new Date();

      const metrics = breaker.getMetrics();
      expect(metrics.lastSuccess).not.toBeNull();
      expect(metrics.lastSuccess!.getTime()).toBeGreaterThanOrEqual(
        beforeSuccess.getTime(),
      );
      expect(metrics.lastSuccess!.getTime()).toBeLessThanOrEqual(
        afterSuccess.getTime(),
      );

      expect(metrics.lastFailure).not.toBeNull();
      expect(metrics.lastFailure!.getTime()).toBeGreaterThanOrEqual(
        beforeFailure.getTime(),
      );
      expect(metrics.lastFailure!.getTime()).toBeLessThanOrEqual(
        afterFailure.getTime(),
      );
    });

    it("should track average response time", async () => {
      const breaker = new CircuitBreaker({
        name: "metrics-response-time-test",
        timeout: 1000,
        failureThreshold: 10,
        resetTimeout: 1000,
      });

      // Execute operations with known delays
      await breaker.fire(
        () => new Promise((resolve) => setTimeout(() => resolve("1"), 10)),
      );
      await breaker.fire(
        () => new Promise((resolve) => setTimeout(() => resolve("2"), 20)),
      );

      const metrics = breaker.getMetrics();
      // Average should be approximately 15ms (some variance expected)
      expect(metrics.averageResponseTime).toBeGreaterThan(0);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // MANUAL CONTROL TESTS
  // ═══════════════════════════════════════════════════════════════════════════

  describe("Manual Circuit Control", () => {
    it("should allow manual reset", async () => {
      const breaker = new CircuitBreaker({
        name: "manual-reset-test",
        timeout: 1000,
        failureThreshold: 1,
        resetTimeout: 10000,
      });

      // Trip the circuit
      try {
        await breaker.fire(() => Promise.reject(new Error("failure")));
      } catch {
        // Expected
      }
      expect(breaker.getState()).toBe(CircuitState.OPEN);

      // Manual reset
      breaker.reset();
      expect(breaker.getState()).toBe(CircuitState.CLOSED);

      // Should work again
      const result = await breaker.fire(() => Promise.resolve("working"));
      expect(result).toBe("working");
    });

    it("should allow manual trip", () => {
      const breaker = new CircuitBreaker({
        name: "manual-trip-test",
        timeout: 1000,
        failureThreshold: 10,
        resetTimeout: 1000,
      });

      expect(breaker.getState()).toBe(CircuitState.CLOSED);

      breaker.trip();
      expect(breaker.getState()).toBe(CircuitState.OPEN);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // REGISTRY TESTS
  // ═══════════════════════════════════════════════════════════════════════════

  describe("Circuit Breaker Registry", () => {
    it("should get or create circuit breakers by name", () => {
      const breaker1 = circuitBreakerRegistry.getOrCreate({
        name: "registry-test-1",
        timeout: 1000,
        failureThreshold: 5,
        resetTimeout: 1000,
      });

      const breaker2 = circuitBreakerRegistry.getOrCreate({
        name: "registry-test-1", // Same name
        timeout: 2000, // Different config (ignored)
        failureThreshold: 10,
        resetTimeout: 2000,
      });

      // Should return the same instance
      expect(breaker1).toBe(breaker2);
    });

    it("should get circuit breaker by name", () => {
      circuitBreakerRegistry.getOrCreate({
        name: "registry-get-test",
        timeout: 1000,
        failureThreshold: 5,
        resetTimeout: 1000,
      });

      const retrieved = circuitBreakerRegistry.get("registry-get-test");
      expect(retrieved).toBeDefined();
      expect(retrieved?.getMetrics().name).toBe("registry-get-test");
    });

    it("should return undefined for non-existent circuit", () => {
      const nonExistent = circuitBreakerRegistry.get("non-existent-circuit");
      expect(nonExistent).toBeUndefined();
    });

    it("should get all metrics from registry", () => {
      // Create a few circuits
      circuitBreakerRegistry.getOrCreate({
        name: "metrics-all-test-1",
        timeout: 1000,
        failureThreshold: 5,
        resetTimeout: 1000,
      });
      circuitBreakerRegistry.getOrCreate({
        name: "metrics-all-test-2",
        timeout: 1000,
        failureThreshold: 5,
        resetTimeout: 1000,
      });

      const allMetrics = circuitBreakerRegistry.getAllMetrics();
      expect(allMetrics.length).toBeGreaterThan(0);

      const names = allMetrics.map((m) => m.name);
      expect(names).toContain("metrics-all-test-1");
      expect(names).toContain("metrics-all-test-2");
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // CALLBACK TESTS
  // ═══════════════════════════════════════════════════════════════════════════

  describe("Callbacks", () => {
    it("should call onStateChange when state transitions", async () => {
      const stateChanges: Array<{ from: CircuitState; to: CircuitState }> = [];

      const breaker = new CircuitBreaker({
        name: "callback-state-test",
        timeout: 1000,
        failureThreshold: 1,
        resetTimeout: 50,
        onStateChange: (name, from, to) => {
          stateChanges.push({ from, to });
        },
      });

      // Trip the circuit
      try {
        await breaker.fire(() => Promise.reject(new Error("failure")));
      } catch {
        // Expected
      }

      expect(stateChanges).toContainEqual({
        from: CircuitState.CLOSED,
        to: CircuitState.OPEN,
      });
    });

    it("should call onFailure when operation fails", async () => {
      const failures: Array<{ name: string; error: Error }> = [];

      const breaker = new CircuitBreaker({
        name: "callback-failure-test",
        timeout: 1000,
        failureThreshold: 5,
        resetTimeout: 1000,
        onFailure: (name, error) => {
          failures.push({ name, error });
        },
      });

      const testError = new Error("test error");
      try {
        await breaker.fire(() => Promise.reject(testError));
      } catch {
        // Expected
      }

      expect(failures.length).toBe(1);
      expect(failures[0].name).toBe("callback-failure-test");
      expect(failures[0].error.message).toBe("test error");
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // FAILURE RATE THRESHOLD TESTS
  // ═══════════════════════════════════════════════════════════════════════════

  describe("Failure Rate Threshold", () => {
    it("should trip on failure rate threshold when volume met", async () => {
      const breaker = new CircuitBreaker({
        name: "failure-rate-test",
        timeout: 1000,
        failureThreshold: 100, // High count threshold (won't trip on count)
        failureRateThreshold: 50, // 50% failure rate
        volumeThreshold: 4, // Need at least 4 requests
        resetTimeout: 1000,
      });

      // 1 success, 3 failures = 75% failure rate
      await breaker.fire(() => Promise.resolve("success"));
      try {
        await breaker.fire(() => Promise.reject(new Error("fail")));
      } catch {
        // Expected
      }
      try {
        await breaker.fire(() => Promise.reject(new Error("fail")));
      } catch {
        // Expected
      }
      try {
        await breaker.fire(() => Promise.reject(new Error("fail")));
      } catch {
        // Expected
      }

      // Circuit should be open due to failure rate
      expect(breaker.getState()).toBe(CircuitState.OPEN);
    });

    it("should not trip on failure rate if volume not met", async () => {
      const breaker = new CircuitBreaker({
        name: "volume-threshold-test",
        timeout: 1000,
        failureThreshold: 100,
        failureRateThreshold: 50,
        volumeThreshold: 10, // Need at least 10 requests
        resetTimeout: 1000,
      });

      // 1 success, 2 failures (below volume threshold)
      await breaker.fire(() => Promise.resolve("success"));
      try {
        await breaker.fire(() => Promise.reject(new Error("fail")));
      } catch {
        // Expected
      }
      try {
        await breaker.fire(() => Promise.reject(new Error("fail")));
      } catch {
        // Expected
      }

      // Circuit should still be closed (not enough volume)
      expect(breaker.getState()).toBe(CircuitState.CLOSED);
    });
  });
});

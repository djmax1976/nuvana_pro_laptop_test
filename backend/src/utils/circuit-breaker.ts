/**
 * Circuit Breaker Implementation for Database and External Service Resilience
 *
 * Provides protection against cascading failures when downstream services (database, Redis)
 * are slow or unavailable. Follows the classic circuit breaker pattern:
 *
 * CLOSED -> OPEN -> HALF_OPEN -> CLOSED
 *
 * States:
 * - CLOSED: Normal operation, requests pass through
 * - OPEN: Circuit is tripped, requests fail fast without attempting operation
 * - HALF_OPEN: Testing if service has recovered, limited requests allowed
 *
 * Configuration is tuned for database operations:
 * - 5 second timeout (reasonable for complex queries)
 * - Opens after 5 consecutive failures or 50% failure rate
 * - 30 second reset timeout before testing recovery
 *
 * @module circuit-breaker
 */

/**
 * Circuit breaker state
 */
export enum CircuitState {
  CLOSED = "CLOSED",
  OPEN = "OPEN",
  HALF_OPEN = "HALF_OPEN",
}

/**
 * Configuration options for the circuit breaker
 */
export interface CircuitBreakerOptions {
  /** Name for this circuit breaker (for logging/metrics) */
  name: string;
  /** Timeout in milliseconds for wrapped operations (default: 5000) */
  timeout?: number;
  /** Number of failures before opening circuit (default: 5) */
  failureThreshold?: number;
  /** Percentage of failures to trip circuit (0-100, default: 50) */
  failureRateThreshold?: number;
  /** Minimum number of requests before rate threshold applies (default: 10) */
  volumeThreshold?: number;
  /** Time in milliseconds before attempting recovery (default: 30000) */
  resetTimeout?: number;
  /** Number of successful calls in half-open to close circuit (default: 2) */
  successThreshold?: number;
  /** Optional callback when circuit state changes */
  onStateChange?: (name: string, from: CircuitState, to: CircuitState) => void;
  /** Optional callback when operation fails */
  onFailure?: (name: string, error: Error) => void;
}

/**
 * Metrics for monitoring circuit breaker health
 */
export interface CircuitBreakerMetrics {
  name: string;
  state: CircuitState;
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  rejectedRequests: number;
  timeouts: number;
  lastFailure: Date | null;
  lastSuccess: Date | null;
  lastStateChange: Date;
  failureRate: number;
  averageResponseTime: number;
}

/**
 * Error thrown when circuit breaker is open
 */
export class CircuitOpenError extends Error {
  constructor(
    public readonly circuitName: string,
    public readonly resetTimeout: number,
  ) {
    super(
      `Circuit breaker '${circuitName}' is OPEN. Service unavailable. Retry after ${resetTimeout}ms.`,
    );
    this.name = "CircuitOpenError";
  }
}

/**
 * Error thrown when operation times out
 */
export class CircuitTimeoutError extends Error {
  constructor(
    public readonly circuitName: string,
    public readonly timeout: number,
  ) {
    super(
      `Circuit breaker '${circuitName}' operation timed out after ${timeout}ms.`,
    );
    this.name = "CircuitTimeoutError";
  }
}

/**
 * Circuit Breaker class for wrapping potentially failing operations
 */
export class CircuitBreaker {
  private readonly name: string;
  private readonly timeout: number;
  private readonly failureThreshold: number;
  private readonly failureRateThreshold: number;
  private readonly volumeThreshold: number;
  private readonly resetTimeout: number;
  private readonly successThreshold: number;
  private readonly onStateChange?: CircuitBreakerOptions["onStateChange"];
  private readonly onFailure?: CircuitBreakerOptions["onFailure"];

  private state: CircuitState = CircuitState.CLOSED;
  private failures = 0;
  private successes = 0;
  private halfOpenSuccesses = 0;
  private lastFailureTime: Date | null = null;
  private lastSuccessTime: Date | null = null;
  private _lastStateChangeTime: Date = new Date();
  private totalRequests = 0;
  private rejectedRequests = 0;
  private timeouts = 0;
  private responseTimes: number[] = [];
  private readonly maxResponseTimeSamples = 100;

  constructor(options: CircuitBreakerOptions) {
    this.name = options.name;
    this.timeout = options.timeout ?? 5000;
    this.failureThreshold = options.failureThreshold ?? 5;
    this.failureRateThreshold = options.failureRateThreshold ?? 50;
    this.volumeThreshold = options.volumeThreshold ?? 10;
    this.resetTimeout = options.resetTimeout ?? 30000;
    this.successThreshold = options.successThreshold ?? 2;
    this.onStateChange = options.onStateChange;
    this.onFailure = options.onFailure;
  }

  /**
   * Get current circuit state
   */
  getState(): CircuitState {
    return this.state;
  }

  /**
   * Check if circuit allows requests
   */
  isAvailable(): boolean {
    if (this.state === CircuitState.CLOSED) {
      return true;
    }

    if (this.state === CircuitState.OPEN) {
      // Check if reset timeout has passed
      const timeSinceLastFailure = this.lastFailureTime
        ? Date.now() - this.lastFailureTime.getTime()
        : Infinity;

      if (timeSinceLastFailure >= this.resetTimeout) {
        this.transitionTo(CircuitState.HALF_OPEN);
        return true;
      }
      return false;
    }

    // HALF_OPEN: Allow limited requests
    return true;
  }

  /**
   * Get circuit breaker metrics for monitoring
   */
  getMetrics(): CircuitBreakerMetrics {
    const successfulRequests = this.successes;
    const failedRequests = this.failures;
    const total = successfulRequests + failedRequests;

    return {
      name: this.name,
      state: this.state,
      totalRequests: this.totalRequests,
      successfulRequests,
      failedRequests,
      rejectedRequests: this.rejectedRequests,
      timeouts: this.timeouts,
      lastFailure: this.lastFailureTime,
      lastSuccess: this.lastSuccessTime,
      lastStateChange: this._lastStateChangeTime,
      failureRate: total > 0 ? (failedRequests / total) * 100 : 0,
      averageResponseTime: this.calculateAverageResponseTime(),
    };
  }

  /**
   * Execute an operation through the circuit breaker
   * @param operation - Async function to execute
   * @returns Result of the operation
   * @throws CircuitOpenError if circuit is open
   * @throws CircuitTimeoutError if operation times out
   */
  async fire<T>(operation: () => Promise<T>): Promise<T> {
    this.totalRequests++;

    // Check if circuit allows the request
    if (!this.isAvailable()) {
      this.rejectedRequests++;
      throw new CircuitOpenError(this.name, this.resetTimeout);
    }

    const startTime = Date.now();

    try {
      // Execute operation with timeout
      const result = await this.executeWithTimeout(operation);
      this.recordSuccess(Date.now() - startTime);
      return result;
    } catch (error) {
      this.recordFailure(
        error instanceof Error ? error : new Error(String(error)),
      );
      throw error;
    }
  }

  /**
   * Execute an operation with fallback when circuit is open
   * @param operation - Primary operation to attempt
   * @param fallback - Fallback operation when circuit is open or primary fails
   * @returns Result from primary or fallback
   */
  async fireWithFallback<T>(
    operation: () => Promise<T>,
    fallback: () => Promise<T>,
  ): Promise<T> {
    try {
      return await this.fire(operation);
    } catch (error) {
      if (error instanceof CircuitOpenError) {
        // Circuit is open, use fallback without recording another failure
        return await fallback();
      }
      // Operation failed, try fallback
      try {
        return await fallback();
      } catch {
        // Fallback also failed, throw original error
        throw error;
      }
    }
  }

  /**
   * Manually reset the circuit breaker to closed state
   * Use with caution - typically for testing or manual recovery
   */
  reset(): void {
    this.failures = 0;
    this.successes = 0;
    this.halfOpenSuccesses = 0;
    this.responseTimes = [];
    this.transitionTo(CircuitState.CLOSED);
  }

  /**
   * Manually trip the circuit to open state
   * Use for planned maintenance or known outages
   */
  trip(): void {
    this.transitionTo(CircuitState.OPEN);
    this.lastFailureTime = new Date();
  }

  /**
   * Execute operation with timeout
   */
  private async executeWithTimeout<T>(operation: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        this.timeouts++;
        reject(new CircuitTimeoutError(this.name, this.timeout));
      }, this.timeout);

      operation()
        .then((result) => {
          clearTimeout(timeoutId);
          resolve(result);
        })
        .catch((error) => {
          clearTimeout(timeoutId);
          reject(error);
        });
    });
  }

  /**
   * Record a successful operation
   */
  private recordSuccess(responseTime: number): void {
    this.successes++;
    this.lastSuccessTime = new Date();
    this.recordResponseTime(responseTime);

    if (this.state === CircuitState.HALF_OPEN) {
      this.halfOpenSuccesses++;
      if (this.halfOpenSuccesses >= this.successThreshold) {
        // Enough successes in half-open, close the circuit
        this.failures = 0;
        this.halfOpenSuccesses = 0;
        this.transitionTo(CircuitState.CLOSED);
      }
    } else if (this.state === CircuitState.CLOSED) {
      // Reset consecutive failure count on success
      // But keep tracking for failure rate calculation
    }
  }

  /**
   * Record a failed operation
   */
  private recordFailure(error: Error): void {
    this.failures++;
    this.lastFailureTime = new Date();

    this.onFailure?.(this.name, error);

    if (this.state === CircuitState.HALF_OPEN) {
      // Any failure in half-open state trips back to open
      this.halfOpenSuccesses = 0;
      this.transitionTo(CircuitState.OPEN);
    } else if (this.state === CircuitState.CLOSED) {
      // Check if we should trip the circuit
      if (this.shouldTrip()) {
        this.transitionTo(CircuitState.OPEN);
      }
    }
  }

  /**
   * Determine if circuit should trip based on thresholds
   */
  private shouldTrip(): boolean {
    // Trip on consecutive failure threshold
    if (this.failures >= this.failureThreshold) {
      return true;
    }

    // Check failure rate threshold (only if we have enough volume)
    const total = this.successes + this.failures;
    if (total >= this.volumeThreshold) {
      const failureRate = (this.failures / total) * 100;
      if (failureRate >= this.failureRateThreshold) {
        return true;
      }
    }

    return false;
  }

  /**
   * Transition to a new state
   */
  private transitionTo(newState: CircuitState): void {
    if (this.state === newState) {
      return;
    }

    const previousState = this.state;
    this.state = newState;
    this._lastStateChangeTime = new Date();

    // Log state transition
    console.log(
      `CircuitBreaker[${this.name}]: ${previousState} -> ${newState}`,
    );

    this.onStateChange?.(this.name, previousState, newState);
  }

  /**
   * Record response time for metrics
   */
  private recordResponseTime(time: number): void {
    this.responseTimes.push(time);
    if (this.responseTimes.length > this.maxResponseTimeSamples) {
      this.responseTimes.shift();
    }
  }

  /**
   * Calculate average response time from recent samples
   */
  private calculateAverageResponseTime(): number {
    if (this.responseTimes.length === 0) {
      return 0;
    }
    const sum = this.responseTimes.reduce((a, b) => a + b, 0);
    return Math.round(sum / this.responseTimes.length);
  }
}

/**
 * Registry of circuit breakers for centralized management
 */
class CircuitBreakerRegistry {
  private breakers = new Map<string, CircuitBreaker>();

  /**
   * Get or create a circuit breaker by name
   */
  getOrCreate(options: CircuitBreakerOptions): CircuitBreaker {
    let breaker = this.breakers.get(options.name);
    if (!breaker) {
      breaker = new CircuitBreaker(options);
      this.breakers.set(options.name, breaker);
    }
    return breaker;
  }

  /**
   * Get a circuit breaker by name
   */
  get(name: string): CircuitBreaker | undefined {
    return this.breakers.get(name);
  }

  /**
   * Get all circuit breakers
   */
  getAll(): Map<string, CircuitBreaker> {
    return this.breakers;
  }

  /**
   * Get metrics for all circuit breakers
   */
  getAllMetrics(): CircuitBreakerMetrics[] {
    return Array.from(this.breakers.values()).map((b) => b.getMetrics());
  }

  /**
   * Reset all circuit breakers
   */
  resetAll(): void {
    this.breakers.forEach((b) => b.reset());
  }
}

// Singleton registry instance
export const circuitBreakerRegistry = new CircuitBreakerRegistry();

/**
 * Pre-configured circuit breaker for database operations
 *
 * Configuration:
 * - 5 second timeout (allows for complex queries)
 * - Opens after 5 failures or 50% failure rate
 * - 30 second reset timeout
 * - 2 successes required to close from half-open
 */
export const dbCircuitBreaker = circuitBreakerRegistry.getOrCreate({
  name: "database",
  timeout: 5000,
  failureThreshold: 5,
  failureRateThreshold: 50,
  volumeThreshold: 10,
  resetTimeout: 30000,
  successThreshold: 2,
  onStateChange: (name, from, to) => {
    console.warn(`CircuitBreaker[${name}] state change: ${from} -> ${to}`);
    // Could send alert to monitoring system here
  },
  onFailure: (name, error) => {
    console.error(`CircuitBreaker[${name}] operation failed:`, error.message);
  },
});

/**
 * Pre-configured circuit breaker for RBAC/permission checks
 * More sensitive than general database operations
 *
 * Configuration:
 * - 3 second timeout (permission checks should be fast)
 * - Opens after 3 failures (permission system is critical)
 * - 15 second reset timeout (try to recover quickly)
 * - 3 successes required to close
 */
export const rbacCircuitBreaker = circuitBreakerRegistry.getOrCreate({
  name: "rbac",
  timeout: 3000,
  failureThreshold: 3,
  failureRateThreshold: 40,
  volumeThreshold: 5,
  resetTimeout: 15000,
  successThreshold: 3,
  onStateChange: (name, from, to) => {
    console.warn(`CircuitBreaker[${name}] state change: ${from} -> ${to}`);
  },
});

/**
 * Pre-configured circuit breaker for Redis cache operations
 * Very fast timeout since cache misses should fall through quickly
 *
 * Configuration:
 * - 1 second timeout (cache should be fast)
 * - Opens after 10 failures (cache is less critical)
 * - 60 second reset timeout (cache can recover slowly)
 */
export const cacheCircuitBreaker = circuitBreakerRegistry.getOrCreate({
  name: "cache",
  timeout: 1000,
  failureThreshold: 10,
  failureRateThreshold: 60,
  volumeThreshold: 20,
  resetTimeout: 60000,
  successThreshold: 5,
});

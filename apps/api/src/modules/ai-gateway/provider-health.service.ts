/**
 * AI Provider Health Check and Circuit Breaker Service.
 *
 * Provides:
 * - Provider health checks
 * * Model availability tracking
 * * Circuit breaker for failing providers
 * * Retry policies with exponential backoff
 * * Rate limiting per provider
 * * Provider failure handling
 */

export type ProviderHealthStatus = 'healthy' | 'degraded' | 'unhealthy' | 'unknown';

export interface ProviderHealth {
  providerId: string;
  status: ProviderHealthStatus;
  lastChecked: string;
  responseTimeMs: number | null;
  errorCount: number;
  consecutiveFailures: number;
  lastError: string | null;
}

export interface CircuitBreakerState {
  providerId: string;
  state: 'closed' | 'open' | 'half_open';
  failureCount: number;
  lastFailureTime: string | null;
  nextAttemptTime: string | null;
}

export interface CircuitBreakerConfig {
  failureThreshold: number;
  recoveryTimeoutMs: number;
  halfOpenMaxCalls: number;
}

/**
 * Default circuit breaker configuration.
 */
export const DEFAULT_CIRCUIT_BREAKER_CONFIG: CircuitBreakerConfig = {
  failureThreshold: 5,
  recoveryTimeoutMs: 60000, // 1 minute
  halfOpenMaxCalls: 3,
};

/**
 * Circuit breaker for AI providers.
 * Prevents cascading failures when a provider is down.
 */
export class CircuitBreaker {
  private state: CircuitBreakerState;
  private config: CircuitBreakerConfig;
  private halfOpenCalls: number = 0;

  constructor(providerId: string, config: CircuitBreakerConfig = DEFAULT_CIRCUIT_BREAKER_CONFIG) {
    this.config = config;
    this.state = {
      providerId,
      state: 'closed',
      failureCount: 0,
      lastFailureTime: null,
      nextAttemptTime: null,
    };
  }

  /**
   * Check if a call can be made through the circuit breaker.
   */
  canExecute(): boolean {
    const now = new Date();

    if (this.state.state === 'closed') {
      return true;
    }

    if (this.state.state === 'open') {
      // Check if recovery timeout has elapsed
      if (this.state.nextAttemptTime && now >= new Date(this.state.nextAttemptTime)) {
        this.state.state = 'half_open';
        this.halfOpenCalls = 0;
        return true;
      }
      return false;
    }

    // Half-open state
    if (this.halfOpenCalls < this.config.halfOpenMaxCalls) {
      this.halfOpenCalls++;
      return true;
    }

    return false;
  }

  /**
   * Record a successful call.
   */
  recordSuccess(): void {
    if (this.state.state === 'half_open') {
      this.halfOpenCalls--;
      if (this.halfOpenCalls <= 0) {
        this.state.state = 'closed';
        this.state.failureCount = 0;
        this.state.lastFailureTime = null;
        this.state.nextAttemptTime = null;
      }
    } else if (this.state.state === 'closed') {
      this.state.failureCount = Math.max(0, this.state.failureCount - 1);
    }
  }

  /**
   * Record a failed call.
   */
  recordFailure(): void {
    this.state.failureCount++;
    this.state.lastFailureTime = new Date().toISOString();

    if (this.state.state === 'half_open') {
      this.state.state = 'open';
      this.state.nextAttemptTime = new Date(
        Date.now() + this.config.recoveryTimeoutMs,
      ).toISOString();
    } else if (this.state.state === 'closed' && this.state.failureCount >= this.config.failureThreshold) {
      this.state.state = 'open';
      this.state.nextAttemptTime = new Date(
        Date.now() + this.config.recoveryTimeoutMs,
      ).toISOString();
    }
  }

  /**
   * Get current circuit breaker state.
   */
  getState(): CircuitBreakerState {
    return { ...this.state };
  }
}

/**
 * Provider health checker.
 * Performs health checks against AI providers and tracks their status.
 */
export class ProviderHealthChecker {
  private providers: Map<string, ProviderHealth> = new Map();
  private circuitBreakers: Map<string, CircuitBreaker> = new Map();

  /**
   * Register a provider for health tracking.
   */
  registerProvider(providerId: string): void {
    this.providers.set(providerId, {
      providerId,
      status: 'unknown',
      lastChecked: new Date().toISOString(),
      responseTimeMs: null,
      errorCount: 0,
      consecutiveFailures: 0,
      lastError: null,
    });

    this.circuitBreakers.set(
      providerId,
      new CircuitBreaker(providerId),
    );
  }

  /**
   * Record a successful health check.
   */
  recordSuccess(providerId: string, responseTimeMs: number): void {
    const health = this.providers.get(providerId);
    if (health) {
      health.status = 'healthy';
      health.lastChecked = new Date().toISOString();
      health.responseTimeMs = responseTimeMs;
      health.errorCount = 0;
      health.consecutiveFailures = 0;
      health.lastError = null;
    }

    const breaker = this.circuitBreakers.get(providerId);
    if (breaker) {
      breaker.recordSuccess();
    }
  }

  /**
   * Record a failed health check.
   */
  recordFailure(providerId: string, error: string): void {
    const health = this.providers.get(providerId);
    if (health) {
      health.status = 'unhealthy';
      health.lastChecked = new Date().toISOString();
      health.errorCount++;
      health.consecutiveFailures++;
      health.lastError = error;
    }

    const breaker = this.circuitBreakers.get(providerId);
    if (breaker) {
      breaker.recordFailure();
    }
  }

  /**
   * Get health status for a provider.
   */
  getHealth(providerId: string): ProviderHealth | null {
    return this.providers.get(providerId) ?? null;
  }

  /**
   * Get all provider health statuses.
   */
  getAllHealth(): ProviderHealth[] {
    return Array.from(this.providers.values());
  }

  /**
   * Check if a provider can accept calls (circuit breaker state).
   */
  canExecute(providerId: string): boolean {
    const breaker = this.circuitBreakers.get(providerId);
    if (!breaker) {
      return true; // No circuit breaker = always allow
    }
    return breaker.canExecute();
  }

  /**
   * Get circuit breaker state for a provider.
   */
  getCircuitBreakerState(providerId: string): CircuitBreakerState | null {
    const breaker = this.circuitBreakers.get(providerId);
    if (!breaker) {
      return null;
    }
    return breaker.getState();
  }
}

/**
 * Global provider health checker instance.
 */
export const providerHealthChecker = new ProviderHealthChecker();

/**
 * Retry with exponential backoff.
 */
export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  maxRetries: number = 3,
  baseDelayMs: number = 1000,
): Promise<T> {
  let lastError: unknown;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;

      if (attempt < maxRetries) {
        const delayMs = baseDelayMs * Math.pow(2, attempt);
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }
  }

  throw lastError;
}

/**
 * Rate limiter for AI provider calls.
 * Limits requests per minute per provider.
 */
export class RateLimiter {
  private requests: Map<string, number[]> = new Map();

  constructor(private maxRequestsPerMinute: number = 60) {}

  /**
   * Check if a request can be made within rate limits.
   */
  canExecute(providerId: string): boolean {
    const now = Date.now();
    const minuteAgo = now - 60000;

    const requests = this.requests.get(providerId) ?? [];
    // Filter out requests older than 1 minute
    const recentRequests = requests.filter((t) => t > minuteAgo);

    if (recentRequests.length >= this.maxRequestsPerMinute) {
      return false;
    }

    recentRequests.push(now);
    this.requests.set(providerId, recentRequests);
    return true;
  }

  /**
   * Get remaining requests for a provider.
   */
  getRemaining(providerId: string): number {
    const now = Date.now();
    const minuteAgo = now - 60000;

    const requests = this.requests.get(providerId) ?? [];
    const recentRequests = requests.filter((t) => t > minuteAgo);

    return Math.max(0, this.maxRequestsPerMinute - recentRequests.length);
  }
}

/**
 * Global rate limiter instance.
 */
export const aiRateLimiter = new RateLimiter(60); // 60 requests per minute per provider

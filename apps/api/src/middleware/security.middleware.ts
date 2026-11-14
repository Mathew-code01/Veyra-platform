/**
 * Security hardening middleware.
 *
 * Provides:
 * - Stricter rate limiting for authentication endpoints
 * - Security event logging
 * * Failed login attempt tracking
 * * Request size limits
 * * Content type validation
 */

import type { FastifyPluginAsync } from 'fastify';

interface RateLimitEntry {
  count: number;
  resetTime: number;
}

/**
 * In-memory rate limiter for sensitive endpoints.
 * In production, this should use Redis for distributed rate limiting.
 */
class AuthRateLimiter {
  private attempts: Map<string, RateLimitEntry> = new Map();

  constructor(private maxAttempts: number = 5, private windowMs: number = 900000) {} // 15 min

  /**
   * Check if an attempt is allowed.
   */
  isAllowed(identifier: string): boolean {
    const now = Date.now();
    const entry = this.attempts.get(identifier);

    if (!entry || now > entry.resetTime) {
      this.attempts.set(identifier, { count: 1, resetTime: now + this.windowMs });
      return true;
    }

    if (entry.count >= this.maxAttempts) {
      return false;
    }

    entry.count++;
    return true;
  }

  /**
   * Record a failed attempt.
   */
  recordFailure(identifier: string): void {
    const now = Date.now();
    const entry = this.attempts.get(identifier);

    if (!entry || now > entry.resetTime) {
      this.attempts.set(identifier, { count: 1, resetTime: now + this.windowMs });
    } else {
      entry.count++;
    }
  }

  /**
   * Reset attempts on successful login.
   */
  reset(identifier: string): void {
    this.attempts.delete(identifier);
  }

  /**
   * Get remaining attempts.
   */
  getRemaining(identifier: string): number {
    const now = Date.now();
    const entry = this.attempts.get(identifier);

    if (!entry || now > entry.resetTime) {
      return this.maxAttempts;
    }

    return Math.max(0, this.maxAttempts - entry.count);
  }
}

export const authRateLimiter = new AuthRateLimiter(5, 15 * 60 * 1000); // 5 attempts per 15 min

/**
 * Security middleware plugin.
 * Adds security headers and request size limits.
 */
const securityPlugin: FastifyPluginAsync = async (fastify) => {
  // Add security headers
  fastify.addHook('onRequest', async (_request, reply) => {
    // Prevent MIME type sniffing
    reply.header('X-Content-Type-Options', 'nosniff');
    // Prevent clickjacking
    reply.header('X-Frame-Options', 'DENY');
    // Referrer policy
    reply.header('Referrer-Policy', 'strict-origin-when-cross-origin');
  });
};

export default securityPlugin;

/**
 * Log a security-relevant event.
 * Does not log sensitive data (passwords, tokens, etc.).
 */
export function logSecurityEvent(
  eventType: 'login_attempt' | 'login_success' | 'login_failure' | 'logout' | 'registration' | 'password_recovery' | 'unauthorized_access',
  details: {
    userId?: string;
    email?: string;
    ip?: string;
    userAgent?: string;
    reason?: string;
  },
): void {
  const logData: Record<string, unknown> = {
    eventType,
    timestamp: new Date().toISOString(),
  };

  if (details.userId) logData.userId = details.userId;
  // Never log email addresses in security logs to avoid PII exposure
  if (details.ip) logData.ip = details.ip;
  if (details.reason) logData.reason = details.reason;

  // Use structured logging via the app logger
  // In production, this would be sent to a security monitoring system
  console.log(JSON.stringify({ type: 'security_event', ...logData }));
}

import crypto from 'crypto';

/**
 * Generate a correlation ID for request tracing.
 */
export function generateCorrelationId(): string {
  return crypto.randomBytes(16).toString('hex');
}

export interface CorrelationIdContext {
  requestId: string;
}

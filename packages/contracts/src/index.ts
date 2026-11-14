import { z } from 'zod';

export const API_VERSION = 'v1';

// --- Base request/response envelopes ---

export const BaseResponseSchema = z.object({
  ok: z.boolean(),
  requestId: z.string().optional(),
});

export type BaseResponse = z.infer<typeof BaseResponseSchema>;

export const ErrorResponseSchema = BaseResponseSchema.extend({
  ok: z.literal(false),
  error: z.object({
    code: z.string(),
    message: z.string(),
    status: z.number(),
    details: z.record(z.string(), z.unknown()).optional(),
  }),
});

export type ErrorResponse = z.infer<typeof ErrorResponseSchema>;

// --- Health ---

export const HealthStatusSchema = z.enum(['ok', 'degraded', 'fail']);

export const HealthDependencySchema = z.object({
  name: z.string(),
  status: HealthStatusSchema,
  latencyMs: z.number().optional(),
  detail: z.string().optional(),
});

export const HealthResponseSchema = z.object({
  ok: z.literal(true),
  status: HealthStatusSchema,
  service: z.string(),
  version: z.string(),
  environment: z.string(),
  uptimeMs: z.number(),
  dependencies: z.array(HealthDependencySchema),
  requestId: z.string(),
});

export type HealthResponse = z.infer<typeof HealthResponseSchema>;

export const ReadinessResponseSchema = HealthResponseSchema;

export type ReadinessResponse = z.infer<typeof ReadinessResponseSchema>;

// --- Version ---

export const VersionResponseSchema = z.object({
  ok: z.literal(true),
  service: z.string(),
  version: z.string(),
  apiVersion: z.string(),
  requestId: z.string(),
});

export type VersionResponse = z.infer<typeof VersionResponseSchema>;

// --- Correlation ---

export const CorrelationIdHeaderSchema = z.object({
  'x-request-id': z.string().min(1).optional(),
});

export type CorrelationIdHeaders = z.infer<typeof CorrelationIdHeaderSchema>;

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

// --- Authentication ---

export const RegisterRequestSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});

export type RegisterRequest = z.infer<typeof RegisterRequestSchema>;

export const LoginRequestSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export type LoginRequest = z.infer<typeof LoginRequestSchema>;

export const AuthResponseSchema = z.object({
  ok: z.literal(true),
  requestId: z.string(),
  accessToken: z.string(),
  refreshToken: z.string(),
  expiresIn: z.number(),
  user: z.object({
    id: z.string(),
    email: z.string(),
    emailConfirmed: z.boolean(),
  }),
});

export type AuthResponse = z.infer<typeof AuthResponseSchema>;

export const PasswordRecoveryRequestSchema = z.object({
  email: z.string().email(),
});

export type PasswordRecoveryRequest = z.infer<typeof PasswordRecoveryRequestSchema>;

export const ProfileResponseSchema = z.object({
  ok: z.literal(true),
  requestId: z.string(),
  profile: z.object({
    id: z.string(),
    email: z.string(),
    displayName: z.string().optional(),
    locale: z.string(),
    status: z.string(),
    createdAt: z.string(),
  }),
});

export type ProfileResponse = z.infer<typeof ProfileResponseSchema>;

export const UpdateProfileRequestSchema = z.object({
  displayName: z.string().min(1).max(100).optional(),
  locale: z.string().min(2).max(10).optional(),
});

export type UpdateProfileRequest = z.infer<typeof UpdateProfileRequestSchema>;

export const AuthenticatedUserSchema = z.object({
  id: z.string(),
  email: z.string(),
  emailConfirmed: z.boolean(),
});

export type AuthenticatedUser = z.infer<typeof AuthenticatedUserSchema>;

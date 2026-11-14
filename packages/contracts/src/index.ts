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

// --- Devices ---

export const DeviceRegisterRequestSchema = z.object({
  installationId: z.string().min(1),
  deviceName: z.string().min(1).max(100).optional(),
  platform: z.enum(['windows', 'macos', 'linux']).optional(),
});

export type DeviceRegisterRequest = z.infer<typeof DeviceRegisterRequestSchema>;

export const DeviceResponseSchema = z.object({
  ok: z.literal(true),
  requestId: z.string(),
  device: z.object({
    id: z.string(),
    installationId: z.string(),
    deviceName: z.string().optional(),
    platform: z.string().optional(),
    isAuthorized: z.boolean(),
    isRevoked: z.boolean(),
    lastSeenAt: z.string().optional(),
    createdAt: z.string(),
  }),
});

export type DeviceResponse = z.infer<typeof DeviceResponseSchema>;

export const DeviceListResponseSchema = z.object({
  ok: z.literal(true),
  requestId: z.string(),
  devices: z.array(
    z.object({
      id: z.string(),
      installationId: z.string(),
      deviceName: z.string().optional(),
      platform: z.string().optional(),
      isAuthorized: z.boolean(),
      isRevoked: z.boolean(),
      lastSeenAt: z.string().optional(),
      createdAt: z.string(),
    }),
  ),
});

export type DeviceListResponse = z.infer<typeof DeviceListResponseSchema>;

export const DeviceAuthorizeRequestSchema = z.object({
  deviceId: z.string().uuid(),
});

export type DeviceAuthorizeRequest = z.infer<typeof DeviceAuthorizeRequestSchema>;

export const DeviceRevokeRequestSchema = z.object({
  deviceId: z.string().uuid(),
});

export type DeviceRevokeRequest = z.infer<typeof DeviceRevokeRequestSchema>;

// --- Entitlements ---

export const EntitlementCheckRequestSchema = z.object({
  capability: z.string().min(1),
});

export type EntitlementCheckRequest = z.infer<typeof EntitlementCheckRequestSchema>;

export const EntitlementCheckResponseSchema = z.object({
  ok: z.literal(true),
  requestId: z.string(),
  capability: z.string(),
  entitled: z.boolean(),
  reason: z.string().optional(),
  expiresAt: z.string().optional(),
});

export type EntitlementCheckResponse = z.infer<typeof EntitlementCheckResponseSchema>;

export const EntitlementSnapshotResponseSchema = z.object({
  ok: z.literal(true),
  requestId: z.string(),
  snapshot: z.string(), // signed JWT
  expiresAt: z.string(),
});

export type EntitlementSnapshotResponse = z.infer<typeof EntitlementSnapshotResponseSchema>;

export const EntitlementListResponseSchema = z.object({
  ok: z.literal(true),
  requestId: z.string(),
  entitlements: z.array(
    z.object({
      capability: z.string(),
      entitled: z.boolean(),
      reason: z.string().optional(),
      expiresAt: z.string().optional(),
    }),
  ),
});

export type EntitlementListResponse = z.infer<typeof EntitlementListResponseSchema>;

// --- Plans ---

export const PlanResponseSchema = z.object({
  ok: z.literal(true),
  requestId: z.string(),
  plan: z.object({
    id: z.string(),
    name: z.string(),
    family: z.enum(['local', 'hybrid', 'cloud']),
    description: z.string().optional(),
    billingInterval: z.enum(['monthly', 'yearly']),
    priceCents: z.number().int().nonnegative(),
    currency: z.string().length(3),
    features: z.record(z.string(), z.boolean()),
    deviceLimit: z.number().int().positive(),
    isActive: z.boolean(),
    createdAt: z.string(),
  }),
});

export type PlanResponse = z.infer<typeof PlanResponseSchema>;

export const PlanListResponseSchema = z.object({
  ok: z.literal(true),
  requestId: z.string(),
  plans: z.array(PlanResponseSchema.shape.plan),
});

export type PlanListResponse = z.infer<typeof PlanListResponseSchema>;

// --- Subscriptions ---

export const SubscriptionResponseSchema = z.object({
  ok: z.literal(true),
  requestId: z.string(),
  subscription: z.object({
    id: z.string(),
    planId: z.string(),
    planName: z.string(),
    billingInterval: z.enum(['monthly', 'yearly']),
    status: z.enum([
      'inactive',
      'trialing',
      'active',
      'past_due',
      'canceled',
      'unpaid',
      'incomplete',
      'incomplete_expired',
      'grace_period',
    ]),
    currentPeriodStart: z.string(),
    currentPeriodEnd: z.string(),
    cancelAtPeriodEnd: z.boolean(),
    canceledAt: z.string().optional(),
    trialStart: z.string().optional(),
    trialEnd: z.string().optional(),
    createdAt: z.string(),
    updatedAt: z.string(),
  }),
});

export type SubscriptionResponse = z.infer<typeof SubscriptionResponseSchema>;

export const CreateSubscriptionRequestSchema = z.object({
  planId: z.string().uuid(),
  billingInterval: z.enum(['monthly', 'yearly']),
  paymentMethodId: z.string().optional(), // mock/test only
});

export type CreateSubscriptionRequest = z.infer<typeof CreateSubscriptionRequestSchema>;

export const CancelSubscriptionRequestSchema = z.object({
  subscriptionId: z.string().uuid(),
  atPeriodEnd: z.boolean().default(true),
});

export type CancelSubscriptionRequest = z.infer<typeof CancelSubscriptionRequestSchema>;

// --- Payments ---

export const CheckoutSessionRequestSchema = z.object({
  planId: z.string().uuid(),
  billingInterval: z.enum(['monthly', 'yearly']),
  successUrl: z.string().url(),
  cancelUrl: z.string().url(),
});

export type CheckoutSessionRequest = z.infer<typeof CheckoutSessionRequestSchema>;

export const CheckoutSessionResponseSchema = z.object({
  ok: z.literal(true),
  requestId: z.string(),
  checkoutUrl: z.string().url(),
  checkoutSessionId: z.string(),
});

export type CheckoutSessionResponse = z.infer<typeof CheckoutSessionResponseSchema>;

export const PaymentTransactionResponseSchema = z.object({
  ok: z.literal(true),
  requestId: z.string(),
  transaction: z.object({
    id: z.string(),
    subscriptionId: z.string(),
    amountCents: z.number().int(),
    currency: z.string().length(3),
    status: z.enum(['pending', 'succeeded', 'failed', 'refunded', 'disputed']),
    paymentDate: z.string(),
  }),
});

export type PaymentTransactionResponse = z.infer<typeof PaymentTransactionResponseSchema>;

// --- Cloud AI Gateway ---

export const AIInvokeRequestSchema = z.object({
  modelId: z.string().uuid(),
  capability: z.string().min(1),
  input: z.string().min(1),
  consent: z.boolean().refine((v) => v === true, {
    message: 'Consent is required for cloud AI execution',
  }),
  stream: z.boolean().default(false),
});

export type AIInvokeRequest = z.infer<typeof AIInvokeRequestSchema>;

export const AIInvokeResponseSchema = z.object({
  ok: z.literal(true),
  requestId: z.string(),
  result: z.string(),
  modelId: z.string(),
  capability: z.string(),
  tokensInput: z.number().int().optional(),
  tokensOutput: z.number().int().optional(),
  costCents: z.number().int(),
  creditsUsed: z.number().int(),
  stream: z.boolean().default(false),
});

export type AIInvokeResponse = z.infer<typeof AIInvokeResponseSchema>;

export const AIModelInfoSchema = z.object({
  id: z.string(),
  modelId: z.string(),
  name: z.string(),
  providerId: z.string(),
  providerName: z.string(),
  contextLimit: z.number().int().optional(),
  inputModalities: z.array(z.string()),
  outputModalities: z.array(z.string()),
  supportsVision: z.boolean(),
  supportsAudio: z.boolean(),
  supportsStreaming: z.boolean(),
  supportsStructuredOutput: z.boolean(),
  capabilities: z.array(z.string()),
  isAvailable: z.boolean(),
});

export type AIModelInfo = z.infer<typeof AIModelInfoSchema>;

export const AIModelListResponseSchema = z.object({
  ok: z.literal(true),
  requestId: z.string(),
  models: z.array(AIModelInfoSchema),
});

export type AIModelListResponse = z.infer<typeof AIModelListResponseSchema>;


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

// --- OAuth (Google / GitHub) ---

export const OAuthProviderSchema = z.enum(['google', 'github']);

export type OAuthProvider = z.infer<typeof OAuthProviderSchema>;

export const OAuthInitiateRequestSchema = z.object({
  provider: OAuthProviderSchema,
  redirectTo: z.string().url().optional(),
});

export type OAuthInitiateRequest = z.infer<typeof OAuthInitiateRequestSchema>;

export const OAuthInitiateResponseSchema = z.object({
  ok: z.literal(true),
  requestId: z.string(),
  provider: OAuthProviderSchema,
  authorizationUrl: z.string().url(),
  state: z.string(),
});

export type OAuthInitiateResponse = z.infer<typeof OAuthInitiateResponseSchema>;

export const OAuthCallbackRequestSchema = z.object({
  provider: OAuthProviderSchema,
  code: z.string().min(1),
  state: z.string().min(1),
  redirectTo: z.string().url().optional(),
});

export type OAuthCallbackRequest = z.infer<typeof OAuthCallbackRequestSchema>;

export const OAuthCallbackResponseSchema = z.object({
  ok: z.literal(true),
  requestId: z.string(),
  accessToken: z.string(),
  refreshToken: z.string(),
  expiresIn: z.number(),
  user: z.object({
    id: z.string(),
    email: z.string(),
    emailConfirmed: z.boolean(),
    provider: OAuthProviderSchema,
    isNewUser: z.boolean(),
  }),
});

export type OAuthCallbackResponse = z.infer<typeof OAuthCallbackResponseSchema>;

export const OAuthProviderStatusSchema = z.object({
  ok: z.literal(true),
  requestId: z.string(),
  providers: z.array(
    z.object({
      provider: OAuthProviderSchema,
      configured: z.boolean(),
    }),
  ),
});

export type OAuthProviderStatus = z.infer<typeof OAuthProviderStatusSchema>;

// --- Account Linking ---

export const AccountLinkRequestSchema = z.object({
  provider: OAuthProviderSchema,
  code: z.string().min(1),
  state: z.string().min(1),
});

export type AccountLinkRequest = z.infer<typeof AccountLinkRequestSchema>;

export const AccountLinkResponseSchema = z.object({
  ok: z.literal(true),
  requestId: z.string(),
  provider: OAuthProviderSchema,
  linked: z.boolean(),
});

export type AccountLinkResponse = z.infer<typeof AccountLinkResponseSchema>;

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

// --- Module Catalogue ---

export const ModuleCatalogueEntrySchema = z.object({
  id: z.string(),
  moduleId: z.string(),
  name: z.string(),
  description: z.string().optional(),
  category: z.string(),
  isActive: z.boolean(),
  isDeprecated: z.boolean(),
  deprecationDate: z.string().optional(),
  createdAt: z.string(),
});

export type ModuleCatalogueEntry = z.infer<typeof ModuleCatalogueEntrySchema>;

export const ModuleCatalogueListResponseSchema = z.object({
  ok: z.literal(true),
  requestId: z.string(),
  modules: z.array(ModuleCatalogueEntrySchema),
});

export type ModuleCatalogueListResponse = z.infer<typeof ModuleCatalogueListResponseSchema>;

export const ModuleVersionManifestSchema = z.object({
  id: z.string(),
  version: z.string(),
  supportedOs: z.array(z.string()),
  cpuRequirements: z.string().optional(),
  memoryRequirementsMb: z.number().int().optional(),
  gpuRequirements: z.string().optional(),
  vramRequirementsMb: z.number().int().optional(),
  runtimeRequirements: z.string().optional(),
  capabilityDeclarations: z.record(z.string(), z.boolean()),
  packageSizeBytes: z.number().int().optional(),
  packageHashSha256: z.string().optional(),
  compatibilityConstraints: z.record(z.string(), z.unknown()),
  releaseStatus: z.string(),
  createdAt: z.string(),
});

export type ModuleVersionManifest = z.infer<typeof ModuleVersionManifestSchema>;

export const ModuleVersionListResponseSchema = z.object({
  ok: z.literal(true),
  requestId: z.string(),
  moduleId: z.string(),
  versions: z.array(ModuleVersionManifestSchema),
});

export type ModuleVersionListResponse = z.infer<typeof ModuleVersionListResponseSchema>;

export const DownloadAuthorizationRequestSchema = z.object({
  moduleVersionId: z.string().uuid(),
});

export type DownloadAuthorizationRequest = z.infer<typeof DownloadAuthorizationRequestSchema>;

export const DownloadAuthorizationResponseSchema = z.object({
  ok: z.literal(true),
  requestId: z.string(),
  authorizationToken: z.string(),
  expiresAt: z.string(),
  downloadUrl: z.string().url(),
});

export type DownloadAuthorizationResponse = z.infer<typeof DownloadAuthorizationResponseSchema>;

export const DownloadAuditSchema = z.object({
  id: z.string(),
  moduleVersionId: z.string().optional(),
  downloadedAt: z.string(),
  success: z.boolean(),
  errorMessage: z.string().optional(),
});

export type DownloadAudit = z.infer<typeof DownloadAuditSchema>;

export const DownloadAuditListResponseSchema = z.object({
  ok: z.literal(true),
  requestId: z.string(),
  audits: z.array(DownloadAuditSchema),
});

export type DownloadAuditListResponse = z.infer<typeof DownloadAuditListResponseSchema>;

// --- Desktop Release and Updater API ---

export const ReleaseChannelSchema = z.object({
  id: z.string(),
  channelId: z.string(),
  name: z.string(),
  description: z.string().optional(),
  isActive: z.boolean(),
  createdAt: z.string(),
});

export type ReleaseChannel = z.infer<typeof ReleaseChannelSchema>;

export const ReleaseInfoSchema = z.object({
  id: z.string(),
  channelId: z.string(),
  channelIdText: z.string(),
  version: z.string(),
  platform: z.enum(['windows', 'macos', 'linux']),
  architecture: z.enum(['x64', 'arm64']),
  minSupportedVersion: z.string().optional(),
  isMandatory: z.boolean(),
  rolloutPercentage: z.number().int(),
  releaseNotes: z.string().optional(),
  isRollbackCompatible: z.boolean(),
  createdAt: z.string(),
});

export type ReleaseInfo = z.infer<typeof ReleaseInfoSchema>;

export const ReleaseAssetSchema = z.object({
  id: z.string(),
  assetId: z.string(),
  assetType: z.enum(['installer', 'checksum', 'signature']),
  packageUrl: z.string().url(),
  packageHashSha256: z.string(),
  packageSizeBytes: z.number().int().optional(),
  signedMetadata: z.string().optional(),
  createdAt: z.string(),
});

export type ReleaseAsset = z.infer<typeof ReleaseAssetSchema>;

export const ReleaseCheckRequestSchema = z.object({
  platform: z.enum(['windows', 'macos', 'linux']),
  architecture: z.enum(['x64', 'arm64']),
  currentVersion: z.string(),
  channel: z.string().default('stable'),
});

export type ReleaseCheckRequest = z.infer<typeof ReleaseCheckRequestSchema>;

export const ReleaseCheckResponseSchema = z.object({
  ok: z.literal(true),
  requestId: z.string(),
  updateAvailable: z.boolean(),
  release: ReleaseInfoSchema.optional(),
  assets: z.array(ReleaseAssetSchema),
});

export type ReleaseCheckResponse = z.infer<typeof ReleaseCheckResponseSchema>;

export const ReleaseListResponseSchema = z.object({
  ok: z.literal(true),
  requestId: z.string(),
  releases: z.array(ReleaseInfoSchema),
});

export type ReleaseListResponse = z.infer<typeof ReleaseListResponseSchema>;

export const ReleaseChannelsResponseSchema = z.object({
  ok: z.literal(true),
  requestId: z.string(),
  channels: z.array(ReleaseChannelSchema),
});

export type ReleaseChannelsResponse = z.infer<typeof ReleaseChannelsResponseSchema>;

// --- Backups, Notifications, Administration ---

export const ConsentRecordSchema = z.object({
  id: z.string(),
  consentCategory: z.string(),
  consentGiven: z.boolean(),
  consentTimestamp: z.string(),
  consentWithdrawn: z.boolean(),
  withdrawnAt: z.string().optional(),
  createdAt: z.string(),
});

export type ConsentRecord = z.infer<typeof ConsentRecordSchema>;

export const BackupMetadataSchema = z.object({
  id: z.string(),
  backupCategory: z.string(),
  encryptionEnabled: z.boolean(),
  retentionDays: z.number().int(),
  status: z.string(),
  lastBackupAt: z.string().optional(),
  nextBackupAt: z.string().optional(),
  createdAt: z.string(),
});

export type BackupMetadata = z.infer<typeof BackupMetadataSchema>;

export const AdminRoleSchema = z.object({
  id: z.string(),
  userId: z.string(),
  role: z.string(),
  isActive: z.boolean(),
  grantedAt: z.string(),
  expiresAt: z.string().optional(),
});

export type AdminRole = z.infer<typeof AdminRoleSchema>;

export const AdminAuditEventSchema = z.object({
  id: z.string(),
  adminUserId: z.string(),
  targetUserId: z.string().optional(),
  action: z.string(),
  targetType: z.string().optional(),
  targetId: z.string().optional(),
  metadata: z.record(z.string(), z.unknown()),
  createdAt: z.string(),
});

export type AdminAuditEvent = z.infer<typeof AdminAuditEventSchema>;

export const ConsentUpdateRequestSchema = z.object({
  consentCategory: z.string(),
  consentGiven: z.boolean(),
});

export type ConsentUpdateRequest = z.infer<typeof ConsentUpdateRequestSchema>;

export const BackupStatusRequestSchema = z.object({
  backupCategory: z.string(),
});

export type BackupStatusRequest = z.infer<typeof BackupStatusRequestSchema>;

export const AdminUserLookupResponseSchema = z.object({
  ok: z.literal(true),
  requestId: z.string(),
  user: z.object({
    id: z.string(),
    email: z.string(),
    status: z.string(),
    locale: z.string(),
    createdAt: z.string(),
  }),
});

export type AdminUserLookupResponse = z.infer<typeof AdminUserLookupResponseSchema>;

export const AdminCreditAdjustmentRequestSchema = z.object({
  userId: z.string().uuid(),
  amountCents: z.number().int(),
  reason: z.string(),
  idempotencyKey: z.string(),
});

export type AdminCreditAdjustmentRequest = z.infer<typeof AdminCreditAdjustmentRequestSchema>;

export const AdminDeviceRevokeRequestSchema = z.object({
  deviceId: z.string().uuid(),
  userId: z.string().uuid(),
  reason: z.string(),
});

export type AdminDeviceRevokeRequest = z.infer<typeof AdminDeviceRevokeRequestSchema>;

export const AdminAuditListResponseSchema = z.object({
  ok: z.literal(true),
  requestId: z.string(),
  auditEvents: z.array(AdminAuditEventSchema),
});

export type AdminAuditListResponse = z.infer<typeof AdminAuditListResponseSchema>;

// --- Account Deletion ---

export const AccountDeletionRequestSchema = z.object({
  reason: z.string().min(1).max(500).optional(),
  confirmPassword: z.string().min(1),
});

export type AccountDeletionRequest = z.infer<typeof AccountDeletionRequestSchema>;

export const AccountDeletionResponseSchema = z.object({
  ok: z.literal(true),
  requestId: z.string(),
  accountId: z.string(),
  status: z.string(),
  deletionScheduledAt: z.string(),
  dataRetentionDays: z.number().int(),
});

export type AccountDeletionResponse = z.infer<typeof AccountDeletionResponseSchema>;

export const AccountStatusResponseSchema = z.object({
  ok: z.literal(true),
  requestId: z.string(),
  account: z.object({
    id: z.string(),
    email: z.string(),
    status: z.string(),
    locale: z.string(),
    createdAt: z.string(),
    updatedAt: z.string(),
    deletedAt: z.string().optional(),
  }),
});

export type AccountStatusResponse = z.infer<typeof AccountStatusResponseSchema>;

// --- Role Management ---

export const RoleAssignmentRequestSchema = z.object({
  userId: z.string().uuid(),
  role: z.enum(['admin', 'support', 'auditor', 'billing']),
});

export type RoleAssignmentRequest = z.infer<typeof RoleAssignmentRequestSchema>;

export const RoleAssignmentResponseSchema = z.object({
  ok: z.literal(true),
  requestId: z.string(),
  userId: z.string(),
  role: z.string(),
  granted: z.boolean(),
});

export type RoleAssignmentResponse = z.infer<typeof RoleAssignmentResponseSchema>;

export const RoleListResponseSchema = z.object({
  ok: z.literal(true),
  requestId: z.string(),
  roles: z.array(AdminRoleSchema),
});

export type RoleListResponse = z.infer<typeof RoleListResponseSchema>;

// --- Account Data Export ---

export const AccountExportRequestSchema = z.object({
  includeAuditEvents: z.boolean().default(false),
  includeUsageRecords: z.boolean().default(false),
});

export type AccountExportRequest = z.infer<typeof AccountExportRequestSchema>;

export const AccountExportResponseSchema = z.object({
  ok: z.literal(true),
  requestId: z.string(),
  exportId: z.string(),
  status: z.string(),
  downloadUrl: z.string().url().optional(),
  expiresAt: z.string().optional(),
});

export type AccountExportResponse = z.infer<typeof AccountExportResponseSchema>;


/**
 * Veyra Platform Typed Client SDK
 *
 * This SDK can be consumed by Veyra Website and Veyra Desktop to interact
 * with the Veyra Platform API.
 *
 * The SDK does NOT contain secrets or privileged server logic.
 * All authentication is handled via Supabase JWT tokens passed by the caller.
 */

export interface VeyraClientOptions {
  baseUrl: string;
  accessToken?: string;
}

/**
 * Standard API error response.
 */
export interface VeyraApiError {
  code: string;
  message: string;
  status: number;
}

/**
 * Typed Veyra Platform client.
 * All methods return the parsed response body or throw a VeyraApiError.
 */
export class VeyraClient {
  private baseUrl: string;
  private accessToken?: string;

  constructor(options: VeyraClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/$/, '');
    this.accessToken = options.accessToken;
  }

  /**
   * Set or update the access token (Supabase JWT).
   */
  setAccessToken(token: string) {
    this.accessToken = token;
  }

  /**
   * Clear the access token (logout).
   */
  clearAccessToken() {
    this.accessToken = undefined;
  }

  private async request<T>(
    method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
    path: string,
    body?: unknown,
  ): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    if (this.accessToken) {
      headers['Authorization'] = `Bearer ${this.accessToken}`;
    }

    const res = await fetch(url, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });

    let data: any;
    try {
      data = await res.json();
    } catch {
      data = {};
    }

    if (!res.ok) {
      const error: VeyraApiError = {
        code: data.error?.code || 'UNKNOWN_ERROR',
        message: data.error?.message || `Request failed with status ${res.status}`,
        status: res.status,
      };
      throw error;
    }

    return data as T;
  }

  // ========================================================================
  // Authentication
  // ========================================================================

  async register(email: string, password: string) {
    return this.request<{
      ok: boolean;
      requestId: string;
      accessToken: string;
      refreshToken: string;
      expiresIn: number;
      user: { id: string; email: string; emailConfirmed: boolean };
    }>('POST', '/api/v1/auth/register', { email, password });
  }

  async login(email: string, password: string) {
    return this.request<{
      ok: boolean;
      requestId: string;
      accessToken: string;
      refreshToken: string;
      expiresIn: number;
      user: { id: string; email: string; emailConfirmed: boolean };
    }>('POST', '/api/v1/auth/login', { email, password });
  }

  async logout() {
    return this.request<{ ok: boolean; requestId: string }>('POST', '/api/v1/auth/logout');
  }

  async refresh(refreshToken: string) {
    return this.request<{
      ok: boolean;
      requestId: string;
      accessToken: string;
      refreshToken: string;
      expiresIn: number;
      user: { id: string; email: string; emailConfirmed: boolean };
    }>('POST', '/api/v1/auth/refresh', { refreshToken });
  }

  async passwordRecovery(email: string) {
    return this.request<{ ok: boolean; requestId: string }>('POST', '/api/v1/auth/password-recovery', { email });
  }

  async getProfile() {
    return this.request<{
      ok: boolean;
      requestId: string;
      profile: {
        id: string;
        email: string;
        displayName: string | undefined;
        locale: string;
        status: string;
        createdAt: string;
      };
    }>('GET', '/api/v1/auth/me');
  }

  async updateProfile(body: { displayName?: string; locale?: string }) {
    return this.request<{
      ok: boolean;
      requestId: string;
      profile: {
        id: string;
        email: string;
        displayName: string | undefined;
        locale: string;
        status: string;
        createdAt: string;
      };
    }>('PATCH', '/api/v1/auth/me', body);
  }

  // ========================================================================
  // OAuth (Google / GitHub)
  // ========================================================================

  async getOAuthProviders() {
    return this.request<{
      ok: boolean;
      requestId: string;
      providers: Array<{
        provider: 'google' | 'github';
        configured: boolean;
      }>;
    }>('GET', '/api/v1/auth/oauth/providers');
  }

  async oauthAuthorize(body: {
    provider: 'google' | 'github';
    redirectTo?: string;
  }) {
    return this.request<{
      ok: boolean;
      requestId: string;
      provider: 'google' | 'github';
      authorizationUrl: string;
      state: string;
    }>('POST', '/api/v1/auth/oauth/authorize', body);
  }

  async oauthCallback(body: {
    provider: 'google' | 'github';
    code: string;
    state: string;
    redirectTo?: string;
  }) {
    return this.request<{
      ok: boolean;
      requestId: string;
      accessToken: string;
      refreshToken: string;
      expiresIn: number;
      user: {
        id: string;
        email: string;
        emailConfirmed: boolean;
        provider: 'google' | 'github';
        isNewUser: boolean;
      };
    }>('POST', '/api/v1/auth/oauth/callback', body);
  }

  async oauthLink(body: {
    provider: 'google' | 'github';
    code: string;
    state: string;
  }) {
    return this.request<{
      ok: boolean;
      requestId: string;
      provider: 'google' | 'github';
      linked: boolean;
    }>('POST', '/api/v1/auth/oauth/link', body);
  }

  // ========================================================================
  // Devices
  // ========================================================================

  async registerDevice(body: {
    installationId: string;
    deviceName?: string;
    platform?: 'windows' | 'macos' | 'linux';
  }) {
    return this.request<{
      ok: boolean;
      requestId: string;
      device: {
        id: string;
        installationId: string;
        deviceName: string | undefined;
        platform: string | undefined;
        isAuthorized: boolean;
        isRevoked: boolean;
        lastSeenAt: string | undefined;
        createdAt: string;
      };
      deviceCredentialHash: string;
    }>('POST', '/api/v1/devices/register', body);
  }

  async listDevices() {
    return this.request<{
      ok: boolean;
      requestId: string;
      devices: Array<{
        id: string;
        installationId: string;
        deviceName: string | undefined;
        platform: string | undefined;
        isAuthorized: boolean;
        isRevoked: boolean;
        lastSeenAt: string | undefined;
        createdAt: string;
      }>;
    }>('GET', '/api/v1/devices');
  }

  async authorizeDevice(deviceId: string) {
    return this.request<{
      ok: boolean;
      requestId: string;
      device: {
        id: string;
        installationId: string;
        deviceName: string | undefined;
        platform: string | undefined;
        isAuthorized: boolean;
        isRevoked: boolean;
        lastSeenAt: string | undefined;
        createdAt: string;
      };
    }>('PATCH', `/api/v1/devices/${deviceId}/authorize`);
  }

  async revokeDevice(deviceId: string) {
    return this.request<{ ok: boolean; requestId: string }>('DELETE', `/api/v1/devices/${deviceId}`);
  }

  async updateDeviceLastSeen(deviceId: string) {
    return this.request<{ ok: boolean; requestId: string }>('PATCH', `/api/v1/devices/${deviceId}/last-seen`);
  }

  // ========================================================================
  // Entitlements
  // ========================================================================

  async checkEntitlement(capability: string) {
    return this.request<{
      ok: boolean;
      requestId: string;
      capability: string;
      entitled: boolean;
      reason: string | undefined;
      expiresAt: string | undefined;
    }>('POST', '/api/v1/entitlements/check', { capability });
  }

  async listEntitlements() {
    return this.request<{
      ok: boolean;
      requestId: string;
      entitlements: Array<{
        capability: string;
        entitled: boolean;
        reason: string | undefined;
        expiresAt: string | undefined;
      }>;
    }>('GET', '/api/v1/entitlements');
  }

  async getEntitlementSnapshot() {
    return this.request<{
      ok: boolean;
      requestId: string;
      snapshot: string;
      expiresAt: string;
    }>('POST', '/api/v1/entitlements/snapshot');
  }

  async verifyEntitlementSnapshot(snapshot: string) {
    return this.request<{
      ok: true;
      requestId: string;
      valid: boolean;
      payload?: {
        userId: string;
        entitlements: Array<{ capability: string; entitled: boolean }>;
        expiresAt: string;
      };
      reason: string | undefined;
    }>('POST', '/api/v1/entitlements/snapshot/verify', { snapshot });
  }

  // ========================================================================
  // Plans
  // ========================================================================

  async listPlans() {
    return this.request<{
      ok: boolean;
      requestId: string;
      plans: Array<{
        id: string;
        name: string;
        family: 'local' | 'hybrid' | 'cloud';
        description: string | undefined;
        billingInterval: 'monthly' | 'yearly';
        priceCents: number;
        currency: string;
        features: Record<string, boolean>;
        deviceLimit: number;
        isActive: boolean;
        isDevFixture: boolean;
        createdAt: string;
      }>;
    }>('GET', '/api/v1/plans');
  }

  async getPlan(planId: string) {
    return this.request<{
      ok: boolean;
      requestId: string;
      plan: {
        id: string;
        name: string;
        family: 'local' | 'hybrid' | 'cloud';
        description: string | undefined;
        billingInterval: 'monthly' | 'yearly';
        priceCents: number;
        currency: string;
        features: Record<string, boolean>;
        deviceLimit: number;
        isActive: boolean;
        isDevFixture: boolean;
        createdAt: string;
      };
    }>('GET', `/api/v1/plans/${planId}`);
  }

  // ========================================================================
  // Pricing
  // ========================================================================

  async listPricingCountries() {
    return this.request<{
      ok: boolean;
      requestId: string;
      countries: Array<{
        country: string;
        countryName: string;
        currency: string;
        currencySymbol: string;
        currencyExponent: number;
        isSupported: boolean;
      }>;
    }>('GET', '/api/v1/pricing/countries');
  }

  async listCountryCurrencies(country: string) {
    return this.request<{
      ok: boolean;
      requestId: string;
      country: string;
      currencies: Array<{
        country: string;
        currency: string;
        currencySymbol: string;
        currencyExponent: number;
        isSupported: boolean;
      }>;
    }>('GET', `/api/v1/pricing/countries/${country}/currencies`);
  }

  async getPlanPricing(country: string, currency: string) {
    return this.request<{
      ok: boolean;
      requestId: string;
      country: string;
      currency: string;
      currencySymbol: string;
      currencyExponent: number;
      plans: Array<{
        planId: string;
        planName: string;
        planFamily: string;
        amountCents: number;
        billingInterval: 'monthly' | 'yearly';
        isAvailable: boolean;
      }>;
    }>('GET', `/api/v1/pricing/plans?country=${country}&currency=${currency}`);
  }

  async detectCountry() {
    return this.request<{
      ok: boolean;
      requestId: string;
      country: string;
      currency: string;
      currencySymbol: string;
      detectedBy: 'user_preference' | 'geolocation' | 'default';
    }>('GET', '/api/v1/pricing/detect');
  }

  // ========================================================================
  // Subscriptions
  // ========================================================================

  async getCurrentSubscription() {
    return this.request<{
      ok: boolean;
      requestId: string;
      subscription: {
        id: string;
        planId: string;
        billingInterval: 'monthly' | 'yearly';
        status: string;
        currentPeriodStart: string;
        currentPeriodEnd: string;
        cancelAtPeriodEnd: boolean;
        canceledAt: string | undefined;
        trialStart: string | undefined;
        trialEnd: string | undefined;
        createdAt: string;
        updatedAt: string;
      } | null;
    }>('GET', '/api/v1/subscriptions/current');
  }

  async createSubscription(body: {
    planId: string;
    billingInterval: 'monthly' | 'yearly';
    paymentMethodId?: string;
  }) {
    return this.request<{
      ok: boolean;
      requestId: string;
      subscription: {
        id: string;
        planId: string;
        billingInterval: 'monthly' | 'yearly';
        status: string;
        currentPeriodStart: string;
        currentPeriodEnd: string;
        cancelAtPeriodEnd: boolean;
        createdAt: string;
        updatedAt: string;
      };
    }>('POST', '/api/v1/subscriptions', body);
  }

  async cancelSubscription(body: {
    subscriptionId: string;
    atPeriodEnd?: boolean;
  }) {
    return this.request<{
      ok: boolean;
      requestId: string;
      subscription: {
        id: string;
        status: string;
        cancelAtPeriodEnd: boolean;
        canceledAt: string | undefined;
      };
    }>('POST', '/api/v1/subscriptions/cancel', body);
  }

  async reactivateSubscription(subscriptionId: string) {
    return this.request<{
      ok: boolean;
      requestId: string;
      subscription: {
        id: string;
        status: string;
        cancelAtPeriodEnd: boolean;
      };
    }>('POST', '/api/v1/subscriptions/reactivate', { subscriptionId });
  }

  // ========================================================================
  // Payments
  // ========================================================================

  async createCheckoutSession(body: {
    planId: string;
    billingInterval: 'monthly' | 'yearly';
    successUrl: string;
    cancelUrl: string;
  }) {
    return this.request<{
      ok: boolean;
      requestId: string;
      checkoutUrl: string;
      checkoutSessionId: string;
    }>('POST', '/api/v1/payments/checkout', body);
  }

  // ========================================================================
  // Credits
  // ========================================================================

  async getCreditBalance() {
    return this.request<{
      ok: boolean;
      requestId: string;
      balance: { balanceCents: number; currency: string };
    }>('GET', '/api/v1/credits/balance');
  }

  async reserveCredits(body: {
    amountCents: number;
    idempotencyKey: string;
    service?: string;
    referenceId?: string;
  }) {
    return this.request<{
      ok: boolean;
      requestId: string;
      reservationId: string;
      balanceCents: number;
    }>('POST', '/api/v1/credits/reserve', body);
  }

  async settleReservation(reservationId: string) {
    return this.request<{ ok: boolean; requestId: string }>('POST', '/api/v1/credits/settle', { reservationId });
  }

  async releaseReservation(reservationId: string) {
    return this.request<{ ok: boolean; requestId: string }>('POST', '/api/v1/credits/release', { reservationId });
  }

  // ========================================================================
  // Cloud AI
  // ========================================================================

  async invokeCloudAI(body: {
    modelId: string;
    capability: string;
    input: string;
    consent: boolean;
    stream?: boolean;
  }) {
    return this.request<{
      ok: boolean;
      requestId: string;
      result: string;
      modelId: string;
      capability: string;
      tokensInput: number | undefined;
      tokensOutput: number | undefined;
      costCents: number;
      creditsUsed: number;
      stream: boolean;
    }>('POST', '/api/v1/ai/invoke', body);
  }

  async listAIModels() {
    return this.request<{
      ok: boolean;
      requestId: string;
      models: Array<{
        id: string;
        modelId: string;
        name: string;
        providerId: string;
        providerName: string;
        contextLimit: number | undefined;
        inputModalities: string[];
        outputModalities: string[];
        supportsVision: boolean;
        supportsAudio: boolean;
        supportsStreaming: boolean;
        supportsStructuredOutput: boolean;
        capabilities: string[];
        isAvailable: boolean;
      }>;
    }>('GET', '/api/v1/ai/models');
  }

  // ========================================================================
  // Modules
  // ========================================================================

  async listModules() {
    return this.request<{
      ok: boolean;
      requestId: string;
      modules: Array<{
        id: string;
        moduleId: string;
        name: string;
        description: string | undefined;
        category: string;
        isActive: boolean;
        isDeprecated: boolean;
        deprecationDate: string | undefined;
        createdAt: string;
      }>;
    }>('GET', '/api/v1/modules');
  }

  async listModuleVersions(moduleId: string) {
    return this.request<{
      ok: boolean;
      requestId: string;
      moduleId: string;
      versions: Array<{
        id: string;
        version: string;
        supportedOs: string[];
        cpuRequirements: string | undefined;
        memoryRequirementsMb: number | undefined;
        gpuRequirements: string | undefined;
        vramRequirementsMb: number | undefined;
        runtimeRequirements: string | undefined;
        capabilityDeclarations: Record<string, boolean>;
        packageSizeBytes: number | undefined;
        packageHashSha256: string | undefined;
        compatibilityConstraints: Record<string, unknown>;
        releaseStatus: string;
        createdAt: string;
      }>;
    }>('GET', `/api/v1/modules/${moduleId}/versions`);
  }

  // ========================================================================
  // Downloads
  // ========================================================================

  async authorizeDownload(moduleVersionId: string) {
    return this.request<{
      ok: boolean;
      requestId: string;
      authorizationToken: string;
      expiresAt: string;
      downloadUrl: string;
    }>('POST', '/api/v1/downloads/authorize', { moduleVersionId });
  }

  async verifyDownloadAuthorization(token: string) {
    return this.request<{
      ok: true;
      requestId: string;
      valid: boolean;
      payload?: {
        userId: string;
        entitlements: Array<{ capability: string; entitled: boolean }>;
        expiresAt: string;
      };
      reason: string | undefined;
    }>('POST', '/api/v1/downloads/authorize/verify', { token });
  }

  async listDownloadAudit() {
    return this.request<{
      ok: boolean;
      requestId: string;
      audits: Array<{
        id: string;
        moduleVersionId: string | undefined;
        downloadedAt: string;
        success: boolean;
        errorMessage: string | undefined;
      }>;
    }>('GET', '/api/v1/downloads/audit');
  }

  // ========================================================================
  // Releases
  // ========================================================================

  async checkForUpdate(body: {
    platform: 'windows' | 'macos' | 'linux';
    architecture: 'x64' | 'arm64';
    currentVersion: string;
    channel?: string;
  }) {
    return this.request<{
      ok: boolean;
      requestId: string;
      updateAvailable: boolean;
      release: {
        id: string;
        channelId: string;
        channelIdText: string;
        version: string;
        platform: 'windows' | 'macos' | 'linux';
        architecture: 'x64' | 'arm64';
        minSupportedVersion: string | undefined;
        isMandatory: boolean;
        rolloutPercentage: number;
        releaseNotes: string | undefined;
        isRollbackCompatible: boolean;
        createdAt: string;
      } | undefined;
      assets: Array<{
        id: string;
        assetId: string;
        assetType: 'installer' | 'checksum' | 'signature';
        packageUrl: string;
        packageHashSha256: string;
        packageSizeBytes: number | undefined;
        signedMetadata: string | undefined;
        createdAt: string;
      }>;
    }>('POST', '/api/v1/releases/check', body);
  }

  async listReleaseChannels() {
    return this.request<{
      ok: boolean;
      requestId: string;
      channels: Array<{
        id: string;
        channelId: string;
        name: string;
        description: string | undefined;
        isActive: boolean;
        createdAt: string;
      }>;
    }>('GET', '/api/v1/releases/channels');
  }

  async listReleases() {
    return this.request<{
      ok: boolean;
      requestId: string;
      releases: Array<{
        id: string;
        channelId: string;
        channelIdText: string;
        version: string;
        platform: 'windows' | 'macos' | 'linux';
        architecture: 'x64' | 'arm64';
        minSupportedVersion: string | undefined;
        isMandatory: boolean;
        rolloutPercentage: number;
        releaseNotes: string | undefined;
        isRollbackCompatible: boolean;
        createdAt: string;
      }>;
    }>('GET', '/api/v1/releases');
  }

  // ========================================================================
  // Backups
  // ========================================================================

  async getBackupMetadata(backupCategory: string) {
    return this.request<{
      ok: boolean;
      requestId: string;
      backup: {
        id: string;
        backupCategory: string;
        encryptionEnabled: boolean;
        retentionDays: number;
        status: string;
        lastBackupAt: string | undefined;
        nextBackupAt: string | undefined;
        createdAt: string;
        updatedAt: string;
      } | null;
    }>('GET', `/api/v1/backups/${backupCategory}`);
  }

  async setBackupMetadata(backupCategory: string, body: {
    encryptionEnabled?: boolean;
    retentionDays?: number;
    status?: string;
  }) {
    return this.request<{
      ok: boolean;
      requestId: string;
      backup: {
        id: string;
        backupCategory: string;
        encryptionEnabled: boolean;
        retentionDays: number;
        status: string;
        createdAt: string;
        updatedAt: string;
      };
    }>('POST', `/api/v1/backups/${backupCategory}`, body);
  }

  async deleteBackupMetadata(backupCategory: string) {
    return this.request<{ ok: boolean; requestId: string }>('DELETE', `/api/v1/backups/${backupCategory}`);
  }

  async getConsentRecord(consentCategory: string) {
    return this.request<{
      ok: boolean;
      requestId: string;
      consent: {
        id: string;
        consentCategory: string;
        consentGiven: boolean;
        consentTimestamp: string;
        consentWithdrawn: boolean;
        withdrawnAt: string | undefined;
        createdAt: string;
        updatedAt: string;
      } | null;
    }>('GET', `/api/v1/consent/${consentCategory}`);
  }

  async setConsentRecord(consentCategory: string, consentGiven: boolean) {
    return this.request<{
      ok: boolean;
      requestId: string;
      consent: {
        id: string;
        consentCategory: string;
        consentGiven: boolean;
        consentTimestamp: string;
        consentWithdrawn: boolean;
        withdrawnAt: string | undefined;
        createdAt: string;
        updatedAt: string;
      };
    }>('POST', `/api/v1/consent/${consentCategory}`, { consentGiven });
  }

  // ========================================================================
  // Notifications
  // ========================================================================

  async sendTestNotification(body: {
    to: string;
    subject: string;
    body: string;
  }) {
    return this.request<{
      ok: boolean;
      requestId: string;
      messageId: string;
      provider: string;
      isLive: boolean;
    }>('POST', '/api/v1/notifications/notify/test', body);
  }

  async getNotificationStatus() {
    return this.request<{
      ok: boolean;
      provider: string;
      isLive: boolean;
      liveEmailsEnabled: boolean;
      message: string;
    }>('GET', '/api/v1/notifications/status');
  }

  // ========================================================================
  // Account
  // ========================================================================

  async getAccountStatus() {
    return this.request<{
      ok: boolean;
      requestId: string;
      account: {
        id: string;
        email: string;
        status: string;
        locale: string;
        createdAt: string;
        updatedAt: string;
        deletedAt: string | undefined;
      };
    }>('GET', '/api/v1/account/status');
  }

  async requestAccountDeletion(body: {
    reason?: string;
    confirmPassword: string;
  }) {
    return this.request<{
      ok: boolean;
      requestId: string;
      accountId: string;
      status: string;
      deletionScheduledAt: string;
      dataRetentionDays: number;
    }>('POST', '/api/v1/account/deletion/request', body);
  }

  async requestAccountExport(body: {
    includeAuditEvents?: boolean;
    includeUsageRecords?: boolean;
  }) {
    return this.request<{
      ok: boolean;
      requestId: string;
      exportId: string;
      status: string;
      downloadUrl: string | undefined;
      expiresAt: string | undefined;
    }>('POST', '/api/v1/account/export/request', body);
  }

  async adminListUserRoles(userId: string) {
    return this.request<{
      ok: boolean;
      requestId: string;
      roles: Array<{
        id: string;
        role: string;
        isActive: boolean;
        grantedAt: string;
        grantedBy: string | null;
      }>;
    }>('GET', `/api/v1/admin/users/${userId}/roles`);
  }

  async adminAssignRole(body: {
    userId: string;
    role: 'admin' | 'support' | 'auditor' | 'billing';
  }) {
    return this.request<{
      ok: boolean;
      requestId: string;
      userId: string;
      role: string;
      granted: boolean;
    }>('POST', '/api/v1/admin/roles/assign', body);
  }

  async adminRevokeRole(body: {
    userId: string;
    role: 'admin' | 'support' | 'auditor' | 'billing';
  }) {
    return this.request<{
      ok: boolean;
      requestId: string;
      userId: string;
      role: string;
      revoked: boolean;
    }>('POST', '/api/v1/admin/roles/revoke', body);
  }

  // ========================================================================
  // Pricing Engine (Admin)
  // ========================================================================

  async adminListPricingRules() {
    return this.request<{
      ok: boolean;
      requestId: string;
      rules: Array<{
        id: string;
        modelId: string | undefined;
        providerId: string | undefined;
        modality: string | undefined;
        region: string | undefined;
        inputPricePerUnitCents: number;
        outputPricePerUnitCents: number;
        currency: string;
        effectiveFrom: string;
        effectiveTo: string | undefined;
        isActive: boolean;
      }>;
    }>('GET', '/api/v1/pricing-engine/admin/pricing-rules');
  }

  async adminCreatePricingRule(body: {
    modelId?: string;
    providerId?: string;
    modality?: string;
    region?: string;
    inputPricePerUnitCents: number;
    outputPricePerUnitCents: number;
    currency: string;
    effectiveFrom: string;
    effectiveTo?: string;
  }) {
    return this.request<{
      ok: boolean;
      requestId: string;
      rule: {
        id: string;
        modelId: string | undefined;
        providerId: string | undefined;
        modality: string | undefined;
        region: string | undefined;
        inputPricePerUnitCents: number;
        outputPricePerUnitCents: number;
        currency: string;
        effectiveFrom: string;
        effectiveTo: string | undefined;
        isActive: boolean;
      };
    }>('POST', '/api/v1/pricing-engine/admin/pricing-rules', body);
  }

  async adminUpdatePricingRule(ruleId: string, body: {
    inputPricePerUnitCents?: number;
    outputPricePerUnitCents?: number;
    isActive?: boolean;
  }) {
    return this.request<{
      ok: boolean;
      requestId: string;
      rule: {
        id: string;
        modelId: string | undefined;
        providerId: string | undefined;
        modality: string | undefined;
        region: string | undefined;
        inputPricePerUnitCents: number;
        outputPricePerUnitCents: number;
        currency: string;
        effectiveFrom: string;
        effectiveTo: string | undefined;
        isActive: boolean;
      };
    }>('PATCH', `/api/v1/pricing-engine/admin/pricing-rules/${ruleId}`, body);
  }

  // ========================================================================
  // Admin
  // ========================================================================

  async adminLookupUser(userId: string) {
    return this.request<{
      ok: boolean;
      requestId: string;
      user: {
        id: string;
        email: string;
        displayName: string | undefined;
        status: string;
        locale: string;
        createdAt: string;
      };
    }>('GET', `/api/v1/admin/users/${userId}`);
  }

  async adminAdjustCredits(body: {
    userId: string;
    amountCents: number;
    reason: string;
    idempotencyKey: string;
  }) {
    return this.request<{
      ok: boolean;
      requestId: string;
      userId: string;
      amountCents: number;
      newBalance: number;
    }>('POST', '/api/v1/admin/credits/adjust', body);
  }

  async adminRevokeDevice(body: {
    deviceId: string;
    userId: string;
    reason: string;
  }) {
    return this.request<{
      ok: boolean;
      requestId: string;
      deviceId: string;
      userId: string;
    }>('POST', '/api/v1/admin/devices/revoke', body);
  }

  async adminListAuditEvents() {
    return this.request<{
      ok: boolean;
      requestId: string;
      auditEvents: Array<{
        id: string;
        adminUserId: string;
        targetUserId: string | undefined;
        action: string;
        targetType: string | undefined;
        targetId: string | undefined;
        metadata: Record<string, unknown>;
        createdAt: string;
      }>;
    }>('GET', '/api/v1/admin/audit');
  }
}

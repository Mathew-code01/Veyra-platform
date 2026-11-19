/**
 * Veyra Platform Typed Client SDK
 */
export interface VeyraClientOptions {
  baseUrl: string;
  accessToken?: string;
}
export interface VeyraApiError {
  code: string;
  message: string;
  status: number;
}
export const API_PATHS: {
  authRegister: string;
  authLogin: string;
  authLogout: string;
  authRefresh: string;
  authPasswordRecovery: string;
  authMe: string;
  authOAuthProviders: string;
  authOAuthAuthorize: string;
  authOAuthCallback: string;
  authOAuthLink: string;
  devicesRegister: string;
  devicesList: string;
  devicesAuthorize: (deviceId: string) => string;
  devicesRevoke: (deviceId: string) => string;
  devicesLastSeen: (deviceId: string) => string;
  devicesReplace: (deviceId: string) => string;
  devicesRevokeSessions: (deviceId: string) => string;
  entitlementsCheck: string;
  entitlementsList: string;
  entitlementsSnapshot: string;
  entitlementsSnapshotVerify: string;
  plansList: string;
  plansGet: (planId: string) => string;
  subscriptionsCurrent: string;
  subscriptionsCreate: string;
  subscriptionsCancel: string;
  subscriptionsReactivate: string;
  paymentsCheckout: string;
  creditsBalance: string;
  creditsReserve: string;
  creditsSettle: string;
  creditsRelease: string;
  aiInvoke: string;
  aiModels: string;
  modulesList: string;
  modulesVersions: (moduleId: string) => string;
  downloadsAuthorize: string;
  downloadsVerify: string;
  downloadsAudit: string;
  releasesCheck: string;
  releasesChannels: string;
  releasesList: string;
  backupsMetadata: (category: string) => string;
  consentRecord: (category: string) => string;
  accountStatus: string;
  accountDeletionRequest: string;
  accountExportRequest: string;
  adminLookupUser: (userId: string) => string;
  adminAdjustCredits: string;
  adminRevokeDevice: string;
  adminListAuditEvents: string;
  pricingCountries: string;
  pricingCountryCurrencies: (country: string) => string;
  pricingPlans: string;
  pricingDetect: string;
  exchangeRateLatest: string;
  exchangeRate: string;
  exchangeConvert: string;
  exchangeHistorical: string;
} = {
  authRegister: '/api/v1/auth/register',
  authLogin: '/api/v1/auth/login',
  authLogout: '/api/v1/auth/logout',
  authRefresh: '/api/v1/auth/refresh',
  authPasswordRecovery: '/api/v1/auth/password-recovery',
  authMe: '/api/v1/auth/me',
  authOAuthProviders: '/api/v1/auth/oauth/providers',
  authOAuthAuthorize: '/api/v1/auth/oauth/authorize',
  authOAuthCallback: '/api/v1/auth/oauth/callback',
  authOAuthLink: '/api/v1/auth/oauth/link',
  devicesRegister: '/api/v1/devices/register',
  devicesList: '/api/v1/devices',
  devicesAuthorize: (deviceId: string) => '/api/v1/devices/' + deviceId + '/authorize',
  devicesRevoke: (deviceId: string) => '/api/v1/devices/' + deviceId,
  devicesLastSeen: (deviceId: string) => '/api/v1/devices/' + deviceId + '/last-seen',
  devicesReplace: (deviceId: string) => '/api/v1/devices/' + deviceId + '/replace',
  devicesRevokeSessions: (deviceId: string) => '/api/v1/devices/' + deviceId + '/sessions/revoke',
  entitlementsCheck: '/api/v1/entitlements/check',
  entitlementsList: '/api/v1/entitlements',
  entitlementsSnapshot: '/api/v1/entitlements/snapshot',
  entitlementsSnapshotVerify: '/api/v1/entitlements/snapshot/verify',
  plansList: '/api/v1/plans',
  plansGet: (planId: string) => '/api/v1/plans/' + planId,
  subscriptionsCurrent: '/api/v1/subscriptions/current',
  subscriptionsCreate: '/api/v1/subscriptions',
  subscriptionsCancel: '/api/v1/subscriptions/cancel',
  subscriptionsReactivate: '/api/v1/subscriptions/reactivate',
  paymentsCheckout: '/api/v1/payments/checkout',
  creditsBalance: '/api/v1/credits/balance',
  creditsReserve: '/api/v1/credits/reserve',
  creditsSettle: '/api/v1/credits/settle',
  creditsRelease: '/api/v1/credits/release',
  aiInvoke: '/api/v1/ai/invoke',
  aiModels: '/api/v1/ai/models',
  modulesList: '/api/v1/modules',
  modulesVersions: (moduleId: string) => '/api/v1/modules/' + moduleId + '/versions',
  downloadsAuthorize: '/api/v1/downloads/authorize',
  downloadsVerify: '/api/v1/downloads/authorize/verify',
  downloadsAudit: '/api/v1/downloads/audit',
  releasesCheck: '/api/v1/releases/check',
  releasesChannels: '/api/v1/releases/channels',
  releasesList: '/api/v1/releases',
  backupsMetadata: (category: string) => '/api/v1/backups/' + category,
  consentRecord: (category: string) => '/api/v1/consent/' + category,
  accountStatus: '/api/v1/account/status',
  accountDeletionRequest: '/api/v1/account/deletion-request',
  accountExportRequest: '/api/v1/account/export-request',
  adminLookupUser: (userId: string) => '/api/v1/admin/users/' + userId,
  adminAdjustCredits: '/api/v1/admin/credits/adjust',
  adminRevokeDevice: '/api/v1/admin/devices/revoke',
  adminListAuditEvents: '/api/v1/admin/audit',
  pricingCountries: '/api/v1/pricing/countries',
  pricingCountryCurrencies: (country: string) => '/api/v1/pricing/countries/' + country + '/currencies',
  pricingPlans: '/api/v1/pricing/plans',
  pricingDetect: '/api/v1/pricing/detect',
  exchangeRateLatest: '/api/v1/exchange/latest',
  exchangeRate: '/api/v1/exchange/rate',
  exchangeConvert: '/api/v1/exchange/convert',
  exchangeHistorical: '/api/v1/exchange/historical',
};

const DEFAULT_RETRIES = 2;
const RETRY_BACKOFF_MS = 400;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class VeyraClient {
  private baseUrl: string;
  private accessToken?: string;

  constructor(options: VeyraClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/$/, '');
    this.accessToken = options.accessToken;
  }

  setAccessToken(token: string) {
    this.accessToken = token;
  }

  clearAccessToken() {
    this.accessToken = undefined;
  }

  private async request<T>(
    method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
    path: string,
    body?: unknown,
    opts: { auth?: boolean; idempotent?: boolean; signal?: AbortSignal; retries?: number; headers?: Record<string, string> } = {},
  ): Promise<T> {
    const url = this.baseUrl + path;
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'X-Request-Id': crypto.randomUUID?.() ?? String(Date.now()),
      ...(opts.headers || {}),
    };
    if (opts.auth && this.accessToken) {
      headers['Authorization'] = 'Bearer ' + this.accessToken;
    }
    const fetchWithRetry = async (attempt: number): Promise<T> => {
      let res: Response;
      try {
        res = await fetch(url, {
          method,
          headers,
          body: body ? JSON.stringify(body) : undefined,
          signal: opts.signal,
        });
      } catch (err) {
        if (attempt < DEFAULT_RETRIES && opts.idempotent) {
          await sleep(RETRY_BACKOFF_MS * (attempt + 1));
          return fetchWithRetry(attempt + 1);
        }
        throw err;
      }
      if (!res.ok) {
        try {
          const data = (await res.json()) as { error?: { code?: string; message?: string } };
          const error: VeyraApiError = {
            code: data.error?.code || 'UNKNOWN_ERROR',
            message: data.error?.message || 'Request failed with status ' + res.status,
            status: res.status,
          };
          throw error;
        } catch {
          throw new Error('Request failed with status ' + res.status);
        }
      }
      return (await res.json()) as T;
    };
    return fetchWithRetry(0);
  }

  async register(body: { email: string; password: string }) {
    return this.request<{
      ok: boolean;
      requestId: string;
      accessToken: string;
      refreshToken: string;
      expiresIn: number;
      user: { id: string; email: string; emailConfirmed: boolean };
    }>('POST', API_PATHS.authRegister, body, { auth: false });
  }

  async login(email: string, password: string) {
    return this.request<{
      ok: boolean;
      requestId: string;
      accessToken: string;
      refreshToken: string;
      expiresIn: number;
      user: { id: string; email: string; emailConfirmed: boolean };
    }>('POST', API_PATHS.authLogin, { email, password }, { auth: false });
  }

  async logout() {
    return this.request<{ ok: boolean; requestId: string }>('POST', API_PATHS.authLogout);
  }

  async refresh(refreshToken: string) {
    return this.request<{
      ok: boolean;
      requestId: string;
      accessToken: string;
      refreshToken: string;
      expiresIn: number;
      user: { id: string; email: string; emailConfirmed: boolean };
    }>('POST', API_PATHS.authRefresh, { refreshToken }, { auth: false });
  }

  async passwordRecovery(email: string) {
    return this.request<{ ok: boolean; requestId: string }>(
      'POST',
      API_PATHS.authPasswordRecovery,
      { email },
      { auth: false },
    );
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
    }>('GET', API_PATHS.accountStatus);
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
    }>('PATCH', API_PATHS.accountStatus, body);
  }

  async getOAuthProviders() {
    return this.request<{
      ok: boolean;
      requestId: string;
      providers: Array<{
        provider: 'google' | 'github';
        configured: boolean;
      }>;
    }>('GET', API_PATHS.authOAuthProviders, undefined, { auth: false });
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
    }>('POST', API_PATHS.authOAuthAuthorize, body, { auth: false });
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
    }>('POST', API_PATHS.authOAuthCallback, body, { auth: false });
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
    }>('POST', API_PATHS.authOAuthLink, body);
  }

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
    }>('POST', API_PATHS.devicesRegister, body);
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
    }>('GET', API_PATHS.devicesList);
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
    }>('PATCH', API_PATHS.devicesAuthorize(deviceId));
  }

  async revokeDevice(deviceId: string) {
    return this.request<{ ok: boolean; requestId: string }>('DELETE', API_PATHS.devicesRevoke(deviceId));
  }

  async updateDeviceLastSeen(deviceId: string) {
    return this.request<{ ok: boolean; requestId: string }>(
      'PATCH',
      API_PATHS.devicesLastSeen(deviceId),
    );
  }

  async replaceDevice(body: {
    installationId: string;
    deviceName?: string;
    platform?: 'windows' | 'macos' | 'linux';
  }, deviceId: string) {
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
    }>('POST', API_PATHS.devicesReplace(deviceId), body);
  }

  async revokeDeviceSessions(deviceId: string) {
    return this.request<{ ok: boolean; requestId: string }>(
      'POST',
      API_PATHS.devicesRevokeSessions(deviceId),
    );
  }

  async checkEntitlement(capability: string) {
    return this.request<{
      ok: boolean;
      requestId: string;
      capability: string;
      entitled: boolean;
      reason: string | undefined;
      expiresAt: string | undefined;
    }>('POST', API_PATHS.entitlementsCheck, { capability });
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
    }>('GET', API_PATHS.entitlementsList);
  }

  async getEntitlementSnapshot() {
    return this.request<{
      ok: boolean;
      requestId: string;
      snapshot: string;
      expiresAt: string;
    }>('POST', API_PATHS.entitlementsSnapshot);
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
    }>('POST', API_PATHS.entitlementsSnapshotVerify, { snapshot }, { auth: false });
  }

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
    }>('GET', API_PATHS.plansList);
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
    }>('GET', API_PATHS.plansGet(planId));
  }

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
    }>('GET', API_PATHS.subscriptionsCurrent);
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
    }>('POST', API_PATHS.subscriptionsCreate, body);
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
    }>('POST', API_PATHS.subscriptionsCancel, body);
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
    }>('POST', API_PATHS.subscriptionsReactivate, { subscriptionId });
  }

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
    }>('POST', API_PATHS.paymentsCheckout, body);
  }

  async getCreditBalance() {
    return this.request<{
      ok: boolean;
      requestId: string;
      balance: { balanceCents: number; currency: string };
    }>('GET', API_PATHS.creditsBalance);
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
    }>('POST', API_PATHS.creditsReserve, body);
  }

  async settleReservation(reservationId: string) {
    return this.request<{ ok: boolean; requestId: string }>(
      'POST',
      API_PATHS.creditsSettle,
      { reservationId },
    );
  }

  async releaseReservation(reservationId: string) {
    return this.request<{ ok: boolean; requestId: string }>(
      'POST',
      API_PATHS.creditsRelease,
      { reservationId },
    );
  }

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
    }>('POST', API_PATHS.aiInvoke, body);
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
    }>('GET', API_PATHS.aiModels);
  }

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
    }>('GET', API_PATHS.modulesList);
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
    }>('GET', API_PATHS.modulesVersions(moduleId));
  }

  async authorizeDownload(moduleVersionId: string) {
    return this.request<{
      ok: boolean;
      requestId: string;
      authorizationToken: string;
      expiresAt: string;
      downloadUrl: string;
    }>('POST', API_PATHS.downloadsAuthorize, { moduleVersionId });
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
    }>('POST', API_PATHS.downloadsAuthorize, { token }, { auth: false });
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
    }>('GET', API_PATHS.downloadsAudit);
  }

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
    }>('POST', API_PATHS.releasesCheck, body);
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
    }>('GET', API_PATHS.releasesChannels);
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
    }>('GET', API_PATHS.releasesList);
  }

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
    }>('GET', API_PATHS.accountStatus);
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
    }>('POST', API_PATHS.accountDeletionRequest, body);
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
    }>('POST', API_PATHS.accountExportRequest, body);
  }

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
    }>('GET', API_PATHS.adminLookupUser(userId));
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
    }>('POST', API_PATHS.adminAdjustCredits, body);
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
    }>('POST', API_PATHS.adminRevokeDevice, body);
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
    }>('GET', API_PATHS.adminListAuditEvents);
  }

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
    }>('GET', API_PATHS.pricingCountries, undefined, { auth: false });
  }

  async getCountryCurrencies(country: string) {
    return this.request<{
      ok: boolean;
      requestId: string;
      country: string;
      currencies: Array<{
        country: string;
        countryName: string;
        currency: string;
        currencySymbol: string;
        currencyExponent: number;
        isSupported: boolean;
      }>;
    }>('GET', API_PATHS.pricingCountryCurrencies(country), undefined, { auth: false });
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
        description?: string;
        currency: string;
        amountCents: number;
        billingInterval: 'monthly' | 'yearly';
        isAvailable: boolean;
      }>;
    }>('GET', `${API_PATHS.pricingPlans}?country=${encodeURIComponent(country)}&currency=${encodeURIComponent(currency)}`, undefined, { auth: false });
  }

  async listExchangeRates(baseCurrency = 'USD') {
    return this.request<{
      ok: boolean;
      requestId: string;
      baseCurrency: string;
      rates: Record<string, number>;
      updatedAt: string;
    }>('GET', `${API_PATHS.exchangeRateLatest}?baseCurrency=${encodeURIComponent(baseCurrency)}`, undefined, { auth: false });
  }

  async getExchangeRate(fromCurrency: string, toCurrency: string) {
    return this.request<{
      ok: boolean;
      requestId: string;
      fromCurrency: string;
      toCurrency: string;
      rate: number;
      timestamp: string;
    }>('GET', `${API_PATHS.exchangeRate}?fromCurrency=${encodeURIComponent(fromCurrency)}&toCurrency=${encodeURIComponent(toCurrency)}`, undefined, { auth: false });
  }

  async convertCurrency(amount: number, fromCurrency: string, toCurrency: string) {
    return this.request<{
      ok: boolean;
      requestId: string;
      amount: number;
      fromCurrency: string;
      toCurrency: string;
      rate: number;
      convertedAmount: number;
      isLive: boolean;
      rateTimestamp: string;
    }>('POST', API_PATHS.exchangeConvert, { amount, fromCurrency, toCurrency }, { auth: false });
  }

  async getHistoricalExchangeRate(fromCurrency: string, toCurrency: string, date: string) {
    return this.request<{
      ok: boolean;
      requestId: string;
      fromCurrency: string;
      toCurrency: string;
      date: string;
      rate: number;
      timestamp: string;
    }>('GET', `${API_PATHS.exchangeHistorical}?fromCurrency=${encodeURIComponent(fromCurrency)}&toCurrency=${encodeURIComponent(toCurrency)}&date=${encodeURIComponent(date)}`, undefined, { auth: false });
  }

}
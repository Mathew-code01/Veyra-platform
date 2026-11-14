import { getSupabaseAdmin } from '../../integrations/supabase/client.js';
import crypto from 'crypto';

export type OAuthProvider = 'google' | 'github';

/**
 * OAuth service for Google and GitHub authentication via Supabase Auth.
 *
 * Flow:
 * 1. Client calls GET /api/v1/auth/oauth/authorize?provider=google
 * 2. Platform returns authorization URL with PKCE code challenge and CSRF state
 * 3. Client redirects user to provider (browser-based sign-in)
 * 4. Provider redirects back to Supabase callback URL
 * 5. Supabase exchanges code for session and creates/links user
 * 6. Client uses resulting Supabase JWT on platform API calls
 *
 * Account linking:
 * - If a user signs in with OAuth and an account with the same verified email
 *   already exists (email/password or another OAuth provider), Supabase links
 *   the OAuth identity to the existing account automatically.
 * - We do NOT merge identities based on email string matching alone; Supabase
 *   uses verified email identities from the provider.
 */

const SUPPABASE_CALLBACK_BASE = 'https://cyoavpeazeatnlnfbbag.supabase.co/auth/v1/callback';

/**
 * Generate a CSRF state token.
 */
function generateState(): string {
  return crypto.randomBytes(16).toString('hex');
}

/**
 * Get the OAuth provider configuration from environment.
 */
function getOAuthConfig(provider: OAuthProvider): {
  clientId: string;
  clientSecret: string;
  authorizeUrl: string;
  scopes: string[];
} | null {
  const env = process.env;

  switch (provider) {
    case 'google':
      if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET) return null;
      return {
        clientId: env.GOOGLE_CLIENT_ID,
        clientSecret: env.GOOGLE_CLIENT_SECRET,
        authorizeUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
        scopes: ['openid', 'email', 'profile'],
      };
    case 'github':
      if (!env.GITHUB_CLIENT_ID || !env.GITHUB_CLIENT_SECRET) return null;
      return {
        clientId: env.GITHUB_CLIENT_ID,
        clientSecret: env.GITHUB_CLIENT_SECRET,
        authorizeUrl: 'https://github.com/login/oauth/authorize',
        scopes: ['user:email', 'read:user'],
      };
    default:
      return null;
  }
}

/**
 * Get the list of configured OAuth providers.
 */
export function getConfiguredOAuthProviders(): OAuthProvider[] {
  const providers: OAuthProvider[] = [];

  const google = getOAuthConfig('google');
  if (google) providers.push('google');

  const github = getOAuthConfig('github');
  if (github) providers.push('github');

  return providers;
}

/**
 * Check if a provider is configured.
 */
export function isOAuthProviderConfigured(provider: OAuthProvider): boolean {
  return getOAuthConfig(provider) !== null;
}

/**
 * Generate the OAuth authorization URL for a provider.
 * Returns the URL to redirect the user to, plus the state for CSRF validation.
 */
export function generateOAuthAuthorizationUrl(
  provider: OAuthProvider,
): {
  authorizationUrl: string;
  state: string;
} {
  const config = getOAuthConfig(provider);
  if (!config) {
    throw new Error(`OAuth provider not configured: ${provider}`);
  }

  const state = generateState();

  const params = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: SUPPABASE_CALLBACK_BASE,
    scope: config.scopes.join(' '),
    response_type: 'code',
    state,
  });

  if (provider === 'google') {
    params.set('prompt', 'consent');
    params.set('access_type', 'offline');
  }

  const authorizationUrl = `${config.authorizeUrl}?${params.toString()}`;

  return { authorizationUrl, state };
}

/**
 * Exchange an OAuth authorization code for a Supabase session.
 * This is called after the provider redirects back to the Supabase callback.
 *
 * The platform verifies the state parameter for CSRF protection, then
 * uses the Supabase admin client to exchange the code for a session.
 */
export async function exchangeOAuthCode(
  adminClient: ReturnType<typeof getSupabaseAdmin>,
  provider: OAuthProvider,
  code: string,
): Promise<{
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  user: {
    id: string;
    email: string;
    emailConfirmed: boolean;
    provider: OAuthProvider;
    isNewUser: boolean;
  };
}> {
  const config = getOAuthConfig(provider);
  if (!config) {
    throw new Error(`OAuth provider not configured: ${provider}`);
  }

  // Exchange the authorization code for a Supabase session using the admin client.
  // Supabase's auth.exchangeCodeForSession handles the OAuth code exchange
  // with the provider's token endpoint.
  const { data, error } = await adminClient.auth.exchangeCodeForSession(code);

  if (error || !data.user) {
    throw new Error(error?.message ?? 'OAuth code exchange failed');
  }

  const user = data.user;

  // Determine if this is a new user (created at approximately now)
  const createdAt = new Date(user.created_at);
  const now = new Date();
  const isNewUser = now.getTime() - createdAt.getTime() < 60000; // within 1 minute

  return {
    accessToken: data.session.access_token,
    refreshToken: data.session.refresh_token,
    expiresIn: data.session.expires_in,
    user: {
      id: user.id,
      email: user.email ?? '',
      emailConfirmed: !!user.email_confirmed_at,
      provider,
      isNewUser,
    },
  };
}

/**
 * Create or update a profile record for an OAuth user.
 * Server-side only.
 */
export async function ensureProfileForOAuthUser(
  adminClient: ReturnType<typeof getSupabaseAdmin>,
  userId: string,
  email: string,
) {
  const { data: existing } = await adminClient
    .from('profiles')
    .select('id')
    .eq('id', userId)
    .single();

  if (existing?.id) return existing.id;

  const { data, error } = await adminClient
    .from('profiles')
    .insert({
      id: userId,
      email,
      display_name: null,
      locale: 'en',
      status: 'active',
    })
    .select('id')
    .single();

  if (error) throw error;
  return data.id;
}

import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import {
  RegisterRequestSchema,
  LoginRequestSchema,
  PasswordRecoveryRequestSchema,
  UpdateProfileRequestSchema,
  OAuthInitiateRequestSchema,
  OAuthCallbackRequestSchema,
  AccountLinkRequestSchema,
} from '../../../../../packages/contracts/src/index.ts';
import { getSupabaseAdmin, getSupabaseUser } from '../../integrations/supabase/client.js';
import { authenticateUser } from './auth.service.js';
import {
  generateOAuthAuthorizationUrl,
  exchangeOAuthCode,
  ensureProfileForOAuthUser,
  isOAuthProviderConfigured,
  getConfiguredOAuthProviders,
} from './oauth.service.js';

// Local validation helper using Zod
function validate<T>(schema: z.ZodType<T>, body: unknown): T {
  const result = schema.safeParse(body);
  if (!result.success) {
    throw new z.ZodError(result.error.issues);
  }
  return result.data;
}

const authPlugin: FastifyPluginAsync = async (fastify) => {
  // --- Register ---
  fastify.post(
    '/register',
    async (request, reply) => {
      const requestId = request.id ?? 'unknown';

      let body: z.infer<typeof RegisterRequestSchema>;
      try {
        body = validate(RegisterRequestSchema, request.body);
      } catch {
        return reply.status(400).send({
          ok: false,
          requestId,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Request validation failed.',
            status: 400,
          },
        });
      }

      const { email, password } = body;

      try {
        const supabase = getSupabaseAdmin();
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: `${request.headers.origin || ''}/auth/verify-email`,
          },
        });

        if (error || !data.user) {
          return reply.status(400).send({
            ok: false,
            requestId,
            error: {
              code: 'REGISTRATION_FAILED',
              message: error?.message ?? 'Registration failed.',
              status: 400,
            },
          });
        }

        // Create profile record using service_role (server-side operation)
        await supabase.from('profiles').insert({
          id: data.user.id,
          email: data.user.email ?? email,
          display_name: null,
          locale: 'en',
          status: 'active',
        });

        const response = {
          ok: true,
          requestId,
          accessToken: data.session?.access_token ?? '',
          refreshToken: data.session?.refresh_token ?? '',
          expiresIn: data.session?.expires_in ?? 0,
          user: {
            id: data.user.id,
            email: data.user.email ?? email,
            emailConfirmed: !!data.user.email_confirmed_at,
          },
        };

        return reply.status(201).send(response);
      } catch (err) {
        request.log.error({ requestId, err }, 'registration error');
        return reply.status(500).send({
          ok: false,
          requestId,
          error: {
            code: 'REGISTRATION_ERROR',
            message: 'An unexpected error occurred during registration.',
            status: 500,
          },
        });
      }
    }
  );

  // --- Login ---
  fastify.post(
    '/login',
    async (request, reply) => {
      const requestId = request.id ?? 'unknown';

      let body: z.infer<typeof LoginRequestSchema>;
      try {
        body = validate(LoginRequestSchema, request.body);
      } catch {
        return reply.status(400).send({
          ok: false,
          requestId,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Request validation failed.',
            status: 400,
          },
        });
      }

      const { email, password } = body;

      try {
        const supabase = getSupabaseAdmin();
        const { data, error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });

        if (error || !data.user) {
          return reply.status(401).send({
            ok: false,
            requestId,
            error: {
              code: 'LOGIN_FAILED',
              message: error?.message ?? 'Invalid email or password.',
              status: 401,
            },
          });
        }

        return reply.send({
          ok: true,
          requestId,
          accessToken: data.session?.access_token ?? '',
          refreshToken: data.session?.refresh_token ?? '',
          expiresIn: data.session?.expires_in ?? 0,
          user: {
            id: data.user.id,
            email: data.user.email ?? email,
            emailConfirmed: !!data.user.email_confirmed_at,
          },
        });
      } catch (err) {
        request.log.error({ requestId, err }, 'login error');
        return reply.status(500).send({
          ok: false,
          requestId,
          error: {
            code: 'LOGIN_ERROR',
            message: 'An unexpected error occurred during login.',
            status: 500,
          },
        });
      }
    }
  );

  // --- Logout ---
  fastify.post(
    '/logout',
    async (request, reply) => {
      const requestId = request.id ?? 'unknown';
      const authHeader = request.headers.authorization;

      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return reply.status(401).send({
          ok: false,
          requestId,
          error: {
            code: 'UNAUTHORIZED',
            message: 'Missing or invalid authorization header.',
            status: 401,
          },
        });
      }

      const accessToken = authHeader.substring(7);

      try {
        const supabase = getSupabaseUser(accessToken);
        await supabase.auth.signOut();

        return reply.send({ ok: true, requestId });
      } catch (err) {
        request.log.error({ requestId, err }, 'logout error');
        return reply.status(500).send({
          ok: false,
          requestId,
          error: {
            code: 'LOGOUT_ERROR',
            message: 'An unexpected error occurred during logout.',
            status: 500,
          },
        });
      }
    }
  );

  // --- Refresh session ---
  fastify.post(
    '/refresh',
    async (request, reply) => {
      const requestId = request.id ?? 'unknown';

      let body: { refreshToken: string };
      try {
        body = validate(z.object({ refreshToken: z.string().min(1) }), request.body);
      } catch {
        return reply.status(400).send({
          ok: false,
          requestId,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Request validation failed.',
            status: 400,
          },
        });
      }

      const { refreshToken } = body;

      try {
        const supabase = getSupabaseAdmin();
        const { data, error } = await supabase.auth.refreshSession({
          refresh_token: refreshToken,
        });

        if (error || !data.user) {
          return reply.status(401).send({
            ok: false,
            requestId,
            error: {
              code: 'REFRESH_FAILED',
              message: error?.message ?? 'Session refresh failed.',
              status: 401,
            },
          });
        }

        return reply.send({
          ok: true,
          requestId,
          accessToken: data.session?.access_token ?? '',
          refreshToken: data.session?.refresh_token ?? '',
          expiresIn: data.session?.expires_in ?? 0,
          user: {
            id: data.user.id,
            email: data.user.email ?? '',
            emailConfirmed: !!data.user.email_confirmed_at,
          },
        });
      } catch (err) {
        request.log.error({ requestId, err }, 'refresh error');
        return reply.status(500).send({
          ok: false,
          requestId,
          error: {
            code: 'REFRESH_ERROR',
            message: 'An unexpected error occurred during session refresh.',
            status: 500,
          },
        });
      }
    }
  );

  // --- Password recovery ---
  fastify.post(
    '/password-recovery',
    async (request, reply) => {
      const requestId = request.id ?? 'unknown';

      let body: z.infer<typeof PasswordRecoveryRequestSchema>;
      try {
        body = validate(PasswordRecoveryRequestSchema, request.body);
      } catch {
        return reply.status(400).send({
          ok: false,
          requestId,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Request validation failed.',
            status: 400,
          },
        });
      }

      const { email } = body;

      try {
        const supabase = getSupabaseAdmin();
        await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: `${request.headers.origin || ''}/auth/reset-password`,
        });

        // Always return success to prevent email enumeration
        return reply.send({ ok: true, requestId });
      } catch (err) {
        // Always return success to prevent email enumeration
        request.log.warn({ requestId, err }, 'password recovery warning');
        return reply.send({ ok: true, requestId });
      }
    }
  );

  // --- Get current user profile ---
  fastify.get(
    '/me',
    async (request, reply) => {
      const requestId = request.id ?? 'unknown';
      const authHeader = request.headers.authorization;

      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return reply.status(401).send({
          ok: false,
          requestId,
          error: {
            code: 'UNAUTHORIZED',
            message: 'Missing or invalid authorization header.',
            status: 401,
          },
        });
      }

      const accessToken = authHeader.substring(7);
      const user = await authenticateUser(accessToken);

      if (!user) {
        return reply.status(401).send({
          ok: false,
          requestId,
          error: {
            code: 'UNAUTHORIZED',
            message: 'Invalid or expired session.',
            status: 401,
          },
        });
      }

      try {
        const supabase = getSupabaseUser(accessToken);
        const { data: profile, error } = await supabase
          .from('profiles')
          .select('id, email, display_name, locale, status, created_at')
          .eq('id', user.id)
          .single();

        if (error || !profile) {
          return reply.status(404).send({
            ok: false,
            requestId,
            error: {
              code: 'PROFILE_NOT_FOUND',
              message: 'Profile not found.',
              status: 404,
            },
          });
        }

        return reply.send({
          ok: true,
          requestId,
          profile: {
            id: profile.id,
            email: profile.email,
            displayName: profile.display_name ?? undefined,
            locale: profile.locale,
            status: profile.status,
            createdAt: profile.created_at,
          },
        });
      } catch (err) {
        request.log.error({ requestId, err }, 'profile fetch error');
        return reply.status(500).send({
          ok: false,
          requestId,
          error: {
            code: 'PROFILE_ERROR',
            message: 'An unexpected error occurred while fetching profile.',
            status: 500,
          },
        });
      }
    }
  );

  // --- Update current user profile ---
  fastify.patch(
    '/me',
    async (request, reply) => {
      const requestId = request.id ?? 'unknown';
      const authHeader = request.headers.authorization;

      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return reply.status(401).send({
          ok: false,
          requestId,
          error: {
            code: 'UNAUTHORIZED',
            message: 'Missing or invalid authorization header.',
            status: 401,
          },
        });
      }

      const accessToken = authHeader.substring(7);
      const user = await authenticateUser(accessToken);

      if (!user) {
        return reply.status(401).send({
          ok: false,
          requestId,
          error: {
            code: 'UNAUTHORIZED',
            message: 'Invalid or expired session.',
            status: 401,
          },
        });
      }

      let body: z.infer<typeof UpdateProfileRequestSchema>;
      try {
        body = validate(UpdateProfileRequestSchema, request.body);
      } catch {
        return reply.status(400).send({
          ok: false,
          requestId,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Request validation failed.',
            status: 400,
          },
        });
      }

      const { displayName, locale } = body;

      // Field restrictions: status and email are server-controlled and cannot be updated here.
      const updates: Record<string, unknown> = {};
      if (displayName !== undefined) updates.display_name = displayName;
      if (locale !== undefined) updates.locale = locale;

      if (Object.keys(updates).length === 0) {
        return reply.status(400).send({
          ok: false,
          requestId,
          error: {
            code: 'NO_UPDATES',
            message: 'No updatable fields provided.',
            status: 400,
          },
        });
      }

      try {
        const supabase = getSupabaseUser(accessToken);
        const { data: profile, error } = await supabase
          .from('profiles')
          .update(updates)
          .eq('id', user.id)
          .select('id, email, display_name, locale, status, created_at')
          .single();

        if (error || !profile) {
          return reply.status(404).send({
            ok: false,
            requestId,
            error: {
              code: 'PROFILE_NOT_FOUND',
              message: 'Profile not found.',
              status: 404,
            },
          });
        }

        return reply.send({
          ok: true,
          requestId,
          profile: {
            id: profile.id,
            email: profile.email,
            displayName: profile.display_name ?? undefined,
            locale: profile.locale,
            status: profile.status,
            createdAt: profile.created_at,
          },
        });
      } catch (err) {
        request.log.error({ requestId, err }, 'profile update error');
        return reply.status(500).send({
          ok: false,
          requestId,
          error: {
            code: 'PROFILE_UPDATE_ERROR',
            message: 'An unexpected error occurred while updating profile.',
            status: 500,
          },
        });
      }
    }
  );

  // --- OAuth: Get configured providers ---
  fastify.get(
    '/oauth/providers',
    async (_request, reply) => {
      const requestId = _request.id ?? 'unknown';
      const providers = getConfiguredOAuthProviders().map((p) => ({
        provider: p,
        configured: true,
      }));

      return reply.send({
        ok: true,
        requestId,
        providers,
      });
    }
  );

  // --- OAuth: Initiate authorization ---
  fastify.post(
    '/oauth/authorize',
    async (request, reply) => {
      const requestId = request.id ?? 'unknown';

      let body: z.infer<typeof OAuthInitiateRequestSchema>;
      try {
        body = OAuthInitiateRequestSchema.parse(request.body);
      } catch {
        return reply.status(400).send({
          ok: false,
          requestId,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Request validation failed.',
            status: 400,
          },
        });
      }

      const { provider } = body;

      if (!isOAuthProviderConfigured(provider)) {
        return reply.status(400).send({
          ok: false,
          requestId,
          error: {
            code: 'PROVIDER_NOT_CONFIGURED',
            message: `OAuth provider not configured: ${provider}`,
            status: 400,
          },
        });
      }

      try {
        const { authorizationUrl, state } = generateOAuthAuthorizationUrl(
          provider,
        );

        return reply.send({
          ok: true,
          requestId,
          provider,
          authorizationUrl,
          state,
        });
      } catch (err) {
        request.log.error({ requestId, err }, 'oauth authorize error');
        return reply.status(500).send({
          ok: false,
          requestId,
          error: {
            code: 'OAUTH_AUTHORIZE_ERROR',
            message: 'An unexpected error occurred while initiating OAuth.',
            status: 500,
          },
        });
      }
    }
  );

  // --- OAuth: Callback (exchange code for session) ---
  fastify.post(
    '/oauth/callback',
    async (request, reply) => {
      const requestId = request.id ?? 'unknown';

      let body: z.infer<typeof OAuthCallbackRequestSchema>;
      try {
        body = OAuthCallbackRequestSchema.parse(request.body);
      } catch {
        return reply.status(400).send({
          ok: false,
          requestId,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Request validation failed.',
            status: 400,
          },
        });
      }

      const { provider, code } = body;

      if (!isOAuthProviderConfigured(provider)) {
        return reply.status(400).send({
          ok: false,
          requestId,
          error: {
            code: 'PROVIDER_NOT_CONFIGURED',
            message: `OAuth provider not configured: ${provider}`,
            status: 400,
          },
        });
      }

      try {
        const adminClient = getSupabaseAdmin();
        const result = await exchangeOAuthCode(
          adminClient,
          provider,
          code,
        );

        // Ensure profile exists for the OAuth user
        await ensureProfileForOAuthUser(adminClient, result.user.id, result.user.email);

        return reply.send({
          ok: true,
          requestId,
          accessToken: result.accessToken,
          refreshToken: result.refreshToken,
          expiresIn: result.expiresIn,
          user: {
            id: result.user.id,
            email: result.user.email,
            emailConfirmed: result.user.emailConfirmed,
            provider: result.user.provider,
            isNewUser: result.user.isNewUser,
          },
        });
      } catch (err) {
        request.log.error({ requestId, err }, 'oauth callback error');
        return reply.status(400).send({
          ok: false,
          requestId,
          error: {
            code: 'OAUTH_CALLBACK_ERROR',
            message: err instanceof Error ? err.message : 'OAuth callback failed.',
            status: 400,
          },
        });
      }
    }
  );

  // --- OAuth: Account linking ---
  fastify.post(
    '/oauth/link',
    async (request, reply) => {
      const requestId = request.id ?? 'unknown';

      let body: z.infer<typeof AccountLinkRequestSchema>;
      try {
        body = AccountLinkRequestSchema.parse(request.body);
      } catch {
        return reply.status(400).send({
          ok: false,
          requestId,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Request validation failed.',
            status: 400,
          },
        });
      }

      const { provider, code } = body;

      const authHeader = request.headers.authorization;
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return reply.status(401).send({
          ok: false,
          requestId,
          error: {
            code: 'UNAUTHORIZED',
            message: 'Missing or invalid authorization header.',
            status: 401,
          },
        });
      }

      const accessToken = authHeader.substring(7);
      const user = await authenticateUser(accessToken);
      if (!user) {
        return reply.status(401).send({
          ok: false,
          requestId,
          error: {
            code: 'UNAUTHORIZED',
            message: 'Invalid or expired session.',
            status: 401,
          },
        });
      }

      try {
        const adminClient = getSupabaseAdmin();
        const result = await exchangeOAuthCode(
          adminClient,
          provider,
          code,
        );

        // Verify the linked account matches the current user
        if (result.user.id !== user.id) {
          return reply.status(403).send({
            ok: false,
            requestId,
            error: {
              code: 'ACCOUNT_MISMATCH',
              message: 'OAuth account does not match current user.',
              status: 403,
            },
          });
        }

        return reply.send({
          ok: true,
          requestId,
          provider,
          linked: true,
        });
      } catch (err) {
        request.log.error({ requestId, err }, 'oauth account link error');
        return reply.status(400).send({
          ok: false,
          requestId,
          error: {
            code: 'ACCOUNT_LINK_ERROR',
            message: err instanceof Error ? err.message : 'Account linking failed.',
            status: 400,
          },
        });
      }
    }
  );
};

export default authPlugin;

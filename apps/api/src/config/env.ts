import { z } from 'zod';

export const EnvSchema = z.object({
  NODE_ENV: z
    .enum(['development', 'test', 'production'])
    .default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  API_BASE_URL: z.string().url().default('http://localhost:3000'),
  API_VERSION: z.string().default('v1'),
  REQUEST_ID_HEADER: z.string().default('X-Request-Id'),
  ALLOWED_ORIGINS: z.string().default('http://localhost:3000'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),

  // Supabase (optional until Phase 2)
  SUPABASE_URL: z.string().url().optional(),
  SUPABASE_ANON_KEY: z.string().min(1).optional(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1).optional(),
  DATABASE_URL: z.string().optional(),

  // Payments (Paystack)
  PAYMENT_PROVIDER: z.enum(['mock', 'paystack']).default('mock'),
  PAYSTACK_SECRET_KEY: z.string().optional(),
  PAYSTACK_PUBLIC_KEY: z.string().optional(),
  PAYSTACK_WEBHOOK_SECRET: z.string().optional(),
  PAYMENTS_MODE: z.enum(['test', 'live']).default('test'),
  PAYMENTS_LIVE_ENABLED: z.enum(['true', 'false']).default('false'),

  // OAuth (Google / GitHub)
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  GITHUB_CLIENT_ID: z.string().optional(),
  GITHUB_CLIENT_SECRET: z.string().optional(),
  OAUTH_REDIRECT_BASE_URL: z.string().url().optional(),

  // Email (mock until provider configured)
  EMAIL_PROVIDER: z.enum(['mock', 'smtp']).default('mock'),

  // Storage (mock until provider configured)
  STORAGE_PROVIDER: z.enum(['mock', 'r2']).default('mock'),

  // Update signing (Phase 9)
  UPDATE_SIGNING_KEY: z.string().optional(),
});

export type Env = z.infer<typeof EnvSchema>;

let cachedEnv: Env | null = null;

/**
 * Validate and load environment variables at startup.
 * Throws a clear, actionable error if required variables are missing or invalid.
 * Never returns secrets to callers beyond what Env exposes.
 */
export function loadEnv(): Env {
  if (cachedEnv) return cachedEnv;

  const input = { ...process.env };
  const result = EnvSchema.safeParse(input);

  if (!result.success) {
    const missing = result.error.issues
      .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
      .join('\n  - ');
    throw new Error(
      `[veyra-platform] Invalid environment configuration:\n  - ${missing}\n\n` +
        'Copy .env.example to .env and fill in the required values. ' +
        'Never commit .env or paste production secrets into source code.',
    );
  }

  cachedEnv = result.data;
  return cachedEnv;
}

export function getEnv(): Env {
  if (!cachedEnv) {
    throw new Error(
      '[veyra-platform] Environment has not been loaded. Call loadEnv() at startup before accessing config.',
    );
  }
  return cachedEnv;
}

/**
 * Reset the cached environment. Test-only helper so each test can load a fresh
 * environment via loadEnv().
 */
export function resetEnv(): void {
  cachedEnv = null;
}

export function isProduction(): boolean {
  return getEnv().NODE_ENV === 'production';
}

export function isDevelopment(): boolean {
  return getEnv().NODE_ENV === 'development';
}

export function isTest(): boolean {
  return getEnv().NODE_ENV === 'test';
}

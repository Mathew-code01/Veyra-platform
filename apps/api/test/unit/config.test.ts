import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { EnvSchema, resetEnv } from '../../src/config/env';

let originalEnv: Record<string, string | undefined>;

beforeAll(() => {
  originalEnv = { ...process.env };
});

beforeEach(() => {
  resetEnv();
  process.env = { ...originalEnv };
  process.env.NODE_ENV = 'development';
  process.env.PORT = '3000';
});

describe('EnvSchema validation', () => {
  it('accepts a minimal valid environment', () => {
    const result = EnvSchema.safeParse(process.env);
    expect(result.success).toBe(true);
  });

  it('rejects invalid NODE_ENV', () => {
    process.env.NODE_ENV = 'staging';
    const result = EnvSchema.safeParse(process.env);
    expect(result.success).toBe(false);
    if (!result.success) {
      const paths = result.error.issues.map((i) => i.path.join('.'));
      expect(paths.some((p) => p.includes('NODE_ENV'))).toBe(true);
    }
  });

  it('rejects non-numeric PORT', () => {
    process.env.PORT = 'abc';
    const result = EnvSchema.safeParse(process.env);
    expect(result.success).toBe(false);
  });

  it('rejects non-url API_BASE_URL when provided', () => {
    process.env.API_BASE_URL = 'not-a-url';
    const result = EnvSchema.safeParse(process.env);
    expect(result.success).toBe(false);
  });

  it('allows optional supabase fields to be absent', () => {
    process.env.NODE_ENV = 'test';
    process.env.PORT = '3000';
    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_ANON_KEY;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    const result = EnvSchema.safeParse(process.env);
    expect(result.success).toBe(true);
  });
});

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  getSupabaseAdmin,
  getSupabaseUser,
  resetSupabaseClients,
} from '../../src/integrations/supabase/client.js';
import { EnvSchema, resetEnv, loadEnv } from '../../src/config/env.js';

const originalEnv = { ...process.env };

beforeEach(() => {
  resetEnv();
  resetSupabaseClients();
  process.env = { ...originalEnv };
  process.env.NODE_ENV = 'test';
  process.env.PORT = '3000';
});

afterEach(() => {
  process.env = originalEnv;
  resetSupabaseClients();
});

describe('Supabase client factory', () => {
  it('getSupabaseAdmin throws when SUPABASE_URL and service role key are absent', () => {
    loadEnv(); // defaults, no supabase vars
    expect(() => getSupabaseAdmin()).toThrow(/SUPABASE_SERVICE_ROLE_KEY/);
  });

  it('getSupabaseUser throws when SUPABASE_URL and anon key are absent', () => {
    loadEnv();
    expect(() => getSupabaseUser('some-token')).toThrow(/SUPABASE_ANON_KEY/);
  });

  it('getSupabaseAdmin creates a client when service role creds are present', () => {
    process.env.SUPABASE_URL = 'https://example.supabase.co';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-secret';
    loadEnv();
    const client = getSupabaseAdmin();
    expect(client).toBeDefined();
    // Same instance returned on repeat calls (cached)
    expect(getSupabaseAdmin()).toBe(client);
  });

  it('getSupabaseUser creates a client when anon key is present', () => {
    process.env.SUPABASE_URL = 'https://example.supabase.co';
    process.env.SUPABASE_ANON_KEY = 'anon-public-key';
    loadEnv();
    const client = getSupabaseUser('user-jwt');
    expect(client).toBeDefined();
  });

  it('admin client factory is distinct from user client factory', () => {
    process.env.SUPABASE_URL = 'https://example.supabase.co';
    process.env.SUPABASE_ANON_KEY = 'anon-public-key';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-secret';
    loadEnv();
    const admin = getSupabaseAdmin();
    const user = getSupabaseUser('user-jwt');
    expect(admin).not.toBe(user);
  });

  it('resetSupabaseClients clears cached admin client', () => {
    process.env.SUPABASE_URL = 'https://example.supabase.co';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-secret';
    loadEnv();
    const client = getSupabaseAdmin();
    resetSupabaseClients();
    const client2 = getSupabaseAdmin();
    expect(client2).not.toBe(client);
  });

  it('EnvSchema accepts optional supabase fields being absent', () => {
    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_ANON_KEY;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    const result = EnvSchema.safeParse(process.env);
    expect(result.success).toBe(true);
  });
});

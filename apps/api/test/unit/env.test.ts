import { describe, it, expect, beforeEach } from 'vitest';
import { EnvSchema, loadEnv, getEnv, resetEnv, isProduction, isDevelopment, isTest } from '../../src/config/env';

beforeEach(() => {
  resetEnv();
  process.env.NODE_ENV = 'development';
  process.env.PORT = '3000';
  process.env.PAYMENT_PROVIDER = 'mock';
});

describe('loadEnv', () => {
  it('loads valid environment variables with defaults', () => {
    const env = loadEnv();
    expect(env.NODE_ENV).toBe('development');
    expect(env.PORT).toBe(3000);
    expect(env.API_VERSION).toBe('v1');
    expect(env.PAYMENT_PROVIDER).toBe('mock');
    expect(env.EMAIL_PROVIDER).toBe('mock');
    expect(env.STORAGE_PROVIDER).toBe('mock');
  });

  it('caches the loaded environment', () => {
    const first = loadEnv();
    const second = loadEnv();
    expect(first).toBe(second);
  });

  it('throws a clear error when PORT is invalid', () => {
    process.env.PORT = 'not-a-number';
    expect(() => loadEnv()).toThrow(/Invalid environment configuration/);
  });

  it('throws a clear error when NODE_ENV is invalid', () => {
    process.env.NODE_ENV = 'not-an-env';
    expect(() => loadEnv()).toThrow(/Invalid environment configuration/);
  });

  it('getEnv throws before loadEnv is called', () => {
    resetEnv();
    expect(() => getEnv()).toThrow(/has not been loaded/);
  });

  it('isProduction/isDevelopment/isTest reflect NODE_ENV', () => {
    process.env.NODE_ENV = 'production';
    process.env.PAYMENT_PROVIDER = 'paystack';
    loadEnv();
    expect(isProduction()).toBe(true);
    expect(isDevelopment()).toBe(false);
    expect(isTest()).toBe(false);
  });

  it('rejects the mock payment provider in production', () => {
    process.env.NODE_ENV = 'production';
    process.env.PAYMENT_PROVIDER = 'mock';

    expect(() => loadEnv()).toThrow(/PAYMENT_PROVIDER=mock is not allowed in production/);
  });
});

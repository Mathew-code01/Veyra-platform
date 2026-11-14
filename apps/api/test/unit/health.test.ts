import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { buildApp } from '../../src/app';
import { loadEnv, resetEnv } from '../../src/config/env';

const originalEnv = { ...process.env };

beforeEach(() => {
  resetEnv();
  process.env = { ...originalEnv };
  process.env.NODE_ENV = 'test';
  process.env.PORT = '3013';
  loadEnv();
});

afterEach(() => {
  process.env = originalEnv;
  resetEnv();
});

describe('health routes', () => {
  it('GET /api/v1/health returns ok', async () => {
    const app = await buildApp();
    try {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/health',
      });
      expect(res.statusCode).toBe(200);
      const body = res.json() as { ok: boolean; status: string; requestId: string };
      expect(body.ok).toBe(true);
      expect(body.status).toBe('ok');
      expect(typeof body.requestId).toBe('string');
      expect(body.requestId.length).toBeGreaterThan(0);
    } finally {
      await app.close();
    }
  });

  it('GET /api/v1/ready returns ok', async () => {
    const app = await buildApp();
    try {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/ready',
      });
      expect(res.statusCode).toBe(200);
      const body = res.json() as { ok: boolean; status: string };
      expect(body.ok).toBe(true);
      expect(body.status).toBe('ok');
    } finally {
      await app.close();
    }
  });

  it('GET /api/v1/version returns version info', async () => {
    const app = await buildApp();
    try {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/version',
      });
      expect(res.statusCode).toBe(200);
      const body = res.json() as { ok: boolean; service: string; apiVersion: string };
      expect(body.ok).toBe(true);
      expect(body.service).toBe('veyra-platform');
      expect(body.apiVersion).toBe('v1');
    } finally {
      await app.close();
    }
  });

  it('unknown route returns 404 with requestId', async () => {
    const app = await buildApp();
    try {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/does-not-exist',
      });
      expect(res.statusCode).toBe(404);
      const body = res.json() as { ok: boolean; requestId: string; error: { code: string } };
      expect(body.ok).toBe(false);
      expect(body.error.code).toBe('NOT_FOUND');
      expect(typeof body.requestId).toBe('string');
    } finally {
      await app.close();
    }
  });

  it('echoes back a client-supplied request id', async () => {
    const app = await buildApp();
    try {
      const clientId = 'test-client-id-123';
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/health',
        headers: { 'x-request-id': clientId },
      });
      expect(res.statusCode).toBe(200);
      const body = res.json() as { requestId: string };
      expect(body.requestId).toBe(clientId);
    } finally {
      await app.close();
    }
  });
});

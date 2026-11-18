import Fastify from 'fastify';
import { createHash } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import desktopAuthPlugin from '../../src/modules/auth/desktop-auth.routes.js';

const mocks = vi.hoisted(() => ({ getSupabaseAdmin: vi.fn(), authenticateUser: vi.fn() }));
vi.mock('../../src/integrations/supabase/client.js', () => ({ getSupabaseAdmin: mocks.getSupabaseAdmin }));
vi.mock('../../src/modules/auth/auth.service.js', () => ({ authenticateUser: mocks.authenticateUser }));

async function createApp() {
  const app = Fastify({ logger: false });
  await app.register(desktopAuthPlugin, { prefix: '/api/v1/auth/desktop' });
  return app;
}

describe('Desktop browser-auth transaction security', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('rejects malformed transaction creation before database access', async () => {
    const app = await createApp();
    try {
      const response = await app.inject({ method: 'POST', url: '/api/v1/auth/desktop/transactions', payload: {} });
      expect(response.statusCode).toBe(400);
      expect(response.json().error.code).toBe('VALIDATION_ERROR');
      expect(mocks.getSupabaseAdmin).not.toHaveBeenCalled();
    } finally { await app.close(); }
  });

  it('requires an authenticated Website identity before authorizing a transaction', async () => {
    const app = await createApp();
    try {
      const response = await app.inject({
        method: 'POST', url: '/api/v1/auth/desktop/transactions/123e4567-e89b-12d3-a456-426614174000/authorize',
        payload: { sessionEnvelope: { version: 1, ephemeralPublicKey: 'x'.repeat(44), iv: 'i'.repeat(16), tag: 't'.repeat(22), ciphertext: 'c' } },
      });
      expect(response.statusCode).toBe(401);
      expect(response.json().error.code).toBe('UNAUTHORIZED');
      expect(mocks.authenticateUser).not.toHaveBeenCalled();
      expect(mocks.getSupabaseAdmin).not.toHaveBeenCalled();
    } finally { await app.close(); }
  });

  it('does not disclose transaction existence without the polling secret', async () => {
    const chain: any = {};
    chain.select = vi.fn().mockReturnValue(chain);
    chain.eq = vi.fn().mockReturnValue(chain);
    chain.maybeSingle = vi.fn().mockResolvedValue({ data: null, error: null });
    mocks.getSupabaseAdmin.mockReturnValue({ from: vi.fn().mockReturnValue(chain) });
    const app = await createApp();
    try {
      const response = await app.inject({
        method: 'GET', url: '/api/v1/auth/desktop/transactions/123e4567-e89b-12d3-a456-426614174000/status',
        headers: { 'x-desktop-auth-poll-secret': 's'.repeat(43) },
      });
      expect(response.statusCode).toBe(401);
      expect(response.json().error.code).toBe('UNAUTHORIZED');
    } finally { await app.close(); }
  });

  it('fails closed when the transaction table is unavailable', async () => {
    const chain: any = {};
    chain.insert = vi.fn().mockReturnValue(chain);
    chain.select = vi.fn().mockReturnValue(chain);
    chain.single = vi.fn().mockResolvedValue({ data: null, error: { code: '42P01' } });
    mocks.getSupabaseAdmin.mockReturnValue({ from: vi.fn().mockReturnValue(chain) });
    const app = await createApp();
    try {
      const response = await app.inject({
        method: 'POST', url: '/api/v1/auth/desktop/transactions',
        payload: { devicePublicKey: 'p'.repeat(44), pollSecret: 's'.repeat(43) },
      });
      expect(response.statusCode).toBe(503);
      expect(response.json().error.code).toBe('DESKTOP_AUTH_UNAVAILABLE');
      expect(response.body).not.toContain('42P01');
    } finally { await app.close(); }
  });

  it('rejects a replay when the conditional one-time exchange has already been consumed', async () => {
    const secret = 's'.repeat(43);
    const readChain: any = {};
    readChain.select = vi.fn().mockReturnValue(readChain);
    readChain.eq = vi.fn().mockReturnValue(readChain);
    readChain.maybeSingle = vi.fn().mockResolvedValue({ data: {
      poll_secret_hash: createHash('sha256').update(secret).digest('hex'),
      status: 'authorized', expires_at: new Date(Date.now() + 60_000).toISOString(),
    }, error: null });
    const updateChain: any = {};
    updateChain.update = vi.fn().mockReturnValue(updateChain);
    updateChain.eq = vi.fn().mockReturnValue(updateChain);
    updateChain.gt = vi.fn().mockReturnValue(updateChain);
    updateChain.select = vi.fn().mockReturnValue(updateChain);
    updateChain.maybeSingle = vi.fn().mockResolvedValue({ data: null, error: null });
    const from = vi.fn().mockReturnValueOnce(readChain).mockReturnValueOnce(updateChain);
    mocks.getSupabaseAdmin.mockReturnValue({ from });
    const app = await createApp();
    try {
      const response = await app.inject({
        method: 'POST', url: '/api/v1/auth/desktop/transactions/123e4567-e89b-12d3-a456-426614174000/exchange',
        headers: { 'x-desktop-auth-poll-secret': secret },
      });
      expect(response.statusCode).toBe(409);
      expect(response.json().error.code).toBe('TRANSACTION_ALREADY_USED');
      expect(updateChain.update).toHaveBeenCalledWith(expect.objectContaining({ status: 'consumed' }));
    } finally { await app.close(); }
  });
});

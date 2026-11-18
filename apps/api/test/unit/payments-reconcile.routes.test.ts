import Fastify from 'fastify';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getSupabaseAdmin } from '../../src/integrations/supabase/client.js';
import paymentsPlugin from '../../src/modules/payments/payments.routes.js';

const mocks = vi.hoisted(() => ({
  authenticateUser: vi.fn(),
  getSupabaseAdmin: vi.fn(),
  hasAdminRole: vi.fn(),
  reconcileSubscriptions: vi.fn(),
}));

vi.mock('../../src/modules/auth/auth.service.js', () => ({
  authenticateUser: mocks.authenticateUser,
}));

vi.mock('../../src/integrations/supabase/client.js', () => ({
  getSupabaseAdmin: mocks.getSupabaseAdmin,
  getSupabaseUser: vi.fn(),
}));

vi.mock('../../src/modules/admin/admin.service.js', () => ({
  hasAdminRole: mocks.hasAdminRole,
}));

vi.mock('../../src/modules/payments/payments.service.js', () => ({
  createCheckoutSession: vi.fn(),
  processWebhookEvent: vi.fn(),
  reconcileSubscriptions: mocks.reconcileSubscriptions,
  getPaymentProviderConfig: vi.fn(),
  listCustomerPayments: vi.fn(),
}));

const adminClient = {} as ReturnType<typeof getSupabaseAdmin>;

async function createApp() {
  const app = Fastify({ logger: false });
  await app.register(paymentsPlugin, { prefix: '/api/v1/payments' });
  return app;
}

describe('POST /api/v1/payments/reconcile', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.authenticateUser.mockResolvedValue({
      id: 'user-1',
      email: 'member@example.com',
      emailConfirmed: true,
    });
    mocks.getSupabaseAdmin.mockReturnValue(adminClient);
    mocks.hasAdminRole.mockResolvedValue(false);
    mocks.reconcileSubscriptions.mockResolvedValue({
      reconciled: 1,
      subscriptions: [],
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('rejects authenticated users without the billing role before reconciliation', async () => {
    const app = await createApp();
    try {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/payments/reconcile',
        headers: { authorization: 'Bearer access-token' },
      });

      expect(response.statusCode).toBe(403);
      expect(response.json()).toMatchObject({
        ok: false,
        error: { code: 'FORBIDDEN' },
      });
      expect(mocks.hasAdminRole).toHaveBeenCalledWith(adminClient, 'user-1', 'billing');
      expect(mocks.reconcileSubscriptions).not.toHaveBeenCalled();
    } finally {
      await app.close();
    }
  });

  it('allows billing administrators to reconcile subscriptions', async () => {
    mocks.hasAdminRole.mockResolvedValue(true);
    mocks.reconcileSubscriptions.mockResolvedValue({
      reconciled: 2,
      subscriptions: [{ id: 'subscription-1', status: 'active' }],
    });
    const app = await createApp();
    try {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/payments/reconcile',
        headers: { authorization: 'Bearer access-token' },
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({
        ok: true,
        reconciled: 2,
      });
      expect(mocks.reconcileSubscriptions).toHaveBeenCalledWith(adminClient);
    } finally {
      await app.close();
    }
  });
});

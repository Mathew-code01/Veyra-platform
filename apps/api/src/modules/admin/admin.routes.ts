import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { getSupabaseAdmin } from '../../integrations/supabase/client.js';
import {
  adminLookupUser,
  adminAdjustCredits,
  adminRevokeDevice,
  listAdminAuditEventsPaginated,
  adminListUsers,
  adminGetSubscription,
  adminListPaymentTransactions,
  adminStats,
} from './admin.service.js';
import { authenticateUser } from '../auth/auth.service.js';
import { hasAdminRole } from '../account/account.service.js';

const adminPlugin: FastifyPluginAsync = async (fastify) => {
  // Admin: configure the internal monthly managed Cloud AI provider-cost cap.
  // The value is not a customer credit balance or a public usage promise.
  fastify.put('/plans/:planId/cloud-cost-limit', async (request, reply) => {
    const requestId = request.id ?? 'unknown';
    const params = z.object({ planId: z.string().uuid() }).safeParse(request.params);
    const body = z.object({ monthlyLimitCents: z.number().int().min(1).max(1_000_000).nullable() }).safeParse(request.body);
    if (!params.success || !body.success) {
      return reply.status(400).send({ ok: false, requestId, error: { code: 'VALIDATION_ERROR', message: 'Provide a valid Cloud plan ID and a positive monthly cost limit in USD cents, or null to disable Cloud AI for the plan.', status: 400 } });
    }

    const authHeader = request.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return reply.status(401).send({ ok: false, requestId, error: { code: 'UNAUTHORIZED', message: 'Missing or invalid authorization header.', status: 401 } });
    }
    const user = await authenticateUser(authHeader.substring(7));
    if (!user) return reply.status(401).send({ ok: false, requestId, error: { code: 'UNAUTHORIZED', message: 'Invalid or expired session.', status: 401 } });

    const adminClient = getSupabaseAdmin();
    if (!(await hasAdminRole(adminClient, user.id, 'billing')) && !(await hasAdminRole(adminClient, user.id, 'admin'))) {
      return reply.status(403).send({ ok: false, requestId, error: { code: 'FORBIDDEN', message: 'Billing administrator access is required.', status: 403 } });
    }

    const { data: plan, error } = await adminClient.from('plans')
      .update({ cloud_ai_monthly_cost_limit_cents: body.data.monthlyLimitCents })
      .eq('id', params.data.planId)
      .eq('family', 'cloud')
      .eq('is_dev_fixture', false)
      .select('id, cloud_ai_monthly_cost_limit_cents')
      .maybeSingle();
    if (error || !plan) {
      request.log.error({ requestId, error }, 'Cloud AI cost limit update failed');
      return reply.status(error ? 500 : 404).send({ ok: false, requestId, error: { code: error ? 'PLAN_UPDATE_ERROR' : 'PLAN_NOT_FOUND', message: error ? 'Unable to update the Cloud plan cost limit.' : 'Commercial Cloud plan not found.', status: error ? 500 : 404 } });
    }

    await adminClient.from('admin_audit_events').insert({
      admin_user_id: user.id,
      action: 'cloud_ai_cost_limit_updated',
      target_type: 'plan',
      target_id: plan.id,
      metadata: { monthlyLimitCents: plan.cloud_ai_monthly_cost_limit_cents },
    });
    return reply.send({ ok: true, requestId, planId: plan.id, monthlyLimitCents: plan.cloud_ai_monthly_cost_limit_cents });
  });

  // --- Admin: User lookup ---
  fastify.get(
    '/users/:userId',
    async (request, reply) => {
      const requestId = request.id ?? 'unknown';
      const { userId } = request.params as { userId: string };

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
        const result = await adminLookupUser(adminClient, user.id, userId, 'admin');

        if (!result.ok) {
          return reply.status(403).send({
            ok: false,
            requestId,
            error: {
              code: result.error,
              message: 'Admin access required.',
              status: 403,
            },
          });
        }

        return reply.send({
          ok: true,
          requestId,
          user: result.user,
        });
      } catch (err) {
        request.log.error({ requestId, err }, 'admin user lookup error');
        return reply.status(500).send({
          ok: false,
          requestId,
          error: {
            code: 'ADMIN_LOOKUP_ERROR',
            message: 'An unexpected error occurred during user lookup.',
            status: 500,
          },
        });
      }
    }
  );

  // --- Admin: Credit adjustment ---
  fastify.post(
    '/credits/adjust',
    async (request, reply) => {
      const requestId = request.id ?? 'unknown';

      let body: { userId: string; amountCents: number; reason: string; idempotencyKey: string };
      try {
        body = z.object({
          userId: z.string().uuid(),
          amountCents: z.number().int(),
          reason: z.string().min(1),
          idempotencyKey: z.string().min(1),
        }).parse(request.body);
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
        const result = await adminAdjustCredits(
          adminClient,
          user.id,
          body.userId,
          body.amountCents,
          body.reason,
          body.idempotencyKey,
          'billing',
        );

        if (!result.ok) {
          return reply.status(403).send({
            ok: false,
            requestId,
            error: {
              code: result.error,
              message: 'Admin access required.',
              status: 403,
            },
          });
        }

        return reply.send({
          ok: true,
          requestId,
          userId: result.userId,
          amountCents: result.amountCents,
          newBalance: result.newBalance,
        });
      } catch (err) {
        request.log.error({ requestId, err }, 'admin credit adjustment error');
        return reply.status(500).send({
          ok: false,
          requestId,
          error: {
            code: 'ADMIN_CREDIT_ERROR',
            message: 'An unexpected error occurred during credit adjustment.',
            status: 500,
          },
        });
      }
    }
  );

  // --- Admin: Device revoke ---
  fastify.post(
    '/devices/revoke',
    async (request, reply) => {
      const requestId = request.id ?? 'unknown';

      let body: { deviceId: string; userId: string; reason: string };
      try {
        body = z.object({
          deviceId: z.string().uuid(),
          userId: z.string().uuid(),
          reason: z.string().min(1),
        }).parse(request.body);
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
        const result = await adminRevokeDevice(
          adminClient,
          user.id,
          body.deviceId,
          body.userId,
          body.reason,
          'admin',
        );

        if (!result.ok) {
          return reply.status(403).send({
            ok: false,
            requestId,
            error: {
              code: result.error,
              message: 'Admin access required.',
              status: 403,
            },
          });
        }

        return reply.send({
          ok: true,
          requestId,
          deviceId: result.deviceId,
          userId: result.userId,
        });
      } catch (err) {
        request.log.error({ requestId, err }, 'admin device revoke error');
        return reply.status(500).send({
          ok: false,
          requestId,
          error: {
            code: 'ADMIN_DEVICE_ERROR',
            message: 'An unexpected error occurred during device revocation.',
            status: 500,
          },
        });
      }
    }
  );

  // --- Admin: Audit events ---
  fastify.get(
    '/audit',
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
        const adminClient = getSupabaseAdmin();
        const result = await listAdminAuditEventsPaginated(adminClient, user.id, 'auditor');

        if (!result.ok) {
          return reply.status(403).send({
            ok: false,
            requestId,
            error: {
              code: result.error,
              message: 'Admin access required.',
              status: 403,
            },
          });
        }

        return reply.send({
          ok: true,
          requestId,
          auditEvents: result.auditEvents,
        });
      } catch (err) {
        request.log.error({ requestId, err }, 'admin audit error');
        return reply.status(500).send({
          ok: false,
          requestId,
          error: {
            code: 'ADMIN_AUDIT_ERROR',
            message: 'An unexpected error occurred while listing audit events.',
            status: 500,
          },
        });
      }
    }
  );

  // --- Admin: List all users ---
  fastify.get(
    '/users',
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
        const adminClient = getSupabaseAdmin();
        const page = (request.query as { page?: string }).page ? parseInt(String((request.query as { page?: string }).page), 10) : 1;
        const pageSize = (request.query as { pageSize?: string }).pageSize ? parseInt(String((request.query as { pageSize?: string }).pageSize), 10) : 50;
        const result = await adminListUsers(adminClient, user.id, 'admin', page, pageSize);

        if (!result.ok) {
          return reply.status(403).send({
            ok: false,
            requestId,
            error: {
              code: result.error,
              message: 'Admin access required.',
              status: 403,
            },
          });
        }

        return reply.send({
          ok: true,
          requestId,
          users: result.users,
          total: result.total,
          page: result.page,
          pageSize: result.pageSize,
        });
      } catch (err) {
        request.log.error({ requestId, err }, 'admin user list error');
        return reply.status(500).send({
          ok: false,
          requestId,
          error: {
            code: 'ADMIN_USER_LIST_ERROR',
            message: 'An unexpected error occurred while listing users.',
            status: 500,
          },
        });
      }
    }
  );

  // --- Admin: Get user subscription ---
  fastify.get(
    '/users/:userId/subscription',
    async (request, reply) => {
      const requestId = request.id ?? 'unknown';
      const { userId } = request.params as { userId: string };

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
        const result = await adminGetSubscription(adminClient, user.id, userId, 'admin');

        if (!result.ok) {
          return reply.status(403).send({
            ok: false,
            requestId,
            error: {
              code: result.error,
              message: 'Admin access required.',
              status: 403,
            },
          });
        }

        return reply.send({
          ok: true,
          requestId,
          subscription: result.subscription,
        });
      } catch (err) {
        request.log.error({ requestId, err }, 'admin subscription lookup error');
        return reply.status(500).send({
          ok: false,
          requestId,
          error: {
            code: 'ADMIN_SUBSCRIPTION_ERROR',
            message: 'An unexpected error occurred while looking up subscription.',
            status: 500,
          },
        });
      }
    }
  );

  // --- Admin: List payment transactions ---
  fastify.get(
    '/payments',
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
        const adminClient = getSupabaseAdmin();
        const page = (request.query as { page?: string }).page ? parseInt(String((request.query as { page?: string }).page), 10) : 1;
        const pageSize = (request.query as { pageSize?: string }).pageSize ? parseInt(String((request.query as { pageSize?: string }).pageSize), 10) : 50;
        const result = await adminListPaymentTransactions(adminClient, user.id, 'billing', page, pageSize);

        if (!result.ok) {
          return reply.status(403).send({
            ok: false,
            requestId,
            error: {
              code: result.error,
              message: 'Admin access required.',
              status: 403,
            },
          });
        }

        return reply.send({
          ok: true,
          requestId,
          transactions: result.transactions,
          total: result.total,
          page: result.page,
          pageSize: result.pageSize,
        });
      } catch (err) {
        request.log.error({ requestId, err }, 'admin payment list error');
        return reply.status(500).send({
          ok: false,
          requestId,
          error: {
            code: 'ADMIN_PAYMENT_LIST_ERROR',
            message: 'An unexpected error occurred while listing payments.',
            status: 500,
          },
        });
      }
    }
  );

  // --- Admin: Platform statistics ---
  fastify.get(
    '/stats',
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
        const adminClient = getSupabaseAdmin();
        const result = await adminStats(adminClient, user.id, 'admin');

        if (!result.ok) {
          return reply.status(403).send({
            ok: false,
            requestId,
            error: {
              code: result.error,
              message: 'Admin access required.',
              status: 403,
            },
          });
        }

        return reply.send({
          ok: true,
          requestId,
          stats: result.stats,
        });
      } catch (err) {
        request.log.error({ requestId, err }, 'admin stats error');
        return reply.status(500).send({
          ok: false,
          requestId,
          error: {
            code: 'ADMIN_STATS_ERROR',
            message: 'An unexpected error occurred while fetching admin stats.',
            status: 500,
          },
        });
      }
    }
  );
};

export default adminPlugin;

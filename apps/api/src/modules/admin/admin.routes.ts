import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { getSupabaseAdmin } from '../../integrations/supabase/client.js';
import {
  adminLookupUser,
  adminAdjustCredits,
  adminRevokeDevice,
  listAdminAuditEvents,
} from './admin.service.js';
import { authenticateUser } from '../auth/auth.service.js';

const adminPlugin: FastifyPluginAsync = async (fastify) => {
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
        const result = await listAdminAuditEvents(adminClient, user.id, 'auditor');

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
};

export default adminPlugin;

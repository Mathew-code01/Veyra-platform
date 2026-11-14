import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { getSupabaseAdmin } from '../../integrations/supabase/client.js';
import {
  reserveCredits,
  settleReservation,
  releaseReservation,
  getCreditBalance,
} from './credits.service.js';
import { authenticateUser } from '../auth/auth.service.js';

const creditsPlugin: FastifyPluginAsync = async (fastify) => {
  // --- Get credit balance ---
  fastify.get(
    '/balance',
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
        const result = await getCreditBalance(adminClient, user.id);

        return reply.send({
          ok: true,
          requestId,
          balance: result ?? { balanceCents: 0, currency: 'USD' },
        });
      } catch (err) {
        request.log.error({ requestId, err }, 'credit balance error');
        return reply.status(500).send({
          ok: false,
          requestId,
          error: {
            code: 'CREDIT_ERROR',
            message: 'An unexpected error occurred while fetching credit balance.',
            status: 500,
          },
        });
      }
    }
  );

  // --- Reserve credits ---
  fastify.post(
    '/reserve',
    async (request, reply) => {
      const requestId = request.id ?? 'unknown';

      let body: { amountCents: number; idempotencyKey: string; service?: string; referenceId?: string };
      try {
        body = z.object({
          amountCents: z.number().int().positive(),
          idempotencyKey: z.string().min(1),
          service: z.string().optional(),
          referenceId: z.string().optional(),
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
        const result = await reserveCredits(adminClient, user.id, body.amountCents, {
          idempotencyKey: body.idempotencyKey,
          referenceType: body.service ?? undefined,
          referenceId: body.referenceId ?? undefined,
          expiresInSeconds: 300,
          description: `Credit reserved for ${body.service ?? 'usage'}`,
        });

        if (!result.ok) {
          return reply.status(400).send({
            ok: false,
            requestId,
            error: {
              code: 'RESERVATION_FAILED',
              message: result.error ?? 'Reservation failed.',
              status: 400,
            },
          });
        }

        return reply.send({
          ok: true,
          requestId,
          reservationId: result.reservationId,
          balanceCents: result.balanceCents,
        });
      } catch (err) {
        request.log.error({ requestId, err }, 'credit reserve error');
        return reply.status(500).send({
          ok: false,
          requestId,
          error: {
            code: 'RESERVATION_ERROR',
            message: 'An unexpected error occurred while reserving credits.',
            status: 500,
          },
        });
      }
    }
  );

  // --- Settle a reservation ---
  fastify.post(
    '/settle',
    async (request, reply) => {
      const requestId = request.id ?? 'unknown';

      let body: { reservationId: string };
      try {
        body = z.object({ reservationId: z.string().uuid() }).parse(request.body);
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
        const result = await settleReservation(adminClient, body.reservationId);

        if (!result.ok) {
          return reply.status(400).send({
            ok: false,
            requestId,
            error: {
              code: 'SETTLEMENT_FAILED',
              message: result.error ?? 'Settlement failed.',
              status: 400,
            },
          });
        }

        return reply.send({ ok: true, requestId });
      } catch (err) {
        request.log.error({ requestId, err }, 'credit settle error');
        return reply.status(500).send({
          ok: false,
          requestId,
          error: {
            code: 'SETTLEMENT_ERROR',
            message: 'An unexpected error occurred while settling reservation.',
            status: 500,
          },
        });
      }
    }
  );

  // --- Release a reservation ---
  fastify.post(
    '/release',
    async (request, reply) => {
      const requestId = request.id ?? 'unknown';

      let body: { reservationId: string };
      try {
        body = z.object({ reservationId: z.string().uuid() }).parse(request.body);
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
        const result = await releaseReservation(adminClient, body.reservationId);

        if (!result.ok) {
          return reply.status(400).send({
            ok: false,
            requestId,
            error: {
              code: 'RELEASE_FAILED',
              message: result.error ?? 'Release failed.',
              status: 400,
            },
          });
        }

        return reply.send({ ok: true, requestId });
      } catch (err) {
        request.log.error({ requestId, err }, 'credit release error');
        return reply.status(500).send({
          ok: false,
          requestId,
          error: {
            code: 'RELEASE_ERROR',
            message: 'An unexpected error occurred while releasing reservation.',
            status: 500,
          },
        });
      }
    }
  );
};

export default creditsPlugin;

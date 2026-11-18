import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import {
  CancelSubscriptionRequestSchema,
} from '../../../../../packages/contracts/src/index.ts';
import { getSupabaseAdmin, getSupabaseUser } from '../../integrations/supabase/client.js';
import {
  getCurrentSubscription,
  cancelSubscription,
  reactivateSubscription,
} from './subscriptions.service.js';
import { authenticateUser } from '../auth/auth.service.js';

const subscriptionsPlugin: FastifyPluginAsync = async (fastify) => {
  // --- Get current subscription ---
  fastify.get(
    '/current',
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
        const userClient = getSupabaseUser(accessToken);
        const result = await getCurrentSubscription(userClient, user.id);

        return reply.send({
          ok: true,
          requestId,
          subscription: result.subscription,
        });
      } catch (err) {
        request.log.error({ requestId, err }, 'subscription get error');
        return reply.status(500).send({
          ok: false,
          requestId,
          error: {
            code: 'SUBSCRIPTION_ERROR',
            message: 'An unexpected error occurred while fetching subscription.',
            status: 500,
          },
        });
      }
    }
  );

  // Subscription records are created only from verified payment-provider events.
  // Keep this legacy route explicit so clients cannot activate access by posting a plan ID.
  fastify.post(
    '',
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

      return reply.status(409).send({
          ok: false,
          requestId,
          error: {
            code: 'CHECKOUT_REQUIRED',
            message: 'Subscriptions are activated only after the Platform verifies payment. Start checkout instead.',
            status: 409,
          },
        });
    }
  );

  // --- Cancel subscription ---
  fastify.post(
    '/cancel',
    async (request, reply) => {
      const requestId = request.id ?? 'unknown';

      let body: z.infer<typeof CancelSubscriptionRequestSchema>;
      try {
        body = CancelSubscriptionRequestSchema.parse(request.body);
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
        const result = await cancelSubscription(adminClient, user.id, body.subscriptionId, body.atPeriodEnd);

        return reply.send({
          ok: true,
          requestId,
          subscription: result.subscription,
        });
      } catch (err) {
        request.log.error({ requestId, err }, 'subscription cancel error');
        return reply.status(500).send({
          ok: false,
          requestId,
          error: {
            code: 'SUBSCRIPTION_CANCEL_ERROR',
            message: 'An unexpected error occurred while canceling subscription.',
            status: 500,
          },
        });
      }
    }
  );

  // --- Reactivate subscription ---
  fastify.post(
    '/reactivate',
    async (request, reply) => {
      const requestId = request.id ?? 'unknown';

      let body: { subscriptionId: string };
      try {
        body = z.object({ subscriptionId: z.string().uuid() }).parse(request.body);
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
        const result = await reactivateSubscription(adminClient, user.id, body.subscriptionId);

        return reply.send({
          ok: true,
          requestId,
          subscription: result.subscription,
        });
      } catch (err) {
        request.log.error({ requestId, err }, 'subscription reactivate error');
        return reply.status(500).send({
          ok: false,
          requestId,
          error: {
            code: 'SUBSCRIPTION_REACTIVATE_ERROR',
            message: 'An unexpected error occurred while reactivating subscription.',
            status: 500,
          },
        });
      }
    }
  );
};

export default subscriptionsPlugin;

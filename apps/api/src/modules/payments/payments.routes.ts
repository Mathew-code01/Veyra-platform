import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import {
  CheckoutSessionRequestSchema,
} from '../../../../../packages/contracts/src/index.ts';
import { getSupabaseAdmin } from '../../integrations/supabase/client.js';
import { createCheckoutSession, processWebhookEvent, reconcileSubscriptions } from './payments.service.js';
import { authenticateUser } from '../auth/auth.service.js';

const paymentsPlugin: FastifyPluginAsync = async (fastify) => {
  // --- Create checkout session ---
  fastify.post(
    '/checkout',
    async (request, reply) => {
      const requestId = request.id ?? 'unknown';

      let body: z.infer<typeof CheckoutSessionRequestSchema>;
      try {
        body = z.object({
          planId: z.string().uuid(),
          billingInterval: z.enum(['monthly', 'yearly']),
          successUrl: z.string().url(),
          cancelUrl: z.string().url(),
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
        const result = await createCheckoutSession(
          adminClient,
          user.id,
          body.planId,
          body.billingInterval,
          body.successUrl,
          body.cancelUrl,
        );

        return reply.send({
          ok: true,
          requestId,
          checkoutUrl: result.checkoutUrl,
          checkoutSessionId: result.sessionId,
        });
      } catch (err) {
        request.log.error({ requestId, err }, 'checkout session error');
        return reply.status(500).send({
          ok: false,
          requestId,
          error: {
            code: 'CHECKOUT_ERROR',
            message: 'An unexpected error occurred while creating checkout session.',
            status: 500,
          },
        });
      }
    }
  );

  // --- Webhook endpoint (no auth - verified by signature) ---
  fastify.post(
    '/webhook',
    async (request, reply) => {
      const requestId = request.id ?? 'unknown';

      const signature = request.headers['stripe-signature'] ?? request.headers['webhook-signature'];
      if (!signature || typeof signature !== 'string') {
        return reply.status(400).send({
          ok: false,
          requestId,
          error: {
            code: 'INVALID_WEBHOOK',
            message: 'Missing webhook signature.',
            status: 400,
          },
        });
      }

      const payload = JSON.stringify(request.body);
      let eventType: string;
      let eventId: string;

      try {
        const parsed = JSON.parse(payload);
        eventType = parsed.type ?? 'unknown';
        eventId = parsed.id ?? 'unknown';
      } catch {
        return reply.status(400).send({
          ok: false,
          requestId,
          error: {
            code: 'INVALID_PAYLOAD',
            message: 'Invalid webhook payload.',
            status: 400,
          },
        });
      }

      try {
        const adminClient = getSupabaseAdmin();
        const result = await processWebhookEvent(
          adminClient,
          'mock',
          eventId,
          eventType,
          request.body,
          signature,
        );

        return reply.send({
          ok: true,
          requestId,
          processed: result.processed,
          reason: result.reason ?? undefined,
        });
      } catch (err) {
        request.log.warn({ requestId, err }, 'webhook processing error');
        return reply.status(400).send({
          ok: false,
          requestId,
          error: {
            code: 'WEBHOOK_ERROR',
            message: err instanceof Error ? err.message : 'Webhook processing failed.',
            status: 400,
          },
        });
      }
    }
  );

  // --- Reconciliation (admin operation) ---
  fastify.post(
    '/reconcile',
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
        const result = await reconcileSubscriptions(adminClient);

        return reply.send({
          ok: true,
          requestId,
          reconciled: result.reconciled,
          subscriptions: result.subscriptions,
        });
      } catch (err) {
        request.log.error({ requestId, err }, 'reconciliation error');
        return reply.status(500).send({
          ok: false,
          requestId,
          error: {
            code: 'RECONCILIATION_ERROR',
            message: 'An unexpected error occurred during reconciliation.',
            status: 500,
          },
        });
      }
    }
  );
};

export default paymentsPlugin;

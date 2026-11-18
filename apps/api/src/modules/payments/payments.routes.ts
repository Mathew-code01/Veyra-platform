import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import {
  CheckoutSessionRequestSchema,
  PaymentHistoryResponseSchema,
} from '../../../../../packages/contracts/src/index.ts';
import { getSupabaseAdmin, getSupabaseUser } from '../../integrations/supabase/client.js';
import { hasAdminRole } from '../admin/admin.service.js';
import {
  createCheckoutSession,
  processWebhookEvent,
  reconcileSubscriptions,
  getPaymentProviderConfig,
  listCustomerPayments,
} from './payments.service.js';
import { createPaymentProvider } from './payment-provider.js';
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
          currency: z.string().length(3).transform((value) => value.toUpperCase()),
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
          user.email,
          body.planId,
          body.billingInterval,
          body.currency,
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

  // --- Customer payment history ---
  fastify.get(
    '/history',
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
        const result = await listCustomerPayments(userClient);

        if (!result.ok) {
          return reply.status(500).send({
            ok: false,
            requestId,
            error: {
              code: result.error,
              message: 'Unable to fetch payment history.',
              status: 500,
            },
          });
        }

        const response = PaymentHistoryResponseSchema.safeParse({
          ok: true,
          requestId,
          transactions: result.transactions,
        });
        if (!response.success) {
          request.log.error({ requestId }, 'payment history response validation failed');
          return reply.status(500).send({
            ok: false,
            requestId,
            error: {
              code: 'INVALID_RESPONSE',
              message: 'Payment history is temporarily unavailable.',
              status: 500,
            },
          });
        }

        return reply.send(response.data);
      } catch (err) {
        request.log.error({ requestId, err }, 'customer payment history error');
        return reply.status(500).send({
          ok: false,
          requestId,
          error: {
            code: 'PAYMENT_HISTORY_ERROR',
            message: 'An unexpected error occurred while fetching payment history.',
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

      const signature = request.headers['x-paystack-signature'];
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

      const payload = (request as typeof request & { rawBody?: string }).rawBody;
      if (!payload) {
        return reply.status(400).send({
          ok: false,
          requestId,
          error: { code: 'INVALID_PAYLOAD', message: 'Webhook raw body is unavailable.', status: 400 },
        });
      }
      let eventType: string;
      let eventId: string;

      try {
        const parsed = request.body as { type?: string; event?: string; id?: string | number; data?: { id?: string | number; reference?: string } };
        eventType = parsed.event ?? parsed.type ?? '';
        const candidateId = parsed.id ?? parsed.data?.id ?? parsed.data?.reference;
        if (!eventType || candidateId === undefined || candidateId === null) throw new Error('Missing webhook event identity');
        eventId = String(candidateId);
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

      const { providerName: webhookProviderName, config: webhookConfig } = getPaymentProviderConfig();
      const webhookProvider = createPaymentProvider(webhookProviderName, webhookConfig);
      if (!webhookProvider.verifyWebhookSignature(payload, signature)) {
        return reply.status(400).send({
          ok: false,
          requestId,
          error: {
            code: 'INVALID_WEBHOOK',
            message: 'Invalid webhook signature.',
            status: 400,
          },
        });
      }

      try {
        const adminClient = getSupabaseAdmin();
        const result = await processWebhookEvent(
          adminClient,
          webhookProviderName,
          eventId,
          eventType,
          request.body,
          signature,
          payload,
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
        if (!(await hasAdminRole(adminClient, user.id, 'billing'))) {
          return reply.status(403).send({
            ok: false,
            requestId,
            error: {
              code: 'FORBIDDEN',
              message: 'Billing access required.',
              status: 403,
            },
          });
        }

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

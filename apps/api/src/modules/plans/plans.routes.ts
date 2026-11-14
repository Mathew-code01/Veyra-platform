import type { FastifyPluginAsync } from 'fastify';
import { getSupabaseUser } from '../../integrations/supabase/client.js';
import { listPlans, getPlan } from './plans.service.js';
import { authenticateUser } from '../auth/auth.service.js';

const plansPlugin: FastifyPluginAsync = async (fastify) => {
  // --- List plans ---
  fastify.get(
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

      try {
        const userClient = getSupabaseUser(accessToken);
        const result = await listPlans(userClient);

        return reply.send({
          ok: true,
          requestId,
          plans: result.plans,
        });
      } catch (err) {
        request.log.error({ requestId, err }, 'plans list error');
        return reply.status(500).send({
          ok: false,
          requestId,
          error: {
            code: 'PLANS_ERROR',
            message: 'An unexpected error occurred while listing plans.',
            status: 500,
          },
        });
      }
    }
  );

  // --- Get plan ---
  fastify.get(
    '/:planId',
    async (request, reply) => {
      const requestId = request.id ?? 'unknown';
      const { planId } = request.params as { planId: string };

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
        const result = await getPlan(userClient, planId);

        return reply.send({
          ok: true,
          requestId,
          plan: result.plan,
        });
      } catch (err) {
        request.log.error({ requestId, err }, 'plan get error');
        return reply.status(500).send({
          ok: false,
          requestId,
          error: {
            code: 'PLAN_ERROR',
            message: 'An unexpected error occurred while fetching plan.',
            status: 500,
          },
        });
      }
    }
  );
};

export default plansPlugin;

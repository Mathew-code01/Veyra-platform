import type { FastifyPluginAsync } from 'fastify';
import { listUsageRecords, getCloudAllowance } from './usage.service.js';
import { authenticateUser } from '../auth/auth.service.js';

const usagePlugin: FastifyPluginAsync = async (fastify) => {
  fastify.get('/cloud-allowance', async (request, reply) => {
    const requestId = request.id ?? 'unknown';
    const authHeader = request.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return reply.status(401).send({ ok: false, requestId, error: { code: 'UNAUTHORIZED', message: 'Missing or invalid authorization header.', status: 401 } });
    }
    const accessToken = authHeader.substring(7);
    const user = await authenticateUser(accessToken);
    if (!user) return reply.status(401).send({ ok: false, requestId, error: { code: 'UNAUTHORIZED', message: 'Invalid or expired session.', status: 401 } });
    try {
      const allowance = await getCloudAllowance(user.id, accessToken);
      return reply.send({ ok: true, requestId, allowance });
    } catch (err) {
      request.log.error({ requestId, err }, 'Cloud allowance lookup error');
      return reply.status(500).send({ ok: false, requestId, error: { code: 'CLOUD_ALLOWANCE_ERROR', message: 'Cloud usage allowance is temporarily unavailable.', status: 500 } });
    }
  });

  // --- List usage records (customer-facing) ---
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
        const result = await listUsageRecords(user.id, accessToken);

        if (!result.ok) {
          return reply.status(404).send({
            ok: false,
            requestId,
            error: {
              code: result.error,
              message: 'Unable to fetch usage records.',
              status: 404,
            },
          });
        }

        return reply.send({
          ok: true,
          requestId,
          usage: result.usage,
        });
      } catch (err) {
        request.log.error({ requestId, err }, 'usage list error');
        return reply.status(500).send({
          ok: false,
          requestId,
          error: {
            code: 'USAGE_LIST_ERROR',
            message: 'An unexpected error occurred while fetching usage records.',
            status: 500,
          },
        });
      }
    }
  );
};

export default usagePlugin;

import type { FastifyPluginAsync } from 'fastify';
import { authenticateUser } from '../../modules/auth/auth.service.js';

interface AuthenticatedRequest {
  user?: { id: string; email: string; emailConfirmed: boolean };
}

interface AuthMiddlewareOptions {
  required?: boolean;
}

const authPlugin: FastifyPluginAsync<AuthMiddlewareOptions> = async (fastify, opts) => {
  const required = opts.required ?? false;

  fastify.addHook('preHandler', async (request, reply) => {
    const authHeader = request.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      if (required) {
        return reply.status(401).send({
          ok: false,
          requestId: request.id ?? 'unknown',
          error: {
            code: 'UNAUTHORIZED',
            message: 'Missing or invalid authorization header.',
            status: 401,
          },
        });
      }
      return;
    }

    const accessToken = authHeader.substring(7);
    const user = await authenticateUser(accessToken);

    if (!user) {
      if (required) {
        return reply.status(401).send({
          ok: false,
          requestId: request.id ?? 'unknown',
          error: {
            code: 'UNAUTHORIZED',
            message: 'Invalid or expired session.',
            status: 401,
          },
        });
      }
      return;
    }

    (request as AuthenticatedRequest).user = user;
  });
};

export default authPlugin;

export { type AuthenticatedRequest };

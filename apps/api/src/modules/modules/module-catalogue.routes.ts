import type { FastifyPluginAsync } from 'fastify';
import { getSupabaseUser } from '../../integrations/supabase/client.js';
import { listModules, listModuleVersions } from './module-catalogue.service.js';
import { authenticateUser } from '../auth/auth.service.js';

const modulesPlugin: FastifyPluginAsync = async (fastify) => {
  // --- List modules ---
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
        const result = await listModules(userClient);

        return reply.send({
          ok: true,
          requestId,
          modules: result.modules,
        });
      } catch (err) {
        request.log.error({ requestId, err }, 'module catalogue error');
        return reply.status(500).send({
          ok: false,
          requestId,
          error: {
            code: 'MODULES_ERROR',
            message: 'An unexpected error occurred while listing modules.',
            status: 500,
          },
        });
      }
    }
  );

  // --- Get module versions ---
  fastify.get(
    '/:moduleId/versions',
    async (request, reply) => {
      const requestId = request.id ?? 'unknown';
      const { moduleId } = request.params as { moduleId: string };

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
        const result = await listModuleVersions(userClient, moduleId);

        return reply.send({
          ok: true,
          requestId,
          moduleId: result.moduleId,
          versions: result.versions,
        });
      } catch (err) {
        request.log.error({ requestId, err }, 'module versions error');
        return reply.status(500).send({
          ok: false,
          requestId,
          error: {
            code: 'MODULE_VERSIONS_ERROR',
            message: 'An unexpected error occurred while listing module versions.',
            status: 500,
          },
        });
      }
    }
  );
};

export default modulesPlugin;

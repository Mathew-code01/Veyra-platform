import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import {
  ReleaseCheckRequestSchema,
} from '../../../../../packages/contracts/src/index.ts';
import { getSupabaseAdmin, getSupabaseUser } from '../../integrations/supabase/client.js';
import {
  checkForUpdate,
  listReleaseChannels,
  listReleases,
} from './releases.service.js';
import { authenticateUser } from '../auth/auth.service.js';

const releasesPlugin: FastifyPluginAsync = async (fastify) => {
  // --- Check for update ---
  fastify.post(
    '/check',
    async (request, reply) => {
      const requestId = request.id ?? 'unknown';

      let body: z.infer<typeof ReleaseCheckRequestSchema>;
      try {
        body = z.object({
          platform: z.enum(['windows', 'macos', 'linux']),
          architecture: z.enum(['x64', 'arm64']),
          currentVersion: z.string(),
          channel: z.string().default('stable'),
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
        const userClient = getSupabaseUser(accessToken);
        const result = await checkForUpdate(userClient, {
          platform: body.platform,
          architecture: body.architecture,
          currentVersion: body.currentVersion,
          channel: body.channel,
        });

        return reply.send({
          ok: true,
          requestId,
          updateAvailable: result.updateAvailable,
          release: result.release,
          assets: result.assets,
        });
      } catch (err) {
        request.log.error({ requestId, err }, 'update check error');
        return reply.status(500).send({
          ok: false,
          requestId,
          error: {
            code: 'UPDATE_CHECK_ERROR',
            message: 'An unexpected error occurred while checking for updates.',
            status: 500,
          },
        });
      }
    }
  );

  // --- List release channels ---
  fastify.get(
    '/channels',
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
        const result = await listReleaseChannels(userClient);

        return reply.send({
          ok: true,
          requestId,
          channels: result.channels,
        });
      } catch (err) {
        request.log.error({ requestId, err }, 'release channels error');
        return reply.status(500).send({
          ok: false,
          requestId,
          error: {
            code: 'CHANNELS_ERROR',
            message: 'An unexpected error occurred while listing channels.',
            status: 500,
          },
        });
      }
    }
  );

  // --- List all releases (admin operation) ---
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
        const adminClient = getSupabaseAdmin();
        const result = await listReleases(adminClient);

        return reply.send({
          ok: true,
          requestId,
          releases: result.releases,
        });
      } catch (err) {
        request.log.error({ requestId, err }, 'release list error');
        return reply.status(500).send({
          ok: false,
          requestId,
          error: {
            code: 'RELEASES_ERROR',
            message: 'An unexpected error occurred while listing releases.',
            status: 500,
          },
        });
      }
    }
  );
};

export default releasesPlugin;

import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import {
  DownloadAuthorizationRequestSchema,
} from '../../../../../packages/contracts/src/index.ts';
import { getSupabaseAdmin, getSupabaseUser } from '../../integrations/supabase/client.js';
import {
  createDownloadAuthorization,
  verifyDownloadAuthorization,
  markDownloadUsed,
  recordDownloadAudit,
  listDownloadAudit,
} from './download-authorization.service.js';
import { authenticateUser } from '../auth/auth.service.js';

const downloadsPlugin: FastifyPluginAsync = async (fastify) => {
  // --- Create download authorization ---
  fastify.post(
    '/authorize',
    async (request, reply) => {
      const requestId = request.id ?? 'unknown';

      let body: z.infer<typeof DownloadAuthorizationRequestSchema>;
      try {
        body = z.object({
          moduleVersionId: z.string().uuid(),
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
        const userClient = getSupabaseUser(accessToken);
        const result = await createDownloadAuthorization(
          adminClient,
          userClient,
          user.id,
          body.moduleVersionId,
        );

        if (!result.ok) {
          return reply.status(400).send({
            ok: false,
            requestId,
            error: {
              code: 'DOWNLOAD_AUTH_ERROR',
              message: result.error ?? 'Download authorization failed.',
              status: 400,
            },
          });
        }

        // Record audit event
        await recordDownloadAudit(adminClient, {
          userId: user.id,
          moduleVersionId: body.moduleVersionId,
          authorizationToken: result.authorizationToken,
          ipAddress: request.ip,
          userAgent: request.headers['user-agent'] ?? undefined,
          success: true,
        });

        return reply.send({
          ok: true,
          requestId,
          authorizationToken: result.authorizationToken,
          expiresAt: result.expiresAt,
          downloadUrl: result.downloadUrl,
        });
      } catch (err) {
        request.log.error({ requestId, err }, 'download authorization error');
        return reply.status(500).send({
          ok: false,
          requestId,
          error: {
            code: 'DOWNLOAD_AUTH_ERROR',
            message: 'An unexpected error occurred during download authorization.',
            status: 500,
          },
        });
      }
    }
  );

  // --- Verify download authorization ---
  fastify.post(
    '/authorize/verify',
    async (request, reply) => {
      const requestId = request.id ?? 'unknown';

      let body: { token: string };
      try {
        body = z.object({ token: z.string().min(1) }).parse(request.body);
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

      try {
        const adminClient = getSupabaseAdmin();
        const result = await verifyDownloadAuthorization(adminClient, body.token);

        if (!result.ok) {
          return reply.status(400).send({
            ok: false,
            requestId,
            error: {
              code: 'INVALID_AUTHORIZATION',
              message: result.error ?? 'Invalid authorization token.',
              status: 400,
            },
          });
        }

        return reply.send({
          ok: true,
          requestId,
          valid: true,
          packageHash: result.packageHash,
        });
      } catch (err) {
        request.log.error({ requestId, err }, 'download verification error');
        return reply.status(500).send({
          ok: false,
          requestId,
          error: {
            code: 'DOWNLOAD_VERIFY_ERROR',
            message: 'An unexpected error occurred during verification.',
            status: 500,
          },
        });
      }
    }
  );

  // --- Mark download as used ---
  fastify.post(
    '/authorize/mark-used',
    async (request, reply) => {
      const requestId = request.id ?? 'unknown';

      let body: { token: string };
      try {
        body = z.object({ token: z.string().min(1) }).parse(request.body);
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

      try {
        const adminClient = getSupabaseAdmin();
        await markDownloadUsed(adminClient, body.token);

        return reply.send({ ok: true, requestId });
      } catch (err) {
        request.log.error({ requestId, err }, 'download mark-used error');
        return reply.status(500).send({
          ok: false,
          requestId,
          error: {
            code: 'DOWNLOAD_MARK_USED_ERROR',
            message: 'An unexpected error occurred.',
            status: 500,
          },
        });
      }
    }
  );

  // --- List download audit ---
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
        const userClient = getSupabaseUser(accessToken);
        const result = await listDownloadAudit(userClient, user.id);

        return reply.send({
          ok: true,
          requestId,
          audits: result.audits,
        });
      } catch (err) {
        request.log.error({ requestId, err }, 'download audit error');
        return reply.status(500).send({
          ok: false,
          requestId,
          error: {
            code: 'DOWNLOAD_AUDIT_ERROR',
            message: 'An unexpected error occurred while listing download audit.',
            status: 500,
          },
        });
      }
    }
  );
};

export default downloadsPlugin;

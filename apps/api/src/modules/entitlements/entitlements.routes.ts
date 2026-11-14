import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import {
  EntitlementCheckRequestSchema,
} from '../../../../../packages/contracts/src/index.ts';
import { getSupabaseAdmin, getSupabaseUser } from '../../integrations/supabase/client.js';
import {
  checkEntitlement,
  listEntitlements,
  generateEntitlementSnapshot,
  verifyEntitlementSnapshot,
  CAPABILITIES,
} from './entitlements.service.js';
import { authenticateUser } from '../auth/auth.service.js';

const entitlementsPlugin: FastifyPluginAsync = async (fastify) => {
  // --- Check a single entitlement ---
  fastify.post(
    '/check',
    async (request, reply) => {
      const requestId = request.id ?? 'unknown';

      let body: z.infer<typeof EntitlementCheckRequestSchema>;
      try {
        body = z.object({ capability: z.string().min(1) }).parse(request.body);
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

      if (!CAPABILITIES.includes(body.capability as any)) {
        return reply.status(400).send({
          ok: false,
          requestId,
          error: {
            code: 'INVALID_CAPABILITY',
            message: `Unknown capability: ${body.capability}`,
            status: 400,
          },
        });
      }

      try {
        const userClient = getSupabaseUser(accessToken);
        const { entitled, reason, expiresAt } = await checkEntitlement(
          userClient,
          user.id,
          body.capability as any,
        );

        return reply.send({
          ok: true,
          requestId,
          capability: body.capability,
          entitled,
          reason,
          expiresAt,
        });
      } catch (err) {
        request.log.error({ requestId, err }, 'entitlement check error');
        return reply.status(500).send({
          ok: false,
          requestId,
          error: {
            code: 'ENTITLEMENT_ERROR',
            message: 'An unexpected error occurred while checking entitlement.',
            status: 500,
          },
        });
      }
    }
  );

  // --- List all entitlements ---
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
        const entitlements = await listEntitlements(userClient, user.id);

        return reply.send({
          ok: true,
          requestId,
          entitlements,
        });
      } catch (err) {
        request.log.error({ requestId, err }, 'entitlement list error');
        return reply.status(500).send({
          ok: false,
          requestId,
          error: {
            code: 'ENTITLEMENT_ERROR',
            message: 'An unexpected error occurred while listing entitlements.',
            status: 500,
          },
        });
      }
    }
  );

  // --- Generate entitlement snapshot (offline use) ---
  fastify.post(
    '/snapshot',
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
        const { snapshot, expiresAt } = await generateEntitlementSnapshot(
          adminClient,
          user.id,
          3600, // 1 hour TTL
        );

        return reply.send({
          ok: true,
          requestId,
          snapshot,
          expiresAt,
        });
      } catch (err) {
        request.log.error({ requestId, err }, 'entitlement snapshot error');
        return reply.status(500).send({
          ok: false,
          requestId,
          error: {
            code: 'ENTITLEMENT_SNAPSHOT_ERROR',
            message: 'An unexpected error occurred while generating snapshot.',
            status: 500,
          },
        });
      }
    }
  );

  // --- Verify entitlement snapshot ---
  fastify.post(
    '/snapshot/verify',
    async (request, reply) => {
      const requestId = request.id ?? 'unknown';

      let body: { snapshot: string };
      try {
        body = z.object({ snapshot: z.string().min(1) }).parse(request.body);
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

      const result = verifyEntitlementSnapshot(body.snapshot);

      return reply.send({
        ok: true,
        requestId,
        valid: result.valid,
        ...(result.payload ? { payload: result.payload } : {}),
        ...(result.reason ? { reason: result.reason } : {}),
      });
    }
  );
};

export default entitlementsPlugin;

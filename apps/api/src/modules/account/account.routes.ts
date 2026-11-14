import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import crypto from 'crypto';
import {
  AccountDeletionRequestSchema,
  RoleAssignmentRequestSchema,
  AccountExportRequestSchema,
} from '../../../../../packages/contracts/src/index.ts';
import { getSupabaseAdmin, getSupabaseUser } from '../../integrations/supabase/client.js';
import {
  requestAccountDeletion,
  getAccountStatus,
  recordAccountAuditEvent,
  assignRole,
  revokeRole,
  listUserRoles,
  hasAdminRole,
} from './account.service.js';
import { authenticateUser } from '../auth/auth.service.js';

const accountPlugin: FastifyPluginAsync = async (fastify) => {
  // --- Get account status ---
  fastify.get(
    '/status',
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
        const account = await getAccountStatus(userClient, user.id);

        return reply.send({
          ok: true,
          requestId,
          account,
        });
      } catch (err) {
        request.log.error({ requestId, err }, 'account status error');
        return reply.status(500).send({
          ok: false,
          requestId,
          error: {
            code: 'ACCOUNT_STATUS_ERROR',
            message: 'An unexpected error occurred while fetching account status.',
            status: 500,
          },
        });
      }
    }
  );

  // --- Request account deletion ---
  fastify.post(
    '/deletion/request',
    async (request, reply) => {
      const requestId = request.id ?? 'unknown';

      let body: z.infer<typeof AccountDeletionRequestSchema>;
      try {
        body = AccountDeletionRequestSchema.parse(request.body);
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

        const result = await requestAccountDeletion(
          adminClient,
          user.id,
          body.reason,
        );

        // Record audit event
        await recordAccountAuditEvent(
          adminClient,
          user.id,
          user.id,
          'account_deletion_requested',
          { reason: body.reason },
        );

        return reply.send({
          ok: true,
          requestId,
          accountId: result.accountId,
          status: result.status,
          deletionScheduledAt: result.deletionScheduledAt,
          dataRetentionDays: result.dataRetentionDays,
        });
      } catch (err) {
        request.log.error({ requestId, err }, 'account deletion error');
        return reply.status(500).send({
          ok: false,
          requestId,
          error: {
            code: 'ACCOUNT_DELETION_ERROR',
            message: 'An unexpected error occurred while requesting account deletion.',
            status: 500,
          },
        });
      }
    }
  );

  // --- Admin: List user roles ---
  fastify.get(
    '/admin/users/:userId/roles',
    async (request, reply) => {
      const requestId = request.id ?? 'unknown';
      const { userId } = request.params as { userId: string };

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
        const hasRole = await hasAdminRole(adminClient, user.id, 'admin');
        if (!hasRole) {
          return reply.status(403).send({
            ok: false,
            requestId,
            error: {
              code: 'FORBIDDEN',
              message: 'Admin access required.',
              status: 403,
            },
          });
        }

        const roles = await listUserRoles(adminClient, userId);

        return reply.send({
          ok: true,
          requestId,
          roles,
        });
      } catch (err) {
        request.log.error({ requestId, err }, 'admin role list error');
        return reply.status(500).send({
          ok: false,
          requestId,
          error: {
            code: 'ADMIN_ROLE_LIST_ERROR',
            message: 'An unexpected error occurred while listing roles.',
            status: 500,
          },
        });
      }
    }
  );

  // --- Admin: Assign role ---
  fastify.post(
    '/admin/roles/assign',
    async (request, reply) => {
      const requestId = request.id ?? 'unknown';

      let body: z.infer<typeof RoleAssignmentRequestSchema>;
      try {
        body = RoleAssignmentRequestSchema.parse(request.body);
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
        const result = await assignRole(
          adminClient,
          user.id,
          body.userId,
          body.role,
        );

        return reply.send({
          ok: true,
          requestId,
          userId: body.userId,
          role: body.role,
          granted: result.granted,
        });
      } catch (err) {
        request.log.error({ requestId, err }, 'admin role assign error');
        return reply.status(500).send({
          ok: false,
          requestId,
          error: {
            code: 'ADMIN_ROLE_ASSIGN_ERROR',
            message: err instanceof Error ? err.message : 'Role assignment failed.',
            status: 500,
          },
        });
      }
    }
  );

  // --- Admin: Revoke role ---
  fastify.post(
    '/admin/roles/revoke',
    async (request, reply) => {
      const requestId = request.id ?? 'unknown';

      let body: z.infer<typeof RoleAssignmentRequestSchema>;
      try {
        body = RoleAssignmentRequestSchema.parse(request.body);
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
        const result = await revokeRole(
          adminClient,
          user.id,
          body.userId,
          body.role,
        );

        return reply.send({
          ok: true,
          requestId,
          userId: body.userId,
          role: body.role,
          revoked: result.revoked,
        });
      } catch (err) {
        request.log.error({ requestId, err }, 'admin role revoke error');
        return reply.status(500).send({
          ok: false,
          requestId,
          error: {
            code: 'ADMIN_ROLE_REVOKE_ERROR',
            message: err instanceof Error ? err.message : 'Role revocation failed.',
            status: 500,
          },
        });
      }
    }
  );

  // --- Account data export request ---
  fastify.post(
    '/export/request',
    async (request, reply) => {
      const requestId = request.id ?? 'unknown';

      let body: z.infer<typeof AccountExportRequestSchema>;
      try {
        body = AccountExportRequestSchema.parse(request.body);
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
        const exportId = `export_${crypto.randomUUID()}`;

        // Record audit event
        await recordAccountAuditEvent(
          adminClient,
          user.id,
          user.id,
          'account_export_requested',
          { includeAuditEvents: body.includeAuditEvents, includeUsageRecords: body.includeUsageRecords },
        );

        return reply.send({
          ok: true,
          requestId,
          exportId,
          status: 'queued',
          downloadUrl: undefined,
          expiresAt: undefined,
        });
      } catch (err) {
        request.log.error({ requestId, err }, 'account export error');
        return reply.status(500).send({
          ok: false,
          requestId,
          error: {
            code: 'ACCOUNT_EXPORT_ERROR',
            message: 'An unexpected error occurred while requesting account export.',
            status: 500,
          },
        });
      }
    }
  );
};

export default accountPlugin;

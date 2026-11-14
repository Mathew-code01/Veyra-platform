import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { getSupabaseAdmin, getSupabaseUser } from '../../integrations/supabase/client.js';
import {
  getBackupMetadata,
  setBackupMetadata,
  deleteBackupMetadata,
  getConsentRecord,
  setConsentRecord,
} from './backup.service.js';
import { authenticateUser } from '../auth/auth.service.js';

const backupsPlugin: FastifyPluginAsync = async (fastify) => {
  // --- Get backup metadata ---
  fastify.get(
    '/backup/:category',
    async (request, reply) => {
      const requestId = request.id ?? 'unknown';
      const { category } = request.params as { category: string };

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
        const result = await getBackupMetadata(userClient, user.id, category);

        return reply.send({
          ok: true,
          requestId,
          backup: result,
        });
      } catch (err) {
        request.log.error({ requestId, err }, 'backup metadata error');
        return reply.status(500).send({
          ok: false,
          requestId,
          error: {
            code: 'BACKUP_ERROR',
            message: 'An unexpected error occurred while fetching backup metadata.',
            status: 500,
          },
        });
      }
    }
  );

  // --- Set backup metadata ---
  fastify.post(
    '/backup/:category',
    async (request, reply) => {
      const requestId = request.id ?? 'unknown';
      const { category } = request.params as { category: string };

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

      let body: { encryptionEnabled?: boolean; retentionDays?: number; status?: string };
      try {
        body = z.object({
          encryptionEnabled: z.boolean().optional(),
          retentionDays: z.number().int().positive().optional(),
          status: z.enum(['pending', 'active', 'paused', 'deleted']).optional(),
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

      try {
        const adminClient = getSupabaseAdmin();
        const result = await setBackupMetadata(adminClient, user.id, category, body);

        return reply.send({
          ok: true,
          requestId,
          backup: result,
        });
      } catch (err) {
        request.log.error({ requestId, err }, 'backup metadata set error');
        return reply.status(500).send({
          ok: false,
          requestId,
          error: {
            code: 'BACKUP_SET_ERROR',
            message: 'An unexpected error occurred while setting backup metadata.',
            status: 500,
          },
        });
      }
    }
  );

  // --- Delete backup metadata ---
  fastify.delete(
    '/backup/:category',
    async (request, reply) => {
      const requestId = request.id ?? 'unknown';
      const { category } = request.params as { category: string };

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
        await deleteBackupMetadata(adminClient, user.id, category);

        return reply.send({ ok: true, requestId });
      } catch (err) {
        request.log.error({ requestId, err }, 'backup delete error');
        return reply.status(500).send({
          ok: false,
          requestId,
          error: {
            code: 'BACKUP_DELETE_ERROR',
            message: 'An unexpected error occurred while deleting backup metadata.',
            status: 500,
          },
        });
      }
    }
  );

  // --- Get consent record ---
  fastify.get(
    '/consent/:category',
    async (request, reply) => {
      const requestId = request.id ?? 'unknown';
      const { category } = request.params as { category: string };

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
        const result = await getConsentRecord(userClient, user.id, category);

        return reply.send({
          ok: true,
          requestId,
          consent: result,
        });
      } catch (err) {
        request.log.error({ requestId, err }, 'consent error');
        return reply.status(500).send({
          ok: false,
          requestId,
          error: {
            code: 'CONSENT_ERROR',
            message: 'An unexpected error occurred while fetching consent record.',
            status: 500,
          },
        });
      }
    }
  );

  // --- Set consent record ---
  fastify.post(
    '/consent/:category',
    async (request, reply) => {
      const requestId = request.id ?? 'unknown';
      const { category } = request.params as { category: string };

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

      let body: { consentGiven: boolean };
      try {
        body = z.object({
          consentGiven: z.boolean(),
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

      try {
        const adminClient = getSupabaseAdmin();
        const result = await setConsentRecord(adminClient, user.id, category, body.consentGiven);

        return reply.send({
          ok: true,
          requestId,
          consent: result,
        });
      } catch (err) {
        request.log.error({ requestId, err }, 'consent set error');
        return reply.status(500).send({
          ok: false,
          requestId,
          error: {
            code: 'CONSENT_SET_ERROR',
            message: 'An unexpected error occurred while setting consent record.',
            status: 500,
          },
        });
      }
    }
  );
};

export default backupsPlugin;

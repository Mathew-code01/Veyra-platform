import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { createEmailProvider } from './email-provider.js';
import { authenticateUser } from '../auth/auth.service.js';

const notificationsPlugin: FastifyPluginAsync = async (fastify) => {
  // --- Send test notification (mock email provider) ---
  fastify.post(
    '/notify/test',
    async (request, reply) => {
      const requestId = request.id ?? 'unknown';

      let body: { to: string; subject: string; body: string };
      try {
        body = z.object({
          to: z.string().email(),
          subject: z.string().min(1),
          body: z.string().min(1),
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
        const provider = createEmailProvider('mock');
        const result = await provider.sendNotification({
          to: body.to,
          subject: body.subject,
          body: body.body,
          userName: user.email,
        });

        return reply.send({
          ok: true,
          requestId,
          messageId: result.messageId,
          provider: provider.name,
          isLive: provider.isLive,
        });
      } catch (err) {
        request.log.error({ requestId, err }, 'notification error');
        return reply.status(500).send({
          ok: false,
          requestId,
          error: {
            code: 'NOTIFICATION_ERROR',
            message: 'An unexpected error occurred while sending notification.',
            status: 500,
          },
        });
      }
    }
  );

  // --- Get notification provider status ---
  fastify.get(
    '/status',
    async (_request, reply) => {
      const provider = createEmailProvider('mock');

      return reply.send({
        ok: true,
        provider: provider.name,
        isLive: provider.isLive,
        liveEmailsEnabled: false,
        message: 'Mock email provider active. No real emails sent.',
      });
    }
  );
};

export default notificationsPlugin;

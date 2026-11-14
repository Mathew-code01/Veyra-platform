import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import {
  DeviceRegisterRequestSchema,
} from '../../../../../packages/contracts/src/index.ts';
import { getSupabaseAdmin, getSupabaseUser } from '../../integrations/supabase/client.js';
import {
  registerDevice,
  listDevices,
  authorizeDevice,
  revokeDevice,
  updateDeviceLastSeen,
} from './devices.service.js';
import { authenticateUser } from '../auth/auth.service.js';

const devicesPlugin: FastifyPluginAsync = async (fastify) => {
  // --- Register device ---
  fastify.post(
    '/register',
    async (request, reply) => {
      const requestId = request.id ?? 'unknown';

      let body: z.infer<typeof DeviceRegisterRequestSchema>;
      try {
        body = z.object({
          installationId: z.string().min(1),
          deviceName: z.string().min(1).max(100).optional(),
          platform: z.enum(['windows', 'macos', 'linux']).optional(),
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

        const result = await registerDevice(
          adminClient,
          user.id,
          body.installationId,
          body.deviceName,
          body.platform,
        );

        // Update last seen
        await updateDeviceLastSeen(adminClient, result.device.id);

        return reply.status(201).send({
          ok: true,
          requestId,
          device: result.device,
          deviceCredentialHash: result.deviceCredentialHash,
        });
      } catch (err) {
        request.log.error({ requestId, err }, 'device registration error');
        return reply.status(500).send({
          ok: false,
          requestId,
          error: {
            code: 'DEVICE_REGISTRATION_ERROR',
            message: 'An unexpected error occurred during device registration.',
            status: 500,
          },
        });
      }
    }
  );

  // --- List devices ---
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
        const result = await listDevices(userClient, user.id);

        return reply.send({
          ok: true,
          requestId,
          devices: result.devices,
        });
      } catch (err) {
        request.log.error({ requestId, err }, 'device list error');
        return reply.status(500).send({
          ok: false,
          requestId,
          error: {
            code: 'DEVICE_LIST_ERROR',
            message: 'An unexpected error occurred while listing devices.',
            status: 500,
          },
        });
      }
    }
  );

  // --- Authorize device (server-side, admin operation) ---
  fastify.patch(
    '/:deviceId/authorize',
    async (request, reply) => {
      const requestId = request.id ?? 'unknown';
      const { deviceId } = request.params as { deviceId: string };

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
        const result = await authorizeDevice(adminClient, deviceId);

        return reply.send({
          ok: true,
          requestId,
          device: result.device,
        });
      } catch (err) {
        request.log.error({ requestId, err }, 'device authorization error');
        return reply.status(500).send({
          ok: false,
          requestId,
          error: {
            code: 'DEVICE_AUTHORIZATION_ERROR',
            message: 'An unexpected error occurred during device authorization.',
            status: 500,
          },
        });
      }
    }
  );

  // --- Revoke device ---
  fastify.delete(
    '/:deviceId',
    async (request, reply) => {
      const requestId = request.id ?? 'unknown';
      const { deviceId } = request.params as { deviceId: string };

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
        const result = await revokeDevice(adminClient, deviceId, user.id);

        return reply.send({
          ok: true,
          requestId,
          device: result.device,
        });
      } catch (err) {
        request.log.error({ requestId, err }, 'device revocation error');
        return reply.status(500).send({
          ok: false,
          requestId,
          error: {
            code: 'DEVICE_REVOCATION_ERROR',
            message: 'An unexpected error occurred during device revocation.',
            status: 500,
          },
        });
      }
    }
  );

  // --- Update device last seen ---
  fastify.patch(
    '/:deviceId/last-seen',
    async (request, reply) => {
      const requestId = request.id ?? 'unknown';
      const { deviceId } = request.params as { deviceId: string };

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
        await updateDeviceLastSeen(adminClient, deviceId);

        return reply.send({ ok: true, requestId });
      } catch (err) {
        request.log.error({ requestId, err }, 'device last seen update error');
        return reply.status(500).send({
          ok: false,
          requestId,
          error: {
            code: 'DEVICE_LAST_SEEN_ERROR',
            message: 'An unexpected error occurred while updating last seen.',
            status: 500,
          },
        });
      }
    }
  );
};

export default devicesPlugin;

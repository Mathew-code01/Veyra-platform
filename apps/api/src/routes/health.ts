import type { FastifyPluginAsync } from 'fastify';
import { HealthResponseSchema, ReadinessResponseSchema, VersionResponseSchema } from '../../../../packages/contracts/src/index.ts';
import { getLogger } from '../lib/logger.ts';
import { buildServerConfig } from '../config/server.ts';

const healthPlugin: FastifyPluginAsync = async (fastify) => {
  const logger = getLogger();
  const config = buildServerConfig();
  const startTime = process.uptime() * 1000;

  fastify.get('/health', async (_request, reply) => {
    const requestId = _request.id ?? 'unknown';
    const dependencies = [
      { name: 'api', status: 'ok' as const, detail: 'service running' },
    ];
    const response = {
      ok: true,
      status: 'ok' as const,
      service: 'veyra-platform',
      version: '0.1.0',
      environment: config.nodeEnv,
      uptimeMs: process.uptime() * 1000 - startTime,
      dependencies,
      requestId,
    };
    const parsed = HealthResponseSchema.safeParse(response);
    if (!parsed.success) {
      return reply.status(500).send({ ok: false, requestId, error: { code: 'INTERNAL_ERROR', message: 'Health response malformed', status: 500 } });
    }
    logger.info({ requestId }, 'health check');
    return reply.send(parsed.data);
  });

  fastify.get('/ready', async (_request, reply) => {
    const requestId = _request.id ?? 'unknown';
    const response = {
      ok: true,
      status: 'ok' as const,
      service: 'veyra-platform',
      version: '0.1.0',
      environment: config.nodeEnv,
      uptimeMs: process.uptime() * 1000 - startTime,
      dependencies: [{ name: 'api', status: 'ok' as const, detail: 'service ready' }],
      requestId,
    };
    const parsed = ReadinessResponseSchema.safeParse(response);
    if (!parsed.success) {
      return reply.status(500).send({ ok: false, requestId, error: { code: 'INTERNAL_ERROR', message: 'Readiness response malformed', status: 500 } });
    }
    logger.info({ requestId }, 'readiness check');
    return reply.send(parsed.data);
  });

  fastify.get('/version', async (_request, reply) => {
    const requestId = _request.id ?? 'unknown';
    const response = {
      ok: true,
      service: 'veyra-platform',
      version: '0.1.0',
      apiVersion: config.apiVersion,
      requestId,
    };
    const parsed = VersionResponseSchema.safeParse(response);
    if (!parsed.success) {
      return reply.status(500).send({ ok: false, requestId, error: { code: 'INTERNAL_ERROR', message: 'Version response malformed', status: 500 } });
    }
    return reply.send(parsed.data);
  });
};

export default healthPlugin;

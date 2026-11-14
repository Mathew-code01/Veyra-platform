import fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import requestIdPlugin from './middleware/request-id.ts';
import errorHandlerPlugin from './middleware/error-handler.ts';
import healthPlugin from './routes/health.ts';
import { getLogger } from './lib/logger.ts';
import { buildServerConfig } from './config/server.ts';

export async function buildApp(): Promise<ReturnType<typeof fastify>> {
  const config = buildServerConfig();
  const logger = getLogger();

  const app = fastify({
    logger: false,
    requestIdHeader: config.requestIdHeader,
  });

  // Security headers
  await app.register(helmet, {
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
  });

  // CORS restricted to allowed origins
  await app.register(cors, {
    origin: config.allowedOrigins.length > 0 ? config.allowedOrigins : false,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['content-type', 'authorization', config.requestIdHeader],
    credentials: false,
  });

  // Rate limiting (global default, tightened per-route later)
  await app.register(rateLimit, {
    max: 100,
    timeWindow: 60 * 1000,
  });

  // Request ID + correlation
  await app.register(requestIdPlugin, { headerName: config.requestIdHeader });

  // Structured error handling
  await app.register(errorHandlerPlugin, { isProduction: config.isProduction });

  // Health / version routes (unauthenticated, no secrets)
  await app.register(healthPlugin, { prefix: '/api/v1' });

  // 404 handler (setNotFoundHandler avoids method conflicts with CORS)
  app.setNotFoundHandler((request, reply) => {
    const requestId = request.id ?? 'unknown';
    logger.warn({ requestId, url: request.url, method: request.method }, 'route not found');
    return reply.status(404).send({
      ok: false,
      requestId,
      error: { code: 'NOT_FOUND', message: 'Route not found', status: 404 },
    });
  });

  return app;
}

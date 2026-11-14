import type { FastifyPluginAsync } from 'fastify';
import { generateCorrelationId } from '../lib/correlation-id.ts';
import { getEnv } from '../config/env.ts';

interface RequestIdOptions {
  headerName?: string;
}

const requestIdPlugin: FastifyPluginAsync<RequestIdOptions> = async (fastify, opts) => {
  const env = getEnv();
  const headerName = opts.headerName ?? env.REQUEST_ID_HEADER;

  fastify.addHook('onRequest', async (request, reply) => {
    const incoming = (request.headers[headerName.toLowerCase()] as string | undefined) ?? '';
    const requestId = incoming && incoming.length > 0 ? incoming : generateCorrelationId();
    request.id = requestId;
    request.log = request.log.child({ requestId });
    reply.header(headerName, requestId);
  });
};

export default requestIdPlugin;

import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { ErrorResponseSchema } from '../../../../packages/contracts/src/index.ts';

interface ErrorHandlerOptions {
  isProduction?: boolean;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

const errorHandlerPlugin: FastifyPluginAsync<ErrorHandlerOptions> = async (fastify, opts) => {
  const isProduction = opts.isProduction ?? false;

  fastify.setErrorHandler((error, request, reply) => {
    const requestId = request.id ?? 'unknown';
    const log = request.log.child({ requestId, err: error });
    const errorFields = isRecord(error) ? error : {};

    let statusCode = 500;
    if (typeof errorFields.statusCode === 'number') {
      statusCode = errorFields.statusCode;
    }

    let code = 'INTERNAL_SERVER_ERROR';
    let message = 'An unexpected error occurred.';

    if (typeof errorFields.code === 'string') code = errorFields.code;
    if (error instanceof Error) message = error.message;
    else if (typeof errorFields.message === 'string') message = errorFields.message;

    if (errorFields.validation) {
      code = 'VALIDATION_ERROR';
      statusCode = 400;
      message = 'Request validation failed.';
    }

    const details: Record<string, unknown> | undefined = isProduction
      ? undefined
      : {
          ...(error instanceof Error ? { stack: error.stack } : {}),
          type: error instanceof Error ? error.constructor.name : typeof error,
        };

    const response = {
      ok: false,
      requestId,
      error: {
        code,
        message,
        status: statusCode,
        ...(details ? { details } : {}),
      },
    } as z.infer<typeof ErrorResponseSchema>;

    const parsed = ErrorResponseSchema.safeParse(response);
    if (!parsed.success) {
      return reply.status(500).send({
        ok: false,
        requestId,
        error: { code: 'INTERNAL_SERVER_ERROR', message: 'An unexpected error occurred.', status: 500 },
      });
    }

    log.warn({ statusCode, code, message }, 'handled error');
    return reply.status(statusCode).send(parsed.data);
  });
};

export default errorHandlerPlugin;

import pino from 'pino';

let loggerInstance: pino.Logger | null = null;

/**
 * Get or create a structured logger. Logs never include secrets, tokens, or
 * sensitive personal content. Sensitive fields are redacted by the serializers.
 */
export function getLogger(): pino.Logger {
  if (loggerInstance) return loggerInstance;

  const level = process.env.LOG_LEVEL ?? 'info';

  loggerInstance = pino({
    level,
    timestamp: true,
    base: null,
    redact: [
      'req.headers.authorization',
      'req.headers.cookie',
      'res.headers.set-cookie',
      'token',
      'access_token',
      'refresh_token',
      'password',
      'secret',
      'apiKey',
      'service_role_key',
      'stripe_secret_key',
      'webhook_secret',
      'email',
      'content',
    ],
    serializers: {
      req: (req: unknown) => {
        const r = req as { method?: string; url?: string; headers?: Record<string, string>; id?: string };
        return {
          id: r.id,
          method: r.method,
          url: r.url,
          headers: r.headers ? { ...r.headers, authorization: r.headers.authorization ? '[REDACTED]' : undefined } : undefined,
        };
      },
      res: (res: unknown) => {
        const r = res as { statusCode?: number; headers?: Record<string, string> };
        return { statusCode: r.statusCode, headers: r.headers };
      },
      err: pino.stdSerializers.err,
    },
  });

  return loggerInstance;
}

export function childLogger(bindings: Record<string, unknown>): pino.Logger {
  return getLogger().child(bindings);
}

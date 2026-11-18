import dotenv from 'dotenv';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildApp } from './app.ts';
import { loadEnv } from './config/env.ts';
import { buildServerConfig } from './config/server.ts';
import { getLogger } from './lib/logger.ts';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
dotenv.config({ path: resolve(projectRoot, '.env') });

async function main() {
  // 1. Validate environment before anything else. Fails fast with a clear error.
  loadEnv();

  const config = buildServerConfig();
  const logger = getLogger();

  logger.info({ service: 'veyra-platform', version: '0.1.0', env: config.nodeEnv }, 'starting server');

  const app = await buildApp();

  try {
    const host = process.env.HOST ?? (config.isProduction ? '0.0.0.0' : '127.0.0.1');
    await app.listen({ port: config.port, host });
    logger.info({ port: config.port, apiVersion: config.apiVersion }, 'server listening');
  } catch (err) {
    logger.fatal({ err }, 'failed to start server');
    process.exit(1);
  }
}

// Handle unexpected errors gracefully without leaking secrets
process.on('uncaughtException', (err) => {
  getLogger().fatal({ err }, 'uncaught exception');
  process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  getLogger().fatal({ err: reason }, 'unhandled rejection');
  process.exit(1);
});

main().catch((err) => {
  getLogger().fatal({ err }, 'startup failed');
  process.exit(1);
});

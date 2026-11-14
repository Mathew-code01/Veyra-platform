import { getEnv } from './env.ts';

export interface ServerConfig {
  port: number;
  nodeEnv: string;
  apiBaseUrl: string;
  apiVersion: string;
  requestIdHeader: string;
  allowedOrigins: string[];
  logLevel: string;
  isProduction: boolean;
  isDevelopment: boolean;
}

export function buildServerConfig(): ServerConfig {
  const env = getEnv();
  return {
    port: env.PORT,
    nodeEnv: env.NODE_ENV,
    apiBaseUrl: env.API_BASE_URL,
    apiVersion: env.API_VERSION,
    requestIdHeader: env.REQUEST_ID_HEADER,
    allowedOrigins: env.ALLOWED_ORIGINS.split(',').map((o: string) => o.trim()).filter(Boolean),
    logLevel: env.LOG_LEVEL,
    isProduction: env.NODE_ENV === 'production',
    isDevelopment: env.NODE_ENV === 'development',
  };
}

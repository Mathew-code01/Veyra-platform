import { createHash, timingSafeEqual } from 'node:crypto';
import type { FastifyPluginAsync, FastifyReply } from 'fastify';
import { z } from 'zod';
import {
  DesktopAuthTransactionAuthorizeRequestSchema,
  DesktopAuthTransactionCreateRequestSchema,
} from '../../../../../packages/contracts/src/index.ts';
import { getSupabaseAdmin } from '../../integrations/supabase/client.js';
import { authenticateUser } from './auth.service.js';

const TransactionIdSchema = z.string().uuid();
function digest(secret: string): string {
  return createHash('sha256').update(secret, 'utf8').digest('hex');
}

function matchesSecret(expectedHex: string, supplied: string | undefined): boolean {
  if (!supplied || !/^[A-Za-z0-9_-]{40,128}$/.test(supplied)) return false;
  const actual = Buffer.from(digest(supplied), 'hex');
  const expected = Buffer.from(expectedHex, 'hex');
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

function unauthorized(reply: FastifyReply, requestId: string) {
  return reply.status(401).send({ ok: false, requestId, error: { code: 'UNAUTHORIZED', message: 'Invalid or expired Desktop authorization transaction.', status: 401 } });
}

import { randomUUID } from 'node:crypto';

interface InMemoryTransaction {
  id: string;
  device_public_key: string;
  poll_secret_hash: string;
  status: 'pending' | 'authorized' | 'consumed' | 'cancelled';
  user_id?: string;
  session_envelope?: unknown;
  expires_at: string;
  authorized_at?: string;
  consumed_at?: string;
}

const inMemoryTransactions = new Map<string, InMemoryTransaction>();

function isTableMissing(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const code = (error as { code?: string }).code;
  const message = String((error as { message?: string }).message ?? '');
  return code === 'PGRST205' || message.includes('desktop_auth_transactions');
}

const desktopAuthPlugin: FastifyPluginAsync = async (fastify) => {
  // Desktop creates a short-lived transaction and keeps the poll secret and
  // private key in the Electron main process only.
  fastify.post('/transactions', {
    config: { rateLimit: { max: 12, timeWindow: 60_000 } },
  }, async (request, reply) => {
    const requestId = request.id ?? 'unknown';
    const parsed = DesktopAuthTransactionCreateRequestSchema.safeParse(request.body);
    if (!parsed.success) return reply.status(400).send({ ok: false, requestId, error: { code: 'VALIDATION_ERROR', message: 'Request validation failed.', status: 400 } });

    const admin = getSupabaseAdmin();
    const expiresAt = new Date(Date.now() + 10 * 60_000).toISOString();
    const { data, error } = await admin.from('desktop_auth_transactions')
      .insert({ device_public_key: parsed.data.devicePublicKey, poll_secret_hash: digest(parsed.data.pollSecret), expires_at: expiresAt })
      .select('id, expires_at').single();
    if (error || !data) {
      if (isTableMissing(error)) {
        const id = randomUUID();
        inMemoryTransactions.set(id, {
          id,
          device_public_key: parsed.data.devicePublicKey,
          poll_secret_hash: digest(parsed.data.pollSecret),
          status: 'pending',
          expires_at: expiresAt,
        });
        return reply.status(201).send({ ok: true, requestId, transactionId: id, expiresAt });
      }
      request.log.error({ requestId, code: error?.code }, 'desktop auth transaction creation failed');
      return reply.status(503).send({ ok: false, requestId, error: { code: 'DESKTOP_AUTH_UNAVAILABLE', message: 'Unable to start Desktop sign-in. Please try again.', status: 503 } });
    }
    // Cleanup is bounded and only removes expired short-lived handoff records.
    try { await admin.from('desktop_auth_transactions').delete().lt('expires_at', new Date().toISOString()); } catch { /* cleanup is opportunistic */ }
    return reply.status(201).send({ ok: true, requestId, transactionId: data.id, expiresAt: data.expires_at });
  });

  // Website uses this public key to encrypt the session only after an
  // authenticated user explicitly confirms the Desktop sign-in request.
  fastify.get('/transactions/:transactionId/browser', async (request, reply) => {
    const requestId = request.id ?? 'unknown';
    const params = z.object({ transactionId: TransactionIdSchema }).safeParse(request.params);
    if (!params.success) return reply.status(400).send({ ok: false, requestId, error: { code: 'VALIDATION_ERROR', message: 'Request validation failed.', status: 400 } });
    const admin = getSupabaseAdmin();
    let { data, error } = await admin.from('desktop_auth_transactions').select('device_public_key, status, expires_at').eq('id', params.data.transactionId).maybeSingle();
    if (isTableMissing(error) || !data) {
      const memoryTx = inMemoryTransactions.get(params.data.transactionId);
      if (memoryTx) {
        data = {
          device_public_key: memoryTx.device_public_key,
          status: memoryTx.status,
          expires_at: memoryTx.expires_at,
        };
      }
    }
    if (!data || data.status !== 'pending' || Date.parse(data.expires_at) <= Date.now()) return reply.status(410).send({ ok: false, requestId, error: { code: 'TRANSACTION_EXPIRED', message: 'This Desktop sign-in request expired. Start again in VEYRA Desktop.', status: 410 } });
    return reply.send({ ok: true, requestId, devicePublicKey: data.device_public_key, expiresAt: data.expires_at });
  });

  fastify.post('/transactions/:transactionId/authorize', {
    config: { rateLimit: { max: 8, timeWindow: 60_000 } },
  }, async (request, reply) => {
    const requestId = request.id ?? 'unknown';
    const params = z.object({ transactionId: TransactionIdSchema }).safeParse(request.params);
    if (!params.success) return reply.status(400).send({ ok: false, requestId, error: { code: 'VALIDATION_ERROR', message: 'Request validation failed.', status: 400 } });
    const authorization = request.headers.authorization;
    if (!authorization?.startsWith('Bearer ')) return reply.status(401).send({ ok: false, requestId, error: { code: 'UNAUTHORIZED', message: 'Sign in to authorize this Desktop request.', status: 401 } });
    const user = await authenticateUser(authorization.slice(7));
    if (!user) return reply.status(401).send({ ok: false, requestId, error: { code: 'UNAUTHORIZED', message: 'Your Website session expired. Sign in again.', status: 401 } });
    const body = DesktopAuthTransactionAuthorizeRequestSchema.safeParse(request.body);
    if (!body.success) return reply.status(400).send({ ok: false, requestId, error: { code: 'VALIDATION_ERROR', message: 'Request validation failed.', status: 400 } });

    const admin = getSupabaseAdmin();
    let { data, error } = await admin.from('desktop_auth_transactions')
      .update({ user_id: user.id, status: 'authorized', session_envelope: body.data.sessionEnvelope, authorized_at: new Date().toISOString() })
      .eq('id', params.data.transactionId).eq('status', 'pending').gt('expires_at', new Date().toISOString())
      .select('id').maybeSingle();
    if (error && isTableMissing(error)) {
      const memoryTx = inMemoryTransactions.get(params.data.transactionId);
      if (memoryTx && memoryTx.status === 'pending' && Date.parse(memoryTx.expires_at) > Date.now()) {
        memoryTx.status = 'authorized';
        memoryTx.user_id = user.id;
        memoryTx.session_envelope = body.data.sessionEnvelope;
        memoryTx.authorized_at = new Date().toISOString();
        data = { id: memoryTx.id };
        error = null;
      }
    }
    if (error) {
      request.log.error({ requestId, code: error.code }, 'desktop auth transaction authorization failed');
      return reply.status(503).send({ ok: false, requestId, error: { code: 'DESKTOP_AUTH_UNAVAILABLE', message: 'Unable to authorize Desktop sign-in right now.', status: 503 } });
    }
    if (!data) return reply.status(409).send({ ok: false, requestId, error: { code: 'TRANSACTION_NOT_PENDING', message: 'This Desktop sign-in request has expired or was already completed.', status: 409 } });
    return reply.send({ ok: true, requestId, authorized: true });
  });

  fastify.get('/transactions/:transactionId/status', async (request, reply) => {
    const requestId = request.id ?? 'unknown';
    const params = z.object({ transactionId: TransactionIdSchema }).safeParse(request.params);
    if (!params.success) return reply.status(400).send({ ok: false, requestId, error: { code: 'VALIDATION_ERROR', message: 'Request validation failed.', status: 400 } });
    const admin = getSupabaseAdmin();
    let { data, error } = await admin.from('desktop_auth_transactions').select('poll_secret_hash, status, expires_at').eq('id', params.data.transactionId).maybeSingle();
    if (isTableMissing(error) || !data) {
      const memoryTx = inMemoryTransactions.get(params.data.transactionId);
      if (memoryTx) {
        data = {
          poll_secret_hash: memoryTx.poll_secret_hash,
          status: memoryTx.status,
          expires_at: memoryTx.expires_at,
        };
      }
    }
    const pollSecret = request.headers['x-desktop-auth-poll-secret'];
    if (!data || !matchesSecret(data.poll_secret_hash, Array.isArray(pollSecret) ? pollSecret[0] : pollSecret)) return unauthorized(reply, requestId);
    const status = Date.parse(data.expires_at) <= Date.now() && data.status === 'pending' ? 'expired' : data.status;
    return reply.send({ ok: true, requestId, status });
  });

  // Atomic, one-time exchange. The encrypted payload is returned only with
  // proof of the transaction's high-entropy poll secret.
  fastify.post('/transactions/:transactionId/exchange', {
    config: { rateLimit: { max: 10, timeWindow: 60_000 } },
  }, async (request, reply) => {
    const requestId = request.id ?? 'unknown';
    const params = z.object({ transactionId: TransactionIdSchema }).safeParse(request.params);
    if (!params.success) return reply.status(400).send({ ok: false, requestId, error: { code: 'VALIDATION_ERROR', message: 'Request validation failed.', status: 400 } });
    const admin = getSupabaseAdmin();
    const headerSecret = request.headers['x-desktop-auth-poll-secret'];
    const secret = Array.isArray(headerSecret) ? headerSecret[0] : headerSecret;
    let { data: existing, error } = await admin.from('desktop_auth_transactions').select('poll_secret_hash, status, expires_at').eq('id', params.data.transactionId).maybeSingle();
    if (isTableMissing(error) || !existing) {
      const memoryTx = inMemoryTransactions.get(params.data.transactionId);
      if (memoryTx) {
        existing = {
          poll_secret_hash: memoryTx.poll_secret_hash,
          status: memoryTx.status,
          expires_at: memoryTx.expires_at,
        };
      }
    }
    if (!existing || !matchesSecret(existing.poll_secret_hash, secret)) return unauthorized(reply, requestId);
    if (existing.status !== 'authorized' || Date.parse(existing.expires_at) <= Date.now()) return reply.status(409).send({ ok: false, requestId, error: { code: 'TRANSACTION_NOT_READY', message: 'Desktop sign-in has not been authorized or has expired.', status: 409 } });

    let { data, error: updateError } = await admin.from('desktop_auth_transactions')
      .update({ status: 'consumed', consumed_at: new Date().toISOString() })
      .eq('id', params.data.transactionId).eq('status', 'authorized').gt('expires_at', new Date().toISOString())
      .select('session_envelope').maybeSingle();
    if (isTableMissing(updateError) || !data?.session_envelope) {
      const memoryTx = inMemoryTransactions.get(params.data.transactionId);
      if (memoryTx && memoryTx.status === 'authorized' && Date.parse(memoryTx.expires_at) > Date.now()) {
        memoryTx.status = 'consumed';
        memoryTx.consumed_at = new Date().toISOString();
        data = { session_envelope: memoryTx.session_envelope as Record<string, unknown> };
        updateError = null;
      }
    }
    if (updateError || !data?.session_envelope) {
      request.log.error({ requestId, code: updateError?.code }, 'desktop auth transaction exchange failed');
      return reply.status(409).send({ ok: false, requestId, error: { code: 'TRANSACTION_ALREADY_USED', message: 'This Desktop sign-in was already used. Start again in VEYRA Desktop.', status: 409 } });
    }
    return reply.send({ ok: true, requestId, sessionEnvelope: data.session_envelope });
  });

  fastify.delete('/transactions/:transactionId', async (request, reply) => {
    const requestId = request.id ?? 'unknown';
    const params = z.object({ transactionId: TransactionIdSchema }).safeParse(request.params);
    if (!params.success) return reply.status(400).send({ ok: false, requestId, error: { code: 'VALIDATION_ERROR', message: 'Request validation failed.', status: 400 } });
    const admin = getSupabaseAdmin();
    const headerSecret = request.headers['x-desktop-auth-poll-secret'];
    const secret = Array.isArray(headerSecret) ? headerSecret[0] : headerSecret;
    let { data: existing, error } = await admin.from('desktop_auth_transactions').select('poll_secret_hash, status').eq('id', params.data.transactionId).maybeSingle();
    if (isTableMissing(error) || !existing) {
      const memoryTx = inMemoryTransactions.get(params.data.transactionId);
      if (memoryTx) {
        existing = {
          poll_secret_hash: memoryTx.poll_secret_hash,
          status: memoryTx.status,
        };
      }
    }
    if (!existing || !matchesSecret(existing.poll_secret_hash, secret)) return unauthorized(reply, requestId);
    if (existing.status === 'pending') {
      await admin.from('desktop_auth_transactions').update({ status: 'cancelled' }).eq('id', params.data.transactionId).eq('status', 'pending');
      const memoryTx = inMemoryTransactions.get(params.data.transactionId);
      if (memoryTx && memoryTx.status === 'pending') memoryTx.status = 'cancelled';
    }
    return reply.send({ ok: true, requestId, cancelled: existing.status === 'pending' });
  });
};

export default desktopAuthPlugin;

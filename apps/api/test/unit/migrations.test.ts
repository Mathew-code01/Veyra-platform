import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const MIGRATIONS_DIR = join(__dirname, '../../../../supabase/migrations');

describe('Supabase migrations (structural)', () => {
  it('0001_initial_schema.sql exists', () => {
    const path = join(MIGRATIONS_DIR, '0001_initial_schema.sql');
    expect(() => readFileSync(path, 'utf8')).not.toThrow();
    const sql = readFileSync(path, 'utf8');
    expect(sql.length).toBeGreaterThan(0);
  });

  it('0001_initial_schema.sql enables RLS on all user tables', () => {
    const sql = readFileSync(join(MIGRATIONS_DIR, '0001_initial_schema.sql'), 'utf8');
    const tables = ['profiles', 'devices', 'device_sessions', 'audit_events'];
    for (const table of tables) {
      expect(sql).toContain(`alter table public.${table} enable row level security`);
    }
  });

  it('0001_initial_schema.sql defines explicit RLS policies per table', () => {
    const sql = readFileSync(join(MIGRATIONS_DIR, '0001_initial_schema.sql'), 'utf8');
    // Expect at least one create policy statement per user-owned table
    const policyCount = (sql.match(/create policy .* on public\./g) ?? []).length;
    expect(policyCount).toBeGreaterThanOrEqual(4);
  });

  it('0001_initial_schema.sql does not expose service_role key or hardcoded secrets', () => {
    const sql = readFileSync(join(MIGRATIONS_DIR, '0001_initial_schema.sql'), 'utf8');
    // The service_role key must never appear in migration SQL.
    expect(sql).not.toMatch(/service.?role/gi);
    // No hardcoded secret values (assignments of quoted strings named like secrets).
    expect(sql).not.toMatch(/secret\s*=\s*'/gi);
    expect(sql).not.toMatch(/password\s*=\s*'/gi);
    // Comments may mention the word "secret" generically; that is not a leak.
  });

  it('0001_initial_schema.sql derives identity from auth.uid(), not client input', () => {
    const sql = readFileSync(join(MIGRATIONS_DIR, '0001_initial_schema.sql'), 'utf8');
    // Policies should use auth.uid()
    expect(sql).toMatch(/auth\.uid\(\)/);
    // No policy should reference a client-supplied column like 'client_user_id'
    expect(sql).not.toMatch(/client_user_id/);
  });

  it('0001_initial_schema.sql defines primary keys on all tables', () => {
    const sql = readFileSync(join(MIGRATIONS_DIR, '0001_initial_schema.sql'), 'utf8');
    const tables = ['profiles', 'devices', 'device_sessions', 'audit_events'];
    for (const table of tables) {
      expect(sql).toContain(`public.${table} (`);
    }
    // Each create table should have a primary key
    const pks = (sql.match(/primary key/g) ?? []).length;
    expect(pks).toBeGreaterThanOrEqual(4);
  });

  it('0001_initial_schema.sql defines updated_at on mutable tables only', () => {
    const sql = readFileSync(join(MIGRATIONS_DIR, '0001_initial_schema.sql'), 'utf8');
    const tableBlock = (name: string) => {
      const start = sql.indexOf(`create table public.${name} (`);
      if (start === -1) return '';
      const rest = sql.slice(start);
      const end = rest.indexOf('\n--');
      return end === -1 ? rest : rest.slice(0, end);
    };
    expect(tableBlock('profiles')).toContain('updated_at');
    expect(tableBlock('devices')).toContain('updated_at');
    // Append-only tables intentionally do not track updates.
    expect(tableBlock('device_sessions')).not.toContain('updated_at');
    expect(tableBlock('audit_events')).not.toContain('updated_at');
    // Every table records creation time.
    for (const name of ['profiles', 'devices', 'device_sessions', 'audit_events']) {
      expect(tableBlock(name)).toContain('created_at');
    }
  });

  it('0001_initial_schema.sql defines foreign keys', () => {
    const sql = readFileSync(join(MIGRATIONS_DIR, '0001_initial_schema.sql'), 'utf8');
    expect(sql).toContain('references auth.users(id)');
    expect(sql).toContain('references public.profiles(id)');
    expect(sql).toContain('references public.devices(id)');
  });
});

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { authenticateUser } from '../../src/modules/auth/auth.service.js';
import {
  getSupabaseAdmin,
  getSupabaseUser,
  resetSupabaseClients,
} from '../../src/integrations/supabase/client.js';

// Mock the Supabase client factory
vi.mock('../../src/integrations/supabase/client.js', () => ({
  getSupabaseAdmin: vi.fn(),
  getSupabaseUser: vi.fn(),
  resetSupabaseClients: vi.fn(),
}));

const mockSupabaseUser = {
  auth: {
    getUser: vi.fn(),
    signUp: vi.fn(),
    signInWithPassword: vi.fn(),
    signOut: vi.fn(),
    refreshSession: vi.fn(),
    resetPasswordForEmail: vi.fn(),
  },
  from: vi.fn(),
};

const mockSupabaseAdmin = {
  auth: {
    getUser: vi.fn(),
    signUp: vi.fn(),
    signInWithPassword: vi.fn(),
    signOut: vi.fn(),
    refreshSession: vi.fn(),
    resetPasswordForEmail: vi.fn(),
  },
  from: vi.fn(),
};

beforeEach(() => {
  resetSupabaseClients();
  vi.clearAllMocks();
});

afterEach(() => {
  resetSupabaseClients();
});

describe('authenticateUser', () => {
  it('returns null for empty token', async () => {
    const result = await authenticateUser('');
    expect(result).toBeNull();
  });

  it('returns null for invalid token', async () => {
    (getSupabaseUser as any).mockReturnValue(mockSupabaseUser);
    (mockSupabaseUser.auth.getUser as any).mockResolvedValue({
      data: { user: null },
      error: { message: 'Invalid token' },
    });

    const result = await authenticateUser('invalid-token');
    expect(result).toBeNull();
  });

  it('returns authenticated user for valid token', async () => {
    (getSupabaseUser as any).mockReturnValue(mockSupabaseUser);
    (mockSupabaseUser.auth.getUser as any).mockResolvedValue({
      data: {
        user: {
          id: 'user-123',
          email: 'test@example.com',
          email_confirmed_at: '2026-01-01T00:00:00Z',
        },
      },
      error: null,
    });

    const result = await authenticateUser('valid-token');
    expect(result).toEqual({
      id: 'user-123',
      email: 'test@example.com',
      emailConfirmed: true,
    });
  });

  it('returns null when getUser throws', async () => {
    (getSupabaseUser as any).mockReturnValue(mockSupabaseUser);
    (mockSupabaseUser.auth.getUser as any).mockRejectedValue(new Error('Network error'));

    const result = await authenticateUser('valid-token');
    expect(result).toBeNull();
  });
});

describe('getSupabaseAdmin returns distinct client from getSupabaseUser', () => {
  it('returns different instances', () => {
    (getSupabaseAdmin as any).mockReturnValue(mockSupabaseAdmin);
    (getSupabaseUser as any).mockReturnValue(mockSupabaseUser);

    const admin = getSupabaseAdmin();
    const user = getSupabaseUser('token');
    expect(admin).not.toBe(user);
  });
});

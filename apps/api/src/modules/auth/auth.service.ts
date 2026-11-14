import { getSupabaseUser } from '../../integrations/supabase/client.js';
import { type AuthenticatedUser } from '../../../../../packages/contracts/src/index.ts';

/**
 * Extract and verify the authenticated user from a Supabase JWT.
 * Returns null if no valid token is provided or the token is invalid.
 * Never trusts client-supplied user IDs — identity comes from the verified JWT.
 */
export async function authenticateUser(accessToken: string): Promise<AuthenticatedUser | null> {
  if (!accessToken || accessToken.length === 0) {
    return null;
  }

  try {
    const supabase = getSupabaseUser(accessToken);
    const { data, error } = await supabase.auth.getUser();

    if (error || !data.user) {
      return null;
    }

    return {
      id: data.user.id,
      email: data.user.email ?? '',
      emailConfirmed: !!data.user.email_confirmed_at,
    };
  } catch {
    return null;
  }
}

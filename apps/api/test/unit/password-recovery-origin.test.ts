import { describe, expect, it } from 'vitest';
import { getPasswordRecoveryRedirectOrigin } from '../../src/modules/auth/password-recovery-origin.js';

describe('getPasswordRecoveryRedirectOrigin', () => {
  const allowlist = ['http://localhost:5173', 'https://veyra.example'];

  it('accepts an exact configured origin and normalizes a trailing path', () => {
    expect(getPasswordRecoveryRedirectOrigin('https://veyra.example/path', allowlist)).toBe('https://veyra.example');
  });

  it('rejects unconfigured and lookalike origins', () => {
    expect(getPasswordRecoveryRedirectOrigin('https://veyra.example.attacker.test', allowlist)).toBeNull();
    expect(getPasswordRecoveryRedirectOrigin('https://attacker.test', allowlist)).toBeNull();
  });

  it('fails closed for missing and malformed origins', () => {
    expect(getPasswordRecoveryRedirectOrigin(undefined, allowlist)).toBeNull();
    expect(getPasswordRecoveryRedirectOrigin('not a URL', allowlist)).toBeNull();
  });

  it('ignores malformed allowlist entries', () => {
    expect(getPasswordRecoveryRedirectOrigin('https://veyra.example', ['bad config', 'https://veyra.example'])).toBe('https://veyra.example');
  });
});
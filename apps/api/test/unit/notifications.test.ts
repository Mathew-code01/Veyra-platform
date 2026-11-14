import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MockEmailProvider, createEmailProvider } from '../../src/modules/notifications/email-provider.js';

describe('MockEmailProvider', () => {
  it('has correct name and is not live', () => {
    const provider = new MockEmailProvider();
    expect(provider.name).toBe('mock');
    expect(provider.isLive).toBe(false);
  });

  it('sends verification email', async () => {
    const provider = new MockEmailProvider();
    const result = await provider.sendVerificationEmail({
      to: 'test@example.com',
      verificationUrl: 'https://example.com/verify',
      userName: 'test',
    });
    expect(result.messageId).toBeDefined();
    expect(provider.getSentEmails().length).toBe(1);
  });

  it('sends password recovery email', async () => {
    const provider = new MockEmailProvider();
    const result = await provider.sendPasswordRecovery({
      to: 'test@example.com',
      recoveryUrl: 'https://example.com/recover',
    });
    expect(result.messageId).toBeDefined();
  });

  it('sends notification email', async () => {
    const provider = new MockEmailProvider();
    const result = await provider.sendNotification({
      to: 'test@example.com',
      subject: 'Test',
      body: 'Hello',
    });
    expect(result.messageId).toBeDefined();
  });

  it('sends security alert', async () => {
    const provider = new MockEmailProvider();
    const result = await provider.sendSecurityAlert({
      to: 'test@example.com',
      eventType: 'login',
      details: 'New login detected',
    });
    expect(result.messageId).toBeDefined();
  });

  it('clears sent emails', async () => {
    const provider = new MockEmailProvider();
    await provider.sendVerificationEmail({
      to: 'test@example.com',
      verificationUrl: 'https://example.com/verify',
    });
    expect(provider.getSentEmails().length).toBe(1);
    provider.clearSentEmails();
    expect(provider.getSentEmails().length).toBe(0);
  });
});

describe('createEmailProvider', () => {
  it('creates a mock provider', () => {
    const provider = createEmailProvider('mock');
    expect(provider.name).toBe('mock');
    expect(provider.isLive).toBe(false);
  });

  it('throws for unsupported provider', () => {
    expect(() => createEmailProvider('smtp' as any)).toThrow('Unsupported email provider');
  });
});

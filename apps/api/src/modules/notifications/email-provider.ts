/**
 * Email provider abstraction for Veyra Platform.
 *
 * Initially uses a mock/test adapter. No real emails are sent until the user
 * has configured a provider and approved the setup.
 */
export interface EmailProvider {
  name: string;
  isLive: boolean;

  sendVerificationEmail(params: {
    to: string;
    verificationUrl: string;
    userName?: string;
  }): Promise<{ messageId: string }>;

  sendPasswordRecovery(params: {
    to: string;
    recoveryUrl: string;
    userName?: string;
  }): Promise<{ messageId: string }>;

  sendNotification(params: {
    to: string;
    subject: string;
    body: string;
    userName?: string;
  }): Promise<{ messageId: string }>;

  sendSecurityAlert(params: {
    to: string;
    eventType: string;
    details: string;
    userName?: string;
  }): Promise<{ messageId: string }>;
}

/**
 * Mock email provider for development and testing.
 * No real emails are sent. Messages are logged internally only.
 */
export class MockEmailProvider implements EmailProvider {
  readonly name = 'mock';
  readonly isLive = false;

  private sentEmails: Array<{
    to: string;
    subject: string;
    body: string;
    timestamp: Date;
  }> = [];

  async sendVerificationEmail(params: {
    to: string;
    verificationUrl: string;
    userName?: string;
  }): Promise<{ messageId: string }> {
    const messageId = `mock_${crypto.randomUUID()}`;
    this.sentEmails.push({
      to: params.to,
      subject: 'Verify your email address',
      body: `Verify your email: ${params.verificationUrl}`,
      timestamp: new Date(),
    });
    return { messageId };
  }

  async sendPasswordRecovery(params: {
    to: string;
    recoveryUrl: string;
    userName?: string;
  }): Promise<{ messageId: string }> {
    const messageId = `mock_${crypto.randomUUID()}`;
    this.sentEmails.push({
      to: params.to,
      subject: 'Password recovery',
      body: `Recover your password: ${params.recoveryUrl}`,
      timestamp: new Date(),
    });
    return { messageId };
  }

  async sendNotification(params: {
    to: string;
    subject: string;
    body: string;
    userName?: string;
  }): Promise<{ messageId: string }> {
    const messageId = `mock_${crypto.randomUUID()}`;
    this.sentEmails.push({
      to: params.to,
      subject: params.subject,
      body: params.body,
      timestamp: new Date(),
    });
    return { messageId };
  }

  async sendSecurityAlert(params: {
    to: string;
    eventType: string;
    details: string;
    userName?: string;
  }): Promise<{ messageId: string }> {
    const messageId = `mock_${crypto.randomUUID()}`;
    this.sentEmails.push({
      to: params.to,
      subject: `Security alert: ${params.eventType}`,
      body: params.details,
      timestamp: new Date(),
    });
    return { messageId };
  }

  getSentEmails() {
    return this.sentEmails;
  }

  clearSentEmails() {
    this.sentEmails = [];
  }
}

import crypto from 'crypto';

/**
 * Create an email provider based on configuration.
 * Currently only mock is supported. Real providers can be added later.
 */
export function createEmailProvider(providerName: 'mock' | 'smtp' = 'mock'): EmailProvider {
  switch (providerName) {
    case 'mock':
      return new MockEmailProvider();
    default:
      throw new Error(`Unsupported email provider: ${providerName}`);
  }
}

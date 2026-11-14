/**
 * Paystack payment provider adapter.
 *
 * Implements the PaymentProvider interface using Paystack's REST API.
 * Test mode uses Paystack's test keys; live mode uses live keys.
 *
 * Paystack API documentation: https://paystack.com/docs/api
 *
 * All monetary amounts are in the smallest currency unit (kobo for NGN,
 * cents for USD, etc.).
 */

import crypto from 'crypto';
import { MockPaymentProvider } from './payment-provider.mock.js';

const PAYSTACK_BASE_URL = 'https://api.paystack.co';

/**
 * Paystack configuration.
 */
export interface PaystackConfig {
  secretKey: string;
  publicKey: string;
  webhookSecret: string;
  isLive: boolean;
}

/**
 * Paystack payment provider implementation.
 */
export class PaystackProvider {
  readonly name = 'paystack';
  readonly isLive: boolean;

  private secretKey: string;
  private webhookSecret: string;

  constructor(config: PaystackConfig) {
    this.secretKey = config.secretKey;
    this.webhookSecret = config.webhookSecret;
    this.isLive = config.isLive;
    // publicKey is available via config.publicKey for frontend use
    void config.publicKey;
  }

  /**
   * Make a request to the Paystack API.
   */
  private async request<T>(
    method: 'GET' | 'POST' | 'PUT',
    path: string,
    body?: unknown,
  ): Promise<T> {
    const url = `${PAYSTACK_BASE_URL}${path}`;
    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.secretKey}`,
      'Content-Type': 'application/json',
    };

    const res = await fetch(url, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });

    const data: unknown = await res.json().catch(() => ({}));

    if (!res.ok) {
      const errorMessage = (data as { message?: string }).message || `Paystack API error (${res.status})`;
      throw new Error(errorMessage);
    }

    return data as T;
  }

  // -----------------------------------------------------------------------
  // Customer management
  // -----------------------------------------------------------------------

  async createCustomer(email: string, metadata?: Record<string, string>): Promise<{ customerId: string }> {
    const data = await this.request<{
      status: boolean;
      data: { customer_code: string; email: string };
    }>('POST', '/customer', {
      email,
      first_name: '',
      last_name: '',
      phone: '',
      metadata,
    });

    if (!data.status || !data.data) {
      throw new Error('Paystack customer creation failed');
    }

    return { customerId: data.data.customer_code };
  }

  async getCustomer(customerId: string): Promise<{ customerId: string; email: string } | null> {
    try {
      const data = await this.request<{
        status: boolean;
        data: { customer_code: string; email: string };
      }>('GET', `/customer/${customerId}`);

      if (!data.status || !data.data) {
        return null;
      }

      return { customerId: data.data.customer_code, email: data.data.email };
    } catch {
      return null;
    }
  }

  // -----------------------------------------------------------------------
  // Checkout / Transaction initialization
  // -----------------------------------------------------------------------

  async createCheckoutSession(params: {
    customerId: string;
    priceId: string;
    successUrl: string;
    cancelUrl: string;
    metadata?: Record<string, string>;
  }): Promise<{ checkoutUrl: string; sessionId: string }> {
    // Parse priceId to extract amount and currency
    // priceId format: "planId" or "amount:currency"
    const [amountStr, currency = 'NGN'] = params.priceId.split(':');
    const amount = parseInt(amountStr, 10);

    if (isNaN(amount) || amount <= 0) {
      throw new Error('Invalid amount');
    }

    const data = await this.request<{
      status: boolean;
      data: {
        access_code: string;
        authorization_url: string;
        reference: string;
      };
    }>('POST', '/transaction/initialize', {
      customer: params.customerId,
      amount,
      currency,
      callback_url: params.successUrl,
      metadata: {
        ...params.metadata,
        cancel_url: params.cancelUrl,
      },
    });

    if (!data.status || !data.data) {
      throw new Error('Paystack checkout session creation failed');
    }

    return {
      checkoutUrl: data.data.authorization_url,
      sessionId: data.data.reference,
    };
  }

  // -----------------------------------------------------------------------
  // Transaction verification
  // -----------------------------------------------------------------------

  async verifyTransaction(reference: string): Promise<{
    status: string;
    amount: number;
    currency: string;
    customerEmail: string;
    reference: string;
    paidAt: string | null;
  }> {
    const data = await this.request<{
      status: boolean;
      data: {
        status: string;
        amount: number;
        currency: string;
        customer: { email: string };
        reference: string;
        paid_at: string | null;
      };
    }>('GET', `/transaction/verify/${reference}`);

    if (!data.status || !data.data) {
      throw new Error('Paystack transaction verification failed');
    }

    return {
      status: data.data.status,
      amount: data.data.amount,
      currency: data.data.currency,
      customerEmail: data.data.customer.email,
      reference: data.data.reference,
      paidAt: data.data.paid_at,
    };
  }

  async getTransaction(reference: string): Promise<{
    status: string;
    amount: number;
    currency: string;
    reference: string;
  } | null> {
    try {
      const result = await this.verifyTransaction(reference);
      return {
        status: result.status,
        amount: result.amount,
        currency: result.currency,
        reference: result.reference,
      };
    } catch {
      return null;
    }
  }

  // -----------------------------------------------------------------------
  // Subscription management
  // -----------------------------------------------------------------------

  async createSubscription(params: {
    customerId: string;
    priceId: string;
    billingInterval: 'monthly' | 'yearly';
    paymentMethodId?: string;
    trialEnd?: Date;
  }): Promise<{
    subscriptionId: string;
    status: string;
    currentPeriodStart: Date;
    currentPeriodEnd: Date;
    cancelAtPeriodEnd: boolean;
  }> {
    // Parse priceId for plan code or amount
    const [planCode] = params.priceId.split(':');

    const data = await this.request<{
      status: boolean;
      data: {
        subscription_code: string;
        status: string;
        start_date: string;
        next_payment_date: string;
      };
    }>('POST', '/subscription', {
      customer: params.customerId,
      plan: planCode,
      authorization: params.paymentMethodId,
      ...(params.trialEnd ? { trial_end: params.trialEnd.toISOString() } : {}),
    });

    if (!data.status || !data.data) {
      throw new Error('Paystack subscription creation failed');
    }

    const startDate = new Date(data.data.start_date);
    const nextPaymentDate = new Date(data.data.next_payment_date);

    return {
      subscriptionId: data.data.subscription_code,
      status: data.data.status,
      currentPeriodStart: startDate,
      currentPeriodEnd: nextPaymentDate,
      cancelAtPeriodEnd: false,
    };
  }

  async cancelSubscription(subscriptionId: string, _atPeriodEnd = true): Promise<{ status: string }> {
    const data = await this.request<{
      status: boolean;
      data: { status: string };
    }>('POST', '/subscription/disable', {
      code: subscriptionId,
      token: '', // Would need email token in production
    });

    if (!data.status) {
      throw new Error('Paystack subscription cancellation failed');
    }

    return { status: data.data.status };
  }

  async reactivateSubscription(subscriptionId: string): Promise<{ status: string }> {
    const data = await this.request<{
      status: boolean;
      data: { status: string };
    }>('POST', '/subscription/enable', {
      code: subscriptionId,
      token: '', // Would need email token in production
    });

    if (!data.status) {
      throw new Error('Paystack subscription reactivation failed');
    }

    return { status: data.data.status };
  }

  // -----------------------------------------------------------------------
  // Webhook verification
  // -----------------------------------------------------------------------

  verifyWebhookSignature(payload: string, signature: string): boolean {
    if (!signature || !this.webhookSecret) {
      return false;
    }

    const expected = crypto
      .createHmac('sha512', this.webhookSecret)
      .update(payload)
      .digest('hex');

    // Constant-time comparison to prevent timing attacks
    return timingSafeEqual(expected, signature);
  }

  async constructWebhookEvent(payload: string, signature: string): Promise<{
    id: string;
    type: string;
    data: unknown;
  }> {
    if (!this.verifyWebhookSignature(payload, signature)) {
      throw new Error('Invalid Paystack webhook signature');
    }

    try {
      const parsed = JSON.parse(payload);
      return {
        id: parsed.event || parsed.data?.reference || crypto.randomUUID(),
        type: parsed.event || 'transaction.charge',
        data: parsed.data || parsed,
      };
    } catch {
      return {
        id: crypto.randomUUID(),
        type: 'unknown',
        data: {},
      };
    }
  }

  // -----------------------------------------------------------------------
  // Refunds
  // -----------------------------------------------------------------------

  async refundTransaction(transactionId: string, amountCents?: number): Promise<{ status: string }> {
    const data = await this.request<{
      status: boolean;
      data: { status: string };
    }>('POST', '/refund', {
      transaction: transactionId,
      amount: amountCents,
    });

    if (!data.status) {
      throw new Error('Paystack refund failed');
    }

    return { status: data.data.status };
  }
}

/**
 * Constant-time string comparison to prevent timing attacks.
 */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) {
    return false;
  }

  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }

  return result === 0;
}

/**
 * Create a payment provider based on configuration.
 * Supports 'mock' (for tests) and 'paystack' (production).
 */
export function createPaymentProvider(
  providerName: 'mock' | 'paystack' = 'mock',
  config?: {
    secretKey?: string;
    publicKey?: string;
    webhookSecret?: string;
    isLive?: boolean;
  },
): { name: string; isLive: boolean } & {
  createCustomer: (email: string, metadata?: Record<string, string>) => Promise<{ customerId: string }>;
  getCustomer: (customerId: string) => Promise<{ customerId: string; email: string } | null>;
  createCheckoutSession: (params: {
    customerId: string;
    priceId: string;
    successUrl: string;
    cancelUrl: string;
    metadata?: Record<string, string>;
  }) => Promise<{ checkoutUrl: string; sessionId: string }>;
  createSubscription: (params: {
    customerId: string;
    priceId: string;
    billingInterval: 'monthly' | 'yearly';
    paymentMethodId?: string;
    trialEnd?: Date;
  }) => Promise<{
    subscriptionId: string;
    status: string;
    currentPeriodStart: Date;
    currentPeriodEnd: Date;
    cancelAtPeriodEnd: boolean;
  }>;
  cancelSubscription: (subscriptionId: string, atPeriodEnd?: boolean) => Promise<{ status: string }>;
  reactivateSubscription: (subscriptionId: string) => Promise<{ status: string }>;
  verifyWebhookSignature: (payload: string, signature: string) => boolean;
  constructWebhookEvent: (payload: string, signature: string) => Promise<{
    id: string;
    type: string;
    data: unknown;
  }>;
  refundTransaction: (transactionId: string, amountCents?: number) => Promise<{ status: string }>;
} {
  switch (providerName) {
    case 'mock': {
      return new MockPaymentProvider();
    }
    case 'paystack': {
      if (!config?.secretKey || !config?.webhookSecret) {
        throw new Error('Paystack requires secretKey and webhookSecret configuration');
      }
      return new PaystackProvider({
        secretKey: config.secretKey,
        publicKey: config.publicKey ?? '',
        webhookSecret: config.webhookSecret,
        isLive: config.isLive ?? false,
      });
    }
    default:
      throw new Error(`Unsupported payment provider: ${providerName}`);
  }
}

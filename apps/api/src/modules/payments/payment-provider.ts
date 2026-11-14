import crypto from 'crypto';

/**
 * Payment provider abstraction interface.
 * Allows a payment provider to be selected later without rewriting subscription logic.
 *
 * Initially uses a mock/test adapter. No live payment mode is activated.
 */
export interface PaymentProvider {
  name: string;
  isLive: boolean;

  // Customer management
  createCustomer(email: string, metadata?: Record<string, string>): Promise<{ customerId: string }>;
  getCustomer(customerId: string): Promise<{ customerId: string; email: string } | null>;

  // Checkout
  createCheckoutSession(params: {
    customerId: string;
    priceId: string;
    successUrl: string;
    cancelUrl: string;
    metadata?: Record<string, string>;
  }): Promise<{ checkoutUrl: string; sessionId: string }>;

  // Subscription management
  createSubscription(params: {
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
  }>;

  cancelSubscription(subscriptionId: string, atPeriodEnd?: boolean): Promise<{ status: string }>;
  reactivateSubscription(subscriptionId: string): Promise<{ status: string }>;

  // Webhook verification
  verifyWebhookSignature(payload: string, signature: string): boolean;
  constructWebhookEvent(payload: string, signature: string): Promise<{
    id: string;
    type: string;
    data: unknown;
  }>;

  // Refunds
  refundTransaction(transactionId: string, amountCents?: number): Promise<{ status: string }>;
}

/**
 * Mock payment provider for development and testing.
 * No real charges are created. All operations succeed deterministically.
 */
export class MockPaymentProvider implements PaymentProvider {
  readonly name = 'mock';
  readonly isLive = false;

  private customers = new Map<string, { id: string; email: string }>();
  private checkouts = new Map<string, { url: string; id: string }>();
  private subscriptions = new Map<string, any>();
  private transactions = new Map<string, any>();

  private id(prefix: string): string {
    return `${prefix}_${crypto.randomUUID()}`;
  }

  async createCustomer(email: string, _metadata?: Record<string, string>): Promise<{ customerId: string }> {
    const customerId = this.id('cus_mock');
    this.customers.set(customerId, { id: customerId, email });
    return { customerId };
  }

  async getCustomer(customerId: string): Promise<{ customerId: string; email: string } | null> {
    const c = this.customers.get(customerId);
    return c ? { customerId: c.id, email: c.email } : null;
  }

  async createCheckoutSession(_params: {
    customerId: string;
    priceId: string;
    successUrl: string;
    cancelUrl: string;
    _metadata?: Record<string, string>;
  }): Promise<{ checkoutUrl: string; sessionId: string }> {
    const sessionId = this.id('cs_mock');
    const checkoutUrl = `https://mock-payment-provider.dev/checkout/${sessionId}`;
    this.checkouts.set(sessionId, { url: checkoutUrl, id: sessionId });
    return { checkoutUrl, sessionId };
  }

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
    const subscriptionId = this.id('sub_mock');
    const now = new Date();
    const periodEnd = new Date(
      now.getFullYear(),
      now.getMonth() + (params.billingInterval === 'yearly' ? 12 : 1),
      now.getDate()
    );

    this.subscriptions.set(subscriptionId, {
      id: subscriptionId,
      customerId: params.customerId,
      priceId: params.priceId,
      billingInterval: params.billingInterval,
      status: params.trialEnd ? 'trialing' : 'active',
      currentPeriodStart: now,
      currentPeriodEnd: periodEnd,
      cancelAtPeriodEnd: false,
      trialEnd: params.trialEnd,
    });

    return {
      subscriptionId,
      status: params.trialEnd ? 'trialing' : 'active',
      currentPeriodStart: now,
      currentPeriodEnd: periodEnd,
      cancelAtPeriodEnd: false,
    };
  }

  async cancelSubscription(subscriptionId: string, atPeriodEnd = true): Promise<{ status: string }> {
    const sub = this.subscriptions.get(subscriptionId);
    if (!sub) throw new Error('Subscription not found');
    sub.cancelAtPeriodEnd = atPeriodEnd;
    sub.status = atPeriodEnd ? 'active' : 'canceled';
    return { status: sub.status };
  }

  async reactivateSubscription(subscriptionId: string): Promise<{ status: string }> {
    const sub = this.subscriptions.get(subscriptionId);
    if (!sub) throw new Error('Subscription not found');
    sub.cancelAtPeriodEnd = false;
    sub.status = 'active';
    return { status: sub.status };
  }

  verifyWebhookSignature(_payload: string, _signature: string): boolean {
    // Mock: accept any signature for test webhooks
    return true;
  }

  async constructWebhookEvent(_payload: string, _signature: string): Promise<{
    id: string;
    type: string;
    data: unknown;
  }> {
    // Mock: parse a simple JSON payload
    try {
      const parsed = JSON.parse(_payload);
      return {
        id: parsed.id || this.id('evt_mock'),
        type: parsed.type || 'mock.event',
        data: parsed.data || parsed,
      };
    } catch {
      return {
        id: this.id('evt_mock'),
        type: 'mock.event',
        data: {},
      };
    }
  }

  async refundTransaction(_transactionId: string, _amountCents?: number): Promise<{ status: string }> {
    const tx = this.transactions.get(_transactionId);
    if (!tx) throw new Error('Transaction not found');
    tx.status = 'refunded';
    return { status: 'refunded' };
  }
}

/**
 * Create a payment provider based on configuration.
 * Currently only mock is supported. Stripe and other providers can be added later.
 */
export function createPaymentProvider(providerName: 'mock' | 'stripe' = 'mock'): PaymentProvider {
  switch (providerName) {
    case 'mock':
      return new MockPaymentProvider();
    default:
      throw new Error(`Unsupported payment provider: ${providerName}`);
  }
}

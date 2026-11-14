/**
 * Mock payment provider for development and testing.
 * No real charges are created. All operations succeed deterministically.
 */
import crypto from 'crypto';

export class MockPaymentProvider {
  readonly name = 'mock';
  readonly isLive = false;

  private customers = new Map<string, { id: string; email: string }>();
  private checkouts = new Map<string, { url: string; id: string }>();
  private subscriptions = new Map<string, any>();
  private transactions = new Map<string, any>();

  private id(prefix: string): string {
    return `${prefix}_${crypto.randomUUID()}`;
  }

  async createCustomer(email: string): Promise<{ customerId: string }> {
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
    metadata?: Record<string, string>;
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

  async cancelSubscription(subscriptionId: string, _atPeriodEnd = true): Promise<{ status: string }> {
    const sub = this.subscriptions.get(subscriptionId);
    if (!sub) throw new Error('Subscription not found');
    sub.cancelAtPeriodEnd = _atPeriodEnd;
    sub.status = _atPeriodEnd ? 'active' : 'canceled';
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

  getSentEmails?() {
    return [];
  }

  clearSentEmails?() {
    // no-op
  }
}

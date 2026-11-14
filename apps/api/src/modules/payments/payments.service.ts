import { getSupabaseAdmin } from '../../integrations/supabase/client.js';
import { getEnv } from '../../config/env.js';
import { createPaymentProvider } from './payment-provider.js';

function getPaymentProviderConfig() {
  const env = getEnv();
  const providerName = env.PAYMENT_PROVIDER ?? 'mock';

  if (providerName === 'paystack') {
    return {
      providerName: 'paystack' as const,
      config: {
        secretKey: env.PAYSTACK_SECRET_KEY ?? '',
        publicKey: env.PAYSTACK_PUBLIC_KEY ?? '',
        webhookSecret: env.PAYSTACK_WEBHOOK_SECRET ?? '',
        isLive: env.PAYMENTS_LIVE_ENABLED === 'true',
      },
    };
  }

  return { providerName: 'mock' as const };
}

/**
 * Create a checkout session for a subscription.
 * Returns a checkout URL that redirects the user to the payment provider.
 */
export async function createCheckoutSession(
  adminClient: ReturnType<typeof getSupabaseAdmin>,
  userId: string,
  planId: string,
  billingInterval: 'monthly' | 'yearly',
  successUrl: string,
  cancelUrl: string,
) {
  // Get or create payment customer
  const { data: customer, error: customerError } = await adminClient
    .from('payment_customers')
    .select('provider_customer_id')
    .eq('user_id', userId)
    .single();

  let providerCustomerId: string;
  if (customerError || !customer) {
    const { providerName, config } = getPaymentProviderConfig();
    const provider = createPaymentProvider(providerName, config);
    const { customerId } = await provider.createCustomer(`user-${userId}`, { userId });
    providerCustomerId = customerId;

    await adminClient
      .from('payment_customers')
      .insert({ user_id: userId, provider_customer_id: providerCustomerId, provider: providerName });
  } else {
    providerCustomerId = customer.provider_customer_id;
  }

  // Get plan for price reference
  const { data: plan, error: planError } = await adminClient
    .from('plans')
    .select('id, price_cents')
    .eq('id', planId)
    .single();

  if (planError || !plan) throw new Error('Plan not found');

  // Create checkout session in payment provider
  const { providerName: checkoutProviderName, config: checkoutConfig } = getPaymentProviderConfig();
  const checkoutProvider = createPaymentProvider(checkoutProviderName, checkoutConfig);
  const { checkoutUrl, sessionId } = await checkoutProvider.createCheckoutSession({
    customerId: providerCustomerId,
    priceId: plan.price_cents > 0 ? `${plan.price_cents}:USD` : '0:USD',
    successUrl,
    cancelUrl,
    metadata: { userId, planId, billingInterval },
  });

  return { checkoutUrl, sessionId };
}

/**
 * Process a webhook event from the payment provider.
 * Events are persisted for idempotency and duplicate protection.
 * Subscription state transitions are driven by verified webhook events only.
 */
export async function processWebhookEvent(
  adminClient: ReturnType<typeof getSupabaseAdmin>,
  provider: string,
  eventId: string,
  eventType: string,
  payload: unknown,
  signature: string,
) {
  // Get payment provider config for webhook signature verification
  const { providerName: webhookProviderName, config: webhookConfig } = getPaymentProviderConfig();
  const webhookProvider = createPaymentProvider(webhookProviderName, webhookConfig);

  // Verify webhook signature using provider-specific verification
  if (!webhookProvider.verifyWebhookSignature(JSON.stringify(payload), signature)) {
    throw new Error('Invalid webhook signature');
  }

  // Check idempotency - skip already processed events
  const { data: existing } = await adminClient
    .from('webhook_events')
    .select('id, processed')
    .eq('provider', provider)
    .eq('event_id', eventId)
    .single();

  if (existing?.processed) {
    return { processed: false, reason: 'Duplicate event already processed' };
  }

  // Persist webhook event
  const { data: webhookEvent, error: insertError } = await adminClient
    .from('webhook_events')
    .insert({
      provider,
      event_id: eventId,
      event_type: eventType,
      payload: payload as any,
      processed: false,
    })
    .select()
    .single();

  if (insertError) throw insertError;

  // Process the event based on type
  switch (eventType) {
    case 'checkout.session.completed':
      await handleCheckoutCompleted(adminClient, payload as any);
      break;
    case 'customer.subscription.updated':
      await handleSubscriptionUpdated(adminClient, payload as any);
      break;
    case 'customer.subscription.deleted':
      await handleSubscriptionDeleted(adminClient, payload as any);
      break;
    case 'invoice.payment_failed':
      await handlePaymentFailed(adminClient, payload as any);
      break;
    case 'invoice.payment_succeeded':
      await handlePaymentSucceeded(adminClient, payload as any);
      break;
    default:
      // Unknown event type, just acknowledge
      break;
  }

  // Mark as processed
  await adminClient
    .from('webhook_events')
    .update({ processed: true, processed_at: new Date().toISOString() })
    .eq('id', webhookEvent.id);

  return { processed: true, eventId };
}

async function handleCheckoutCompleted(adminClient: ReturnType<typeof getSupabaseAdmin>, data: any) {
  // Checkout completed - create or update subscription
  const subscriptionId = data.subscription;
  const customerId = data.customer;

  // Find our payment customer
  const { data: customer } = await adminClient
    .from('payment_customers')
    .select('user_id')
    .eq('provider_customer_id', customerId)
    .single();

  if (!customer) return;

  // Find our subscription by provider reference
  const { data: sub } = await adminClient
    .from('subscriptions')
    .select('id, status')
    .eq('provider_subscription_id', subscriptionId)
    .single();

  if (sub) {
    await adminClient
      .from('subscriptions')
      .update({ status: 'active' })
      .eq('id', sub.id);
  }
}

async function handleSubscriptionUpdated(adminClient: ReturnType<typeof getSupabaseAdmin>, data: any) {
  const subscriptionId = data.id;
  const status = data.status;

  await adminClient
    .from('subscriptions')
    .update({ status })
    .eq('provider_subscription_id', subscriptionId);
}

async function handleSubscriptionDeleted(adminClient: ReturnType<typeof getSupabaseAdmin>, data: any) {
  const subscriptionId = data.id;

  await adminClient
    .from('subscriptions')
    .update({ status: 'canceled', cancel_at_period_end: true })
    .eq('provider_subscription_id', subscriptionId);
}

async function handlePaymentFailed(adminClient: ReturnType<typeof getSupabaseAdmin>, data: any) {
  const subscriptionId = data.subscription;

  await adminClient
    .from('subscriptions')
    .update({ status: 'past_due' })
    .eq('provider_subscription_id', subscriptionId);
}

async function handlePaymentSucceeded(adminClient: ReturnType<typeof getSupabaseAdmin>, data: any) {
  const subscriptionId = data.subscription;

  await adminClient
    .from('subscriptions')
    .update({ status: 'active' })
    .eq('provider_subscription_id', subscriptionId);
}

/**
 * Reconciliation: sync subscription status from payment provider.
 * Called periodically to ensure our DB matches provider state.
 */
export async function reconcileSubscriptions(
  adminClient: ReturnType<typeof getSupabaseAdmin>,
) {
  // In a real implementation, this would list all subscriptions from the payment provider
  // and compare with our database. For mock, this returns the count of subscriptions.
  const { data: subscriptions, error } = await adminClient
    .from('subscriptions')
    .select('id, provider_subscription_id, status');

  if (error) throw error;

  return {
    reconciled: (subscriptions ?? []).length,
    subscriptions: (subscriptions ?? []).map((s) => ({
      id: s.id,
      providerSubscriptionId: s.provider_subscription_id,
      status: s.status,
    })),
  };
}

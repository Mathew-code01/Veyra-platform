import { getSupabaseAdmin } from '../../integrations/supabase/client.js';
import { createPaymentProvider } from './payment-provider.js';

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
    const provider = createPaymentProvider('mock');
    const { customerId } = await provider.createCustomer(`user-${userId}`, { userId });
    providerCustomerId = customerId;

    await adminClient
      .from('payment_customers')
      .insert({ user_id: userId, provider_customer_id: providerCustomerId, provider: 'mock' });
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
  const provider = createPaymentProvider('mock');
  const { checkoutUrl, sessionId } = await provider.createCheckoutSession({
    customerId: providerCustomerId,
    priceId: `price_${planId}`,
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
  // Verify webhook signature
  const paymentProvider = createPaymentProvider('mock');
  if (!paymentProvider.verifyWebhookSignature(JSON.stringify(payload), signature)) {
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

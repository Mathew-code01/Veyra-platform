import { getSupabaseAdmin, getSupabaseUser } from '../../integrations/supabase/client.js';
import { getEnv } from '../../config/env.js';
import { createPaymentProvider } from './payment-provider.js';

export function getPaymentProviderConfig() {
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
  userEmail: string,
  planId: string,
  billingInterval: 'monthly' | 'yearly',
  currency: string,
  successUrl: string,
  cancelUrl: string,
) {
  const env = getEnv();
  if (env.PAYMENTS_MODE !== 'test' || env.PAYMENTS_LIVE_ENABLED !== 'false') {
    throw new Error('Checkout is restricted to test mode until production payments are explicitly approved.');
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(userEmail)) throw new Error('A verified account email is required for checkout.');

  const normalizedCurrency = currency.toUpperCase();
  if (!/^[A-Z]{3}$/.test(normalizedCurrency)) throw new Error('Unsupported billing currency.');

  // Get plan for price reference
  const { data: plan, error: planError } = await adminClient
    .from('plans')
    .select('id, family, is_active, is_published, is_dev_fixture')
    .eq('id', planId)
    .eq('is_active', true)
    .eq('is_published', true)
    .eq('is_dev_fixture', false)
    .eq('family', 'cloud')
    .single();

  if (planError || !plan) throw new Error('Plan not found');

  const { data: planPrice, error: priceError } = await adminClient
    .from('plan_prices')
    .select('price_cents, currency, billing_interval, is_active, provider_price_id')
    .eq('plan_id', planId)
    .eq('billing_interval', billingInterval)
    .eq('currency', normalizedCurrency)
    .eq('is_active', true)
    .gt('price_cents', 0)
    .single();

  if (priceError || !planPrice || !planPrice.is_active) {
    throw new Error('No published price is available for this plan, billing interval, and currency.');
  }

  const { providerName: checkoutProviderName, config: checkoutConfig } = getPaymentProviderConfig();
  if (checkoutProviderName === 'paystack' && !planPrice.provider_price_id) {
    throw new Error('Recurring Paystack plan configuration is required before checkout can start.');
  }

  // Validate the commercial offer before creating any payment-provider customer state.
  const { data: customer, error: customerError } = await adminClient
    .from('payment_customers')
    .select('provider_customer_id')
    .eq('user_id', userId)
    .single();

  let providerCustomerId: string;
  if (customerError || !customer) {
    const { providerName, config } = getPaymentProviderConfig();
    const provider = createPaymentProvider(providerName, config);
    const { customerId } = await provider.createCustomer(userEmail, { userId });
    providerCustomerId = customerId;

    const { error: customerInsertError } = await adminClient
      .from('payment_customers')
      .insert({ user_id: userId, provider_customer_id: providerCustomerId, provider: providerName });
    if (customerInsertError) throw customerInsertError;
  } else {
    providerCustomerId = customer.provider_customer_id;
  }

  // Create checkout session in payment provider
  const checkoutProvider = createPaymentProvider(checkoutProviderName, checkoutConfig);
  const { checkoutUrl, sessionId } = await checkoutProvider.createCheckoutSession({
    customerId: providerCustomerId,
    customerEmail: userEmail,
    priceId: `${planPrice.price_cents}:${normalizedCurrency}`,
    ...(checkoutProviderName === 'paystack' ? { subscriptionPlanCode: planPrice.provider_price_id! } : {}),
    successUrl,
    cancelUrl,
    metadata: { userId, planId, billingInterval },
  });

  const { error: intentError } = await adminClient.from('subscription_checkout_intents').insert({
    user_id: userId,
    plan_id: planId,
    billing_interval: billingInterval,
    amount_cents: planPrice.price_cents,
    currency: normalizedCurrency,
    provider: checkoutProviderName,
    provider_reference: sessionId,
    status: 'pending',
  });
  if (intentError) throw intentError;

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
  rawBody?: string,
) {
  // Get payment provider config for webhook signature verification
  const { providerName: webhookProviderName, config: webhookConfig } = getPaymentProviderConfig();
  if (provider !== webhookProviderName) throw new Error('Webhook provider does not match configured payment provider');
  const webhookProvider = createPaymentProvider(webhookProviderName, webhookConfig);

  // Verify webhook signature using provider-specific verification
  if (!webhookProvider.verifyWebhookSignature(rawBody ?? JSON.stringify(payload), signature)) {
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
    case 'charge.success':
      await handleChargeSuccess(adminClient, webhookProvider, provider, payload as any);
      break;
    case 'subscription.update':
      await handleSubscriptionUpdated(adminClient, payload as any);
      break;
    case 'subscription.disable':
      await handleSubscriptionDeleted(adminClient, payload as any);
      break;
    case 'invoice.payment_failed':
      await handlePaymentFailed(adminClient, payload as any);
      break;
    case 'invoice.payment_success':
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

async function handleChargeSuccess(
  adminClient: ReturnType<typeof getSupabaseAdmin>,
  paymentProvider: ReturnType<typeof createPaymentProvider>,
  provider: string,
  data: any,
) {
  const dataObj = data.data || data;
  const reference = typeof dataObj.reference === 'string' ? dataObj.reference : '';
  if (!reference) return;

  const { data: intent, error: intentError } = await adminClient
    .from('subscription_checkout_intents')
    .select('id, user_id, plan_id, billing_interval, amount_cents, currency, provider, status, expires_at')
    .eq('provider_reference', reference)
    .single();
  if (intentError || !intent || intent.status !== 'pending' || new Date(intent.expires_at).getTime() <= Date.now()) return;

  const amount = Number(dataObj.amount);
  const currency = typeof dataObj.currency === 'string' ? dataObj.currency.toUpperCase() : '';
  if (amount !== intent.amount_cents || currency !== intent.currency || intent.provider !== provider) {
    throw new Error('Payment amount or currency does not match the checkout offer');
  }

  let paidAt: string | null = null;
  if (provider === 'paystack') {
    if (!paymentProvider.verifyTransaction) throw new Error('Payment verification is unavailable');
    const verified = await paymentProvider.verifyTransaction(reference);
    if (verified.status !== 'success' || verified.reference !== reference || verified.amount !== intent.amount_cents || verified.currency.toUpperCase() !== intent.currency) {
      throw new Error('Payment provider verification did not confirm this checkout');
    }
    paidAt = verified.paidAt;
  }

  const subscriptionCode = dataObj.subscription?.subscription_code;
  if (provider === 'paystack' && typeof subscriptionCode !== 'string') {
    throw new Error('Verified Paystack payment is missing its recurring subscription reference');
  }
  const providerSubscriptionId = typeof subscriptionCode === 'string' ? subscriptionCode : reference;
  const periodStart = paidAt && Number.isFinite(new Date(paidAt).getTime()) ? new Date(paidAt) : new Date();
  const periodEnd = new Date(periodStart);
  if (intent.billing_interval === 'yearly') periodEnd.setUTCFullYear(periodEnd.getUTCFullYear() + 1);
  else periodEnd.setUTCMonth(periodEnd.getUTCMonth() + 1);

  const { data: currentSubscription, error: currentError } = await adminClient
    .from('subscriptions')
    .select('id')
    .eq('user_id', intent.user_id)
    .single();
  if (currentError && currentError.code !== 'PGRST116') throw currentError;

  let subscriptionId: string;
  if (currentSubscription) {
    const { data: updated, error } = await adminClient.from('subscriptions').update({
      plan_id: intent.plan_id,
      billing_interval: intent.billing_interval,
      status: 'active',
      current_period_start: periodStart.toISOString(),
      current_period_end: periodEnd.toISOString(),
      cancel_at_period_end: false,
      canceled_at: null,
      provider_subscription_id: providerSubscriptionId,
    }).eq('id', currentSubscription.id).select('id').single();
    if (error) throw error;
    subscriptionId = updated.id;
  } else {
    const { data: created, error } = await adminClient.from('subscriptions').insert({
      user_id: intent.user_id,
      plan_id: intent.plan_id,
      billing_interval: intent.billing_interval,
      status: 'active',
      current_period_start: periodStart.toISOString(),
      current_period_end: periodEnd.toISOString(),
      cancel_at_period_end: false,
      provider_subscription_id: providerSubscriptionId,
    }).select('id').single();
    if (error) throw error;
    subscriptionId = created.id;
  }

  const { data: customer } = await adminClient.from('payment_customers')
    .select('id')
    .eq('user_id', intent.user_id)
    .single();
  const { error: transactionError } = await adminClient.from('payment_transactions').insert({
    subscription_id: subscriptionId,
    customer_id: customer?.id ?? null,
    amount_cents: intent.amount_cents,
    currency: intent.currency,
    status: 'succeeded',
    provider_transaction_id: reference,
    payment_date: periodStart.toISOString(),
  });
  if (transactionError) throw transactionError;

  const { error: intentUpdateError } = await adminClient.from('subscription_checkout_intents')
    .update({ status: 'paid', paid_at: periodStart.toISOString() })
    .eq('id', intent.id)
    .eq('status', 'pending');
  if (intentUpdateError) throw intentUpdateError;
}

async function handleSubscriptionUpdated(
  adminClient: ReturnType<typeof getSupabaseAdmin>,
  data: any,
) {
  const dataObj = data.data || data;
  const subscriptionId = dataObj.subscription_code;
  const status = dataObj.status;

  await adminClient
    .from('subscriptions')
    .update({ status })
    .eq('provider_subscription_id', subscriptionId);
}

async function handleSubscriptionDeleted(
  adminClient: ReturnType<typeof getSupabaseAdmin>,
  data: any,
) {
  const dataObj = data.data || data;
  const subscriptionId = dataObj.subscription_code;

  await adminClient
    .from('subscriptions')
    .update({ status: 'canceled', cancel_at_period_end: true })
    .eq('provider_subscription_id', subscriptionId);
}

async function handlePaymentFailed(
  adminClient: ReturnType<typeof getSupabaseAdmin>,
  data: any,
) {
  const dataObj = data.data || data;
  const subscriptionId = dataObj.subscription;

  await adminClient
    .from('subscriptions')
    .update({ status: 'past_due' })
    .eq('provider_subscription_id', subscriptionId);
}

async function handlePaymentSucceeded(
  adminClient: ReturnType<typeof getSupabaseAdmin>,
  data: any,
) {
  const dataObj = data.data || data;
  const subscriptionId = dataObj.subscription;

  await adminClient
    .from('subscriptions')
    .update({ status: 'active' })
    .eq('provider_subscription_id', subscriptionId);
}

/**
 * List payment transactions for a customer (scoped to their own subscriptions).
 */
export async function listCustomerPayments(
  userClient: ReturnType<typeof getSupabaseUser>,
) {
  const { data: transactions, error } = await userClient
    .from('payment_transactions')
    .select(`
      id,
      subscription_id,
      amount_cents,
      currency,
      status,
      provider_transaction_id,
      payment_date,
      created_at
    `)
    .order('payment_date', { ascending: false })
    .limit(100);

  if (error) {
    return { ok: false, error: 'QUERY_ERROR' as const, transactions: [] as any[] };
  }

  return {
    ok: true,
    transactions: (transactions ?? []).map((t) => ({
      id: t.id,
      subscriptionId: t.subscription_id ?? undefined,
      amountCents: t.amount_cents,
      currency: t.currency,
      status: t.status,
      paymentDate: t.payment_date ?? t.created_at,
    })),
  };
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

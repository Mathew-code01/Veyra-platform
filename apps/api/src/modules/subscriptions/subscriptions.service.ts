import { getSupabaseUser } from '../../integrations/supabase/client.js';
import { getSupabaseAdmin } from '../../integrations/supabase/client.js';
import { getEnv } from '../../config/env.js';
import { createPaymentProvider } from '../payments/payment-provider.js';

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
 * Get the current subscription for a user.
 */
export async function getCurrentSubscription(
  userClient: ReturnType<typeof getSupabaseUser>,
  userId: string,
) {
  const { data, error } = await userClient
    .from('subscriptions')
    .select('id, user_id, plan_id, billing_interval, status, current_period_start, current_period_end, cancel_at_period_end, canceled_at, trial_start, trial_end, provider_subscription_id, created_at, updated_at')
    .eq('user_id', userId)
    .single();

  if (error) {
    if (error.code === 'PGRST116') return { subscription: null }; // no rows
    throw error;
  }

  return {
    subscription: {
      id: data.id,
      planId: data.plan_id,
      billingInterval: data.billing_interval,
      status: data.status as any,
      currentPeriodStart: data.current_period_start,
      currentPeriodEnd: data.current_period_end,
      cancelAtPeriodEnd: data.cancel_at_period_end,
      canceledAt: data.canceled_at ?? undefined,
      trialStart: data.trial_start ?? undefined,
      trialEnd: data.trial_end ?? undefined,
      createdAt: data.created_at,
      updatedAt: data.updated_at,
    },
  };
}

/**
 * Create a subscription for a user.
 * Subscription state comes from verified payment-provider events, not client input.
 */
export async function createSubscription(
  adminClient: ReturnType<typeof getSupabaseAdmin>,
  userId: string,
  planId: string,
  billingInterval: 'monthly' | 'yearly',
  paymentMethodId?: string,
) {
  // Get the plan
  const { data: plan, error: planError } = await adminClient
    .from('plans')
    .select('id, price_cents, currency, billing_interval')
    .eq('id', planId)
    .single();

  if (planError || !plan) throw new Error('Plan not found');

  // Get or create payment customer
  const { data: customer, error: customerError } = await adminClient
    .from('payment_customers')
    .select('id, provider_customer_id')
    .eq('user_id', userId)
    .single();

  let providerCustomerId: string;
  if (customerError || !customer) {
    // Create customer in payment provider
    const { providerName, config } = getPaymentProviderConfig();
    const provider = createPaymentProvider(providerName, config);
    const { customerId } = await provider.createCustomer(`user-${userId}`, { userId });
    providerCustomerId = customerId;

    const { error: insertError } = await adminClient
      .from('payment_customers')
      .insert({ user_id: userId, provider_customer_id: providerCustomerId, provider: providerName });

    if (insertError) throw insertError;
  } else {
    providerCustomerId = customer.provider_customer_id;
  }

  // Create subscription in payment provider
  const { providerName: subProviderName, config: subConfig } = getPaymentProviderConfig();
  const subProvider = createPaymentProvider(subProviderName, subConfig);
  const { subscriptionId, status, currentPeriodStart, currentPeriodEnd, cancelAtPeriodEnd } =
    await subProvider.createSubscription({
      customerId: providerCustomerId,
      priceId: plan.price_cents > 0 ? `${plan.price_cents}:USD` : '0:USD',
      billingInterval,
      paymentMethodId,
    });

  // Create subscription record in our database
  const { data: subscription, error: subError } = await adminClient
    .from('subscriptions')
    .insert({
      user_id: userId,
      plan_id: planId,
      billing_interval: billingInterval,
      status,
      current_period_start: currentPeriodStart.toISOString(),
      current_period_end: currentPeriodEnd.toISOString(),
      cancel_at_period_end: cancelAtPeriodEnd,
      provider_subscription_id: subscriptionId,
    })
    .select()
    .single();

  if (subError) throw subError;

  return {
    subscription: {
      id: subscription.id,
      planId: subscription.plan_id,
      billingInterval: subscription.billing_interval,
      status: subscription.status,
      currentPeriodStart: subscription.current_period_start,
      currentPeriodEnd: subscription.current_period_end,
      cancelAtPeriodEnd: subscription.cancel_at_period_end,
      createdAt: subscription.created_at,
      updatedAt: subscription.updated_at,
    },
  };
}

/**
 * Cancel a subscription.
 * Cancellation state comes from verified payment-provider events.
 */
export async function cancelSubscription(
  adminClient: ReturnType<typeof getSupabaseAdmin>,
  subscriptionId: string,
  atPeriodEnd: boolean = true,
) {
  // Get the subscription to find provider reference
  const { data: sub, error: subError } = await adminClient
    .from('subscriptions')
    .select('provider_subscription_id, status')
    .eq('id', subscriptionId)
    .single();

  if (subError || !sub) throw new Error('Subscription not found');

  // Cancel in payment provider
  const { providerName: cancelProviderName, config: cancelConfig } = getPaymentProviderConfig();
  const cancelProvider = createPaymentProvider(cancelProviderName, cancelConfig);
  const { status } = await cancelProvider.cancelSubscription(sub.provider_subscription_id, atPeriodEnd);

  // Update our record
  const { data, error } = await adminClient
    .from('subscriptions')
    .update({ status, cancel_at_period_end: atPeriodEnd, canceled_at: atPeriodEnd ? null : new Date().toISOString() })
    .eq('id', subscriptionId)
    .select()
    .single();

  if (error) throw error;

  return {
    subscription: {
      id: data.id,
      status: data.status,
      cancelAtPeriodEnd: data.cancel_at_period_end,
      canceledAt: data.canceled_at,
    },
  };
}

/**
 * Reactivate a canceled subscription.
 */
export async function reactivateSubscription(
  adminClient: ReturnType<typeof getSupabaseAdmin>,
  subscriptionId: string,
) {
  const { data: sub, error: subError } = await adminClient
    .from('subscriptions')
    .select('provider_subscription_id')
    .eq('id', subscriptionId)
    .single();

  if (subError || !sub) throw new Error('Subscription not found');

  const { providerName: reactivateProviderName, config: reactivateConfig } = getPaymentProviderConfig();
  const reactivateProvider = createPaymentProvider(reactivateProviderName, reactivateConfig);
  const { status } = await reactivateProvider.reactivateSubscription(sub.provider_subscription_id);

  const { data, error } = await adminClient
    .from('subscriptions')
    .update({ status, cancel_at_period_end: false, canceled_at: null })
    .eq('id', subscriptionId)
    .select()
    .single();

  if (error) throw error;

  return {
    subscription: {
      id: data.id,
      status: data.status,
      cancelAtPeriodEnd: data.cancel_at_period_end,
    },
  };
}

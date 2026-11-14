import { getSupabaseUser } from '../../integrations/supabase/client.js';
import { getSupabaseAdmin } from '../../integrations/supabase/client.js';
import { createPaymentProvider } from '../payments/payment-provider.js';

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
    const provider = createPaymentProvider('mock');
    const { customerId } = await provider.createCustomer(`user-${userId}`, { userId });
    providerCustomerId = customerId;

    const { error: insertError } = await adminClient
      .from('payment_customers')
      .insert({ user_id: userId, provider_customer_id: providerCustomerId, provider: 'mock' });

    if (insertError) throw insertError;
  } else {
    providerCustomerId = customer.provider_customer_id;
  }

  // Create subscription in payment provider
  const provider = createPaymentProvider('mock');
  const { subscriptionId, status, currentPeriodStart, currentPeriodEnd, cancelAtPeriodEnd } =
    await provider.createSubscription({
      customerId: providerCustomerId,
      priceId: `price_${planId}`,
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
  const provider = createPaymentProvider('mock');
  const { status } = await provider.cancelSubscription(sub.provider_subscription_id, atPeriodEnd);

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

  const provider = createPaymentProvider('mock');
  const { status } = await provider.reactivateSubscription(sub.provider_subscription_id);

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

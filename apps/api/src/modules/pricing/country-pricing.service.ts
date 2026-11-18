import { getSupabaseAdmin } from '../../integrations/supabase/client.js';

/**
 * Country-aware pricing service.
 *
 * Supports multi-currency pricing based on user's country.
 * Countries and their supported currencies are explicitly configured -
 * no automatic currency conversion or exchange rates.
 *
 * Supported countries and currencies (Paystack merchant markets):
 * - Nigeria (NG): NGN, USD
 * - South Africa (ZA): ZAR
 * - Ghana (GH): GHS
 * - Kenya (KE): KES, USD
 *
 * Currency exponents for Paystack (smallest currency unit):
 * - NGN: 2 (kobo)
 * - USD: 2 (cents)
 * - ZAR: 2 (cents)
 * - GHS: 2 (pesewas)
 * - KES: 2 (cents)
 */

export type CountryCode = string;
export type CurrencyCode = string;

export interface CountryCurrencyConfig {
  country: CountryCode;
  countryName: string;
  currency: CurrencyCode;
  currencySymbol: string;
  currencyExponent: number;
  isSupported: boolean;
}

export interface CountryPlanPricing {
  country: CountryCode;
  currency: CurrencyCode;
  currencySymbol: string;
  currencyExponent: number;
  plans: Array<{
    planId: string;
    planName: string;
    planFamily: string;
    description?: string;
    currency: string;
    amountCents: number;
    billingInterval: 'monthly' | 'yearly';
    isAvailable: boolean;
  }>;
}

const PRICING_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const lastKnownGoodPricing = new Map<string, { value: CountryPlanPricing; retrievedAt: string }>();
const pricingKey = (country: string, currency: string) => `${country.toUpperCase()}:${currency.toUpperCase()}`;

/** Return a recent in-process offer snapshot for display only; callers must never authorize checkout from it. */
export function getLastKnownGoodPlanPricing(country: CountryCode, currency: CurrencyCode) {
  const entry = lastKnownGoodPricing.get(pricingKey(country, currency));
  if (!entry || Date.now() - Date.parse(entry.retrievedAt) > PRICING_CACHE_TTL_MS) return null;
  return { ...entry.value, retrievedAt: entry.retrievedAt };
}

/**
 * Configured country-currency mappings.
 * These are the currencies the Veyra merchant account can accept
 * through Paystack. Actual availability depends on Paystack activation.
 */
export const COUNTRY_CURRENCIES: CountryCurrencyConfig[] = [
  { country: 'NG', countryName: 'Nigeria', currency: 'NGN', currencySymbol: '₦', currencyExponent: 2, isSupported: true },
  { country: 'NG', countryName: 'Nigeria', currency: 'USD', currencySymbol: '$', currencyExponent: 2, isSupported: true },
  { country: 'ZA', countryName: 'South Africa', currency: 'ZAR', currencySymbol: 'R', currencyExponent: 2, isSupported: true },
  { country: 'GH', countryName: 'Ghana', currency: 'GHS', currencySymbol: '₵', currencyExponent: 2, isSupported: true },
  { country: 'KE', countryName: 'Kenya', currency: 'KES', currencySymbol: 'KSh', currencyExponent: 2, isSupported: true },
  { country: 'KE', countryName: 'Kenya', currency: 'USD', currencySymbol: '$', currencyExponent: 2, isSupported: true },
] as const;

/**
 * Get all supported country-currency combinations.
 */
export function getSupportedCountryCurrencies(): CountryCurrencyConfig[] {
  return COUNTRY_CURRENCIES.filter((c) => c.isSupported);
}

/**
 * Get currencies supported for a specific country.
 */
export function getCurrenciesForCountry(country: CountryCode): CountryCurrencyConfig[] {
  return COUNTRY_CURRENCIES.filter((c) => c.country === country && c.isSupported);
}

/**
 * Get currency config for a country-currency pair.
 */
export function getCurrencyConfig(country: CountryCode, currency: CurrencyCode): CountryCurrencyConfig | null {
  return COUNTRY_CURRENCIES.find((c) => c.country === country && c.currency === currency && c.isSupported) ?? null;
}

/**
 * Convert amount from major units to minor units (e.g., dollars to cents).
 * Uses the currency's exponent.
 */
export function toMinorUnits(amount: number, currencyExponent: number): number {
  return Math.round(amount * Math.pow(10, currencyExponent));
}

/**
 * Convert amount from minor units to major units (e.g., cents to dollars).
 */
export function fromMinorUnits(amount: number, currencyExponent: number): number {
  return amount / Math.pow(10, currencyExponent);
}

/**
 * Detect user country from various sources.
 * Priority: user preference > geolocation header > default
 */
export function detectCountry(
  userCountry?: string,
  geoCountry?: string,
  defaultCountry: CountryCode = 'NG',
): { country: CountryCode; detectedBy: 'user_preference' | 'geolocation' | 'default' } {
  if (userCountry && COUNTRY_CURRENCIES.some((c) => c.country === userCountry)) {
    return { country: userCountry, detectedBy: 'user_preference' };
  }
  if (geoCountry && COUNTRY_CURRENCIES.some((c) => c.country === geoCountry)) {
    return { country: geoCountry, detectedBy: 'geolocation' };
  }
  return { country: defaultCountry, detectedBy: 'default' };
}

/**
 * Get pricing for all plans in a specific country-currency.
 * Server-side only - queries the plans table.
 */
export async function getPlanPricingByCountry(
  adminClient: ReturnType<typeof getSupabaseAdmin>,
  country: CountryCode,
  currency: CurrencyCode,
): Promise<CountryPlanPricing> {
  const config = getCurrencyConfig(country, currency);
  if (!config) {
    throw new Error(`Currency ${currency} not supported for country ${country}`);
  }

  // Get all active plans with their prices
  let { data: plans, error } = await adminClient
    .from('plans')
    .select('id, name, family, description, device_limit, features')
    .eq('is_active', true)
    .eq('is_dev_fixture', false)
    .eq('family', 'cloud')
    .eq('is_published', true);

  if (error && (error.code === '42703' || String(error.message).includes('is_published'))) {
    // Graceful fallback if migration 0013 (is_published column) is not yet applied
    const fallbackPlans = await adminClient
      .from('plans')
      .select('id, name, family, description, device_limit, features')
      .eq('is_active', true)
      .eq('is_dev_fixture', false)
      .eq('family', 'cloud');
    plans = fallbackPlans.data;
    error = fallbackPlans.error;
  }

  if (error) throw error;

  // Return configured regional offers and the explicitly configured USD offer.
  // USD is never converted from a regional amount; every offer carries its own currency.
  const { data: planPrices, error: priceError } = await adminClient
    .from('plan_prices')
    .select('plan_id, price_cents, currency, billing_interval, is_active')
    .in('currency', [...new Set([currency, 'USD'])])
    .eq('is_active', true)
    .gt('price_cents', 0);

  if (priceError) throw priceError;

  // Build a map of plan_id -> price
  const priceMap = new Map<string, Array<{ price_cents: number; currency: string; billing_interval: string; is_active: boolean }>>();
  (planPrices ?? []).forEach((p) => {
    const entries = priceMap.get(p.plan_id) ?? [];
    entries.push({
      price_cents: p.price_cents,
      currency: p.currency,
      billing_interval: p.billing_interval,
      is_active: p.is_active,
    });
    priceMap.set(p.plan_id, entries);
  });

  let planList = (plans ?? []).flatMap((p) => {
    return (priceMap.get(p.id) ?? [])
      .filter((price) => price.is_active && price.price_cents > 0)
      .map((price) => ({
        planId: p.id,
        planName: p.name,
        planFamily: p.family,
        description: p.description ?? undefined,
        currency: price.currency,
        amountCents: price.price_cents,
        billingInterval: price.billing_interval as 'monthly' | 'yearly',
        isAvailable: true,
      }));
  });

  // If no published cloud plan is present in the database (e.g. pending migration 0014),
  // provide the authoritative reference commercial offer (US$29.99/month Cloud AI).
  if (planList.length === 0) {
    planList = [
      {
        planId: '47f925de-71f1-4b8f-84b8-0f53f823b629',
        planName: 'VEYRA Cloud AI',
        planFamily: 'cloud',
        description: 'Monthly access to VEYRA-managed Cloud AI. Local AI and BYOK remain separate usage methods.',
        currency: 'USD',
        amountCents: 2999,
        billingInterval: 'monthly',
        isAvailable: true,
      },
    ];
  }

  const result: CountryPlanPricing = {
    country,
    currency,
    currencySymbol: config.currencySymbol,
    currencyExponent: config.currencyExponent,
    plans: planList,
  };
  lastKnownGoodPricing.set(pricingKey(country, currency), { value: result, retrievedAt: new Date().toISOString() });
  return result;
}

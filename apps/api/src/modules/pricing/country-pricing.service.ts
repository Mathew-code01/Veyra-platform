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
): Promise<{
  country: CountryCode;
  currency: CurrencyCode;
  currencySymbol: string;
  currencyExponent: number;
  plans: Array<{
    planId: string;
    planName: string;
    planFamily: string;
    amountCents: number;
    billingInterval: 'monthly' | 'yearly';
    isAvailable: boolean;
  }>;
}> {
  const config = getCurrencyConfig(country, currency);
  if (!config) {
    throw new Error(`Currency ${currency} not supported for country ${country}`);
  }

  // Get all active plans with their prices
  const { data: plans, error } = await adminClient
    .from('plans')
    .select('id, name, family, device_limit, features')
    .eq('is_active', true);

  if (error) throw error;

  // Get plan prices for this currency
  const { data: planPrices, error: priceError } = await adminClient
    .from('plan_prices')
    .select('plan_id, price_cents, billing_interval, is_active')
    .eq('currency', currency)
    .eq('is_active', true);

  if (priceError) throw priceError;

  // Build a map of plan_id -> price
  const priceMap = new Map<string, { price_cents: number; billing_interval: string; is_active: boolean }>();
  (planPrices ?? []).forEach((p) => {
    priceMap.set(p.plan_id, {
      price_cents: p.price_cents,
      billing_interval: p.billing_interval,
      is_active: p.is_active,
    });
  });

  const planList = (plans ?? []).map((p) => {
    const price = priceMap.get(p.id);
    const isAvailable = price?.is_active ?? false;

    return {
      planId: p.id,
      planName: p.name,
      planFamily: p.family,
      amountCents: price?.price_cents ?? 0,
      billingInterval: (price?.billing_interval as 'monthly' | 'yearly') ?? 'monthly',
      isAvailable,
    };
  });

  return {
    country,
    currency,
    currencySymbol: config.currencySymbol,
    currencyExponent: config.currencyExponent,
    plans: planList,
  };
}

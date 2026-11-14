import type { FastifyPluginAsync } from 'fastify';
import { getSupabaseAdmin } from '../../integrations/supabase/client.js';
import {
  getSupportedCountryCurrencies,
  getCurrenciesForCountry,
  detectCountry,
  getPlanPricingByCountry,
} from './country-pricing.service.js';
import { authenticateUser } from '../auth/auth.service.js';

const pricingPlugin: FastifyPluginAsync = async (fastify) => {
  // --- Get supported country-currency combinations ---
  fastify.get(
    '/countries',
    async (_request, reply) => {
      const requestId = _request.id ?? 'unknown';
      const countries = getSupportedCountryCurrencies();

      return reply.send({
        ok: true,
        requestId,
        countries,
      });
    }
  );

  // --- Get currencies for a country ---
  fastify.get(
    '/countries/:country/currencies',
    async (request, reply) => {
      const requestId = request.id ?? 'unknown';
      const { country } = request.params as { country: string };

      const currencies = getCurrenciesForCountry(country.toUpperCase());

      return reply.send({
        ok: true,
        requestId,
        country: country.toUpperCase(),
        currencies,
      });
    }
  );

  // --- Get plan pricing for a country-currency ---
  fastify.get(
    '/plans',
    async (request, reply) => {
      const requestId = request.id ?? 'unknown';

      const { country, currency } = request.query as {
        country?: string;
        currency?: string;
      };

      if (!country || !currency) {
        return reply.status(400).send({
          ok: false,
          requestId,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'country and currency query parameters are required.',
            status: 400,
          },
        });
      }

      try {
        const adminClient = getSupabaseAdmin();
        const result = await getPlanPricingByCountry(
          adminClient,
          country.toUpperCase(),
          currency.toUpperCase(),
        );

        return reply.send({
          ok: true,
          requestId,
          country: result.country,
          currency: result.currency,
          currencySymbol: result.currencySymbol,
          currencyExponent: result.currencyExponent,
          plans: result.plans,
        });
      } catch (err) {
        request.log.error({ requestId, err }, 'pricing by country error');
        return reply.status(500).send({
          ok: false,
          requestId,
          error: {
            code: 'PRICING_ERROR',
            message: err instanceof Error ? err.message : 'Pricing lookup failed.',
            status: 500,
          },
        });
      }
    }
  );

  // --- Detect user country ---
  fastify.get(
    '/detect',
    async (request, reply) => {
      const requestId = request.id ?? 'unknown';

      const authHeader = request.headers.authorization;
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return reply.status(401).send({
          ok: false,
          requestId,
          error: {
            code: 'UNAUTHORIZED',
            message: 'Missing or invalid authorization header.',
            status: 401,
          },
        });
      }

      const accessToken = authHeader.substring(7);
      const user = await authenticateUser(accessToken);
      if (!user) {
        return reply.status(401).send({
          ok: false,
          requestId,
          error: {
            code: 'UNAUTHORIZED',
            message: 'Invalid or expired session.',
            status: 401,
          },
        });
      }

      // Check for geolocation header (set by proxy/CDN)
      const geoCountry = (request.headers['cf-ipcountry'] as string) ||
        (request.headers['x-vercel-ip-country'] as string) ||
        undefined;

      // For now, default to NG (Nigeria) since Paystack is a Nigerian provider
      // User preference would be stored in their profile in a future phase
      const { country: detectedCountry, detectedBy } = detectCountry(
        undefined,
        geoCountry,
        'NG',
      );

      // Get currency config for detected country (first supported currency)
      const currencies = getCurrenciesForCountry(detectedCountry);
      const primaryCurrency = currencies[0]?.currency ?? 'USD';
      const currencyConfig = getCurrenciesForCountry(detectedCountry).find(
        (c) => c.currency === primaryCurrency,
      );

      return reply.send({
        ok: true,
        requestId,
        country: detectedCountry,
        currency: primaryCurrency,
        currencySymbol: currencyConfig?.currencySymbol ?? '$',
        detectedBy,
      });
    }
  );
};

export default pricingPlugin;

import type { FastifyPluginAsync } from 'fastify';
import { exchangeRateService } from './exchange-rate.service.js';

const exchangeRatePlugin: FastifyPluginAsync = async (fastify) => {
  // --- Get latest exchange rates ---
  fastify.get(
    '/latest',
    async (request, reply) => {
      const { baseCurrency = 'USD' } = request.query as { baseCurrency?: string };

      try {
        const rates = await exchangeRateService.getLatestRates(baseCurrency.toUpperCase());

        return reply.send({
          ok: true,
          requestId: request.id,
          baseCurrency: baseCurrency.toUpperCase(),
          rates,
          updatedAt: new Date().toISOString(),
        });
      } catch (err) {
        request.log.error({ err }, 'Failed to fetch exchange rates');
        return reply.status(500).send({
          ok: false,
          error: {
            code: 'EXCHANGE_RATE_ERROR',
            message: 'Failed to fetch exchange rates',
            status: 500,
          },
        });
      }
    }
  );

  // --- Get exchange rate for specific currency pair ---
  fastify.get(
    '/rate',
    async (request, reply) => {
      const { fromCurrency = 'USD', toCurrency } = request.query as {
        fromCurrency?: string;
        toCurrency: string;
      };

      if (!toCurrency) {
        return reply.status(400).send({
          ok: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'toCurrency query parameter is required.',
            status: 400,
          },
        });
      }

      try {
        const rate = await exchangeRateService.getRate(
          fromCurrency.toUpperCase(),
          toCurrency.toUpperCase()
        );

        return reply.send({
          ok: true,
          fromCurrency: fromCurrency.toUpperCase(),
          toCurrency: toCurrency.toUpperCase(),
          rate,
          timestamp: new Date().toISOString(),
        });
      } catch (err) {
        request.log.error({ err }, 'Failed to fetch exchange rate');
        return reply.status(500).send({
          ok: false,
          error: {
            code: 'EXCHANGE_RATE_ERROR',
            message: 'Failed to fetch exchange rate',
            status: 500,
          },
        });
      }
    }
  );

  // --- Convert amount between currencies ---
  fastify.post(
    '/convert',
    {
      schema: {
        body: {
          type: 'object',
          required: ['amount', 'fromCurrency', 'toCurrency'],
          properties: {
            amount: { type: 'number', minimum: 0 },
            fromCurrency: { type: 'string', minLength: 3, maxLength: 3 },
            toCurrency: { type: 'string', minLength: 3, maxLength: 3 },
          },
        },
      },
    },
    async (request, reply) => {
      const { amount, fromCurrency, toCurrency } = request.body as {
        amount: number;
        fromCurrency: string;
        toCurrency: string;
      };

      if (amount < 0) {
        return reply.status(400).send({
          ok: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Amount must be non-negative.',
            status: 400,
          },
        });
      }

      if (fromCurrency === toCurrency) {
        return reply.send({
          ok: true,
          amount,
          fromCurrency: fromCurrency.toUpperCase(),
          toCurrency: toCurrency.toUpperCase(),
          rate: 1,
          convertedAmount: amount,
          isLive: false,
          rateTimestamp: new Date().toISOString(),
        });
      }

      try {
        const result = await exchangeRateService.convertWithMetadata(
          amount,
          fromCurrency.toUpperCase(),
          toCurrency.toUpperCase()
        );

        return reply.send({
          ok: true,
          requestId: request.id,
          ...result,
        });
      } catch (err) {
        request.log.error({ err }, 'Currency conversion failed');
        return reply.status(500).send({
          ok: false,
          error: {
            code: 'CONVERSION_ERROR',
            message: 'Currency conversion failed',
            status: 500,
          },
        });
      }
    }
  );

  // --- Get historical exchange rate ---
  fastify.get(
    '/historical',
    async (request, reply) => {
      const { fromCurrency = 'USD', toCurrency, date } = request.query as {
        fromCurrency?: string;
        toCurrency: string;
        date: string; // YYYY-MM-DD
      };

      if (!toCurrency || !date) {
        return reply.status(400).send({
          ok: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'toCurrency and date (YYYY-MM-DD) are required.',
            status: 400,
          },
        });
      }

      try {
        const rate = await exchangeRateService.getHistoricalRate(
          fromCurrency.toUpperCase(),
          toCurrency.toUpperCase(),
          date
        );

        return reply.send({
          ok: true,
          fromCurrency: fromCurrency.toUpperCase(),
          toCurrency: toCurrency.toUpperCase(),
          date,
          rate,
          timestamp: new Date().toISOString(),
        });
      } catch (err) {
        request.log.error({ err }, 'Failed to fetch historical rate');
        return reply.status(500).send({
          ok: false,
          error: {
            code: 'HISTORICAL_RATE_ERROR',
            message: 'Failed to fetch historical exchange rate',
            status: 500,
          },
        });
      }
    }
  );
};

export default exchangeRatePlugin;
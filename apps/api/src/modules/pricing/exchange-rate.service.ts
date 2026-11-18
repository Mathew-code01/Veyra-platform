/**
 * Exchange rate service for Veyra Platform.
 *
 * Provides exchange rate lookup between USD and target currencies.
 * Uses a mock provider by default; real provider implementations can be added.
 */

export type ExchangeRateProvider = 'exchangerate-api' | 'exchangerate-api-com' | 'openexchangerates' | 'mock';

/**
 * Exchange rate response from provider
 */
export interface ExchangeRateResponse {
  baseCurrency: string;
  rates: Record<string, number>;
  timestamp: string; // ISO 8601
  provider: ExchangeRateProvider;
}

/**
 * Exchange rate provider interface
 */
export interface IExchangeRateProvider {
  name: ExchangeRateProvider;
  fetchLatestRates(baseCurrency: string): Promise<ExchangeRateResponse>;
  fetchHistoricalRate(baseCurrency: string, targetCurrency: string, date: string): Promise<ExchangeRateResponse>;
}

/**
 * Mock exchange rate provider for testing
 */
export class MockExchangeRateProvider implements IExchangeRateProvider {
  name: ExchangeRateProvider = 'mock';

  private mockRates: Record<string, number> = {
    USD: 1,
    NGN: 1500,
    ZAR: 18.5,
    GHS: 12.5,
    KES: 135,
    EUR: 0.92,
    GBP: 0.79,
  };

  async fetchLatestRates(baseCurrency: string): Promise<ExchangeRateResponse> {
    const mockRate = this.mockRates[baseCurrency as keyof typeof this.mockRates] ?? 1;
    const rates: Record<string, number> = { [baseCurrency]: mockRate };
    return {
      baseCurrency,
      rates,
      timestamp: new Date().toISOString(),
      provider: 'mock',
    };
  }

  async fetchHistoricalRate(_baseCurrency: string, _targetCurrency: string, date: string): Promise<ExchangeRateResponse> {
    return {
      baseCurrency: 'USD',
      rates: this.mockRates,
      timestamp: date,
      provider: 'mock',
    };
  }
}

/**
 * Exchange rate service for fetching and caching exchange rates
 */
export class ExchangeRateService {
  private provider: IExchangeRateProvider;
  private cache: Map<string, { rates: Record<string, number>; expiresAt: number }> = new Map();
  private readonly ttlMs: number;
  private readonly baseCurrency: string;

  constructor(provider: IExchangeRateProvider, baseCurrency: string = 'USD', ttlHours: number = 24) {
    this.provider = provider;
    this.baseCurrency = baseCurrency;
    void this.baseCurrency;
    this.ttlMs = ttlHours * 60 * 60 * 1000;
  }

  /**
   * Get the latest exchange rates for a base currency
   */
  async getLatestRates(baseCurrency: string = 'USD'): Promise<Record<string, number>> {
    const cacheKey = `latest:${baseCurrency}`;
    const cached = this.cache.get(cacheKey);

    if (cached && Date.now() < cached.expiresAt) {
      return cached.rates;
    }

    const response = await this.provider.fetchLatestRates(baseCurrency);
    const rates = response.rates;

    this.cache.set(cacheKey, {
      rates,
      expiresAt: Date.now() + this.ttlMs,
    });

    return rates;
  }

  /**
   * Get exchange rate for a specific currency pair
   */
  async getRate(fromCurrency: string, toCurrency: string): Promise<number> {
    if (fromCurrency === toCurrency) return 1;

    const rates = await this.getLatestRates(fromCurrency);
    const rate = rates[toCurrency.toUpperCase()];

    if (!rate) {
      throw new Error(`No exchange rate available for ${fromCurrency} -> ${toCurrency}`);
    }

    return rate;
  }

  /**
   * Convert amount from one currency to another
   */
  async convert(amount: number, fromCurrency: string, toCurrency: string): Promise<number> {
    if (fromCurrency === toCurrency) return amount;

    const rate = await this.getRate(fromCurrency, toCurrency);
    return Math.round(amount * rate * 100) / 100;
  }

  /**
   * Get historical exchange rate for a specific date
   */
  async getHistoricalRate(fromCurrency: string, toCurrency: string, date: string): Promise<number> {
    if (fromCurrency === toCurrency) return 1;

    const response = await this.provider.fetchHistoricalRate(fromCurrency, toCurrency, date);
    const rate = response.rates[toCurrency.toUpperCase()];

    if (!rate) {
      throw new Error(`No historical rate available for ${fromCurrency} -> ${toCurrency} on ${date}`);
    }

    return rate;
  }

  /**
   * Convert amount using cached or live rates
   */
  async convertWithMetadata(
    amount: number,
    fromCurrency: string,
    toCurrency: string
  ): Promise<{
    convertedAmount: number;
    fromCurrency: string;
    toCurrency: string;
    rate: number;
    isLive: boolean;
    rateTimestamp: string;
  }> {
    if (fromCurrency === toCurrency) {
      return {
        convertedAmount: amount,
        fromCurrency,
        toCurrency,
        rate: 1,
        isLive: false,
        rateTimestamp: new Date().toISOString(),
      };
    }

    try {
      const rate = await this.getRate(fromCurrency, toCurrency);
      return {
        convertedAmount: Math.round(amount * rate * 100) / 100,
        fromCurrency,
        toCurrency,
        rate,
        isLive: true,
        rateTimestamp: new Date().toISOString(),
      };
    } catch (error) {
      const cached = this.cache.get(`latest:USD`);

      if (cached) {
        const rate = cached.rates[toCurrency.toUpperCase()];
        if (rate) {
          return {
            convertedAmount: Math.round(amount * cached.rates[toCurrency.toUpperCase()] * 100) / 100,
            fromCurrency: 'USD',
            toCurrency,
            rate: cached.rates[toCurrency.toUpperCase()],
            isLive: false,
            rateTimestamp: new Date(cached.expiresAt - this.ttlMs).toISOString(),
          };
        }
      }

      throw new Error(`Unable to get exchange rate for ${toCurrency}`);
    }
  }

  /**
   * Clear the cache (for testing or manual refresh)
   */
  clearCache(): void {
    this.cache.clear();
  }

  /**
   * Get cache statistics
   */
  getCacheStats(): { size: number; entries: string[] } {
    return {
      size: this.cache.size,
      entries: Array.from(this.cache.keys()),
    };
  }
}

/**
 * Create exchange rate provider based on configuration
 */
export function createExchangeRateProvider(config: {
  provider: ExchangeRateProvider;
  apiKey?: string;
  baseCurrency?: string;
  ttlHours?: number;
}): ExchangeRateService {
  switch (config.provider) {
    case 'mock':
      return new ExchangeRateService(new MockExchangeRateProvider(), config.baseCurrency, config.ttlHours);
    case 'exchangerate-api':
      throw new Error('exchangerate-api provider not yet implemented');
    case 'exchangerate-api-com':
      throw new Error('exchangerate-api.com provider not yet implemented');
    case 'openexchangerates':
      throw new Error('openexchangerates provider not yet implemented');
    default:
      return new ExchangeRateService(new MockExchangeRateProvider(), config.baseCurrency, config.ttlHours);
  }
}

/**
 * Get the singleton exchange rate service instance
 */
let exchangeRateServiceInstance: ExchangeRateService | null = null;

export function getExchangeRateService(): ExchangeRateService {
  if (!exchangeRateServiceInstance) {
    const providerName = process.env.PAYMENT_PROVIDER === 'paystack' ? 'mock' : 'mock';
    const baseCurrency = 'USD';
    const ttlHours = 24;
    void providerName;
    exchangeRateServiceInstance = new ExchangeRateService(
      new MockExchangeRateProvider(),
      baseCurrency,
      ttlHours
    );
  }
  return exchangeRateServiceInstance;
}

export const exchangeRateService = getExchangeRateService();
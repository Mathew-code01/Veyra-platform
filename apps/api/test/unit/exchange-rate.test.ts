import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MockExchangeRateProvider, ExchangeRateService, createExchangeRateProvider } from '../../src/modules/pricing/exchange-rate.service.js';

describe('MockExchangeRateProvider', () => {
  it('has correct name', () => {
    const provider = new MockExchangeRateProvider();
    expect(provider.name).toBe('mock');
  });

  async function setupMockProvider() {
    const provider = new MockExchangeRateProvider();
    return provider;
  }

  describe('fetchLatestRates', () => {
    it('returns USD as base with rates', async () => {
      const provider = new MockExchangeRateProvider();
      const result = await provider.fetchLatestRates('USD');
      expect(result.provider).toBe('mock');
      expect(result.baseCurrency).toBe('USD');
      expect(result.rates.USD).toBe(1);
      expect(result.rates.NGN).toBe(1500);
      expect(result.rates.ZAR).toBe(18.5);
      expect(result.rates.GHS).toBe(12.5);
      expect(result.rates.KES).toBe(135);
    });

    it('returns rates for requested base currency', async () => {
      const provider = new MockExchangeRateProvider();
      const result = await provider.fetchLatestRates('NGN');
      expect(result.baseCurrency).toBe('NGN');
    });

    it('returns all mock rates for any base currency', async () => {
      const provider = new MockExchangeRateProvider();
      const result = await provider.fetchLatestRates('XXX');
      expect(result.baseCurrency).toBe('XXX');
      expect(result.rates.USD).toBe(1);
      expect(result.rates.NGN).toBe(1500);
    });
  });

  describe('fetchHistoricalRate', () => {
    it('returns mock historical rate', async () => {
      const provider = new MockExchangeRateProvider();
      const result = await provider.fetchHistoricalRate('USD', 'NGN', '2026-01-01');
      expect(result.provider).toBe('mock');
      expect(result.rates.NGN).toBe(1500);
    });
  });
})

describe('ExchangeRateService', () => {
  let service: ExchangeRateService;

  beforeEach(() => {
    service = new ExchangeRateService(new MockExchangeRateProvider(), 'USD', 24);
  });

  afterEach(() => {
    service.clearCache();
  })

  describe('getLatestRates', () => {
    it('returns rates from provider', async () => {
      const rates = await service.getLatestRates('USD');
      expect(rates.USD).toBe(1);
      expect(rates.NGN).toBe(1500);
      expect(rates.ZAR).toBe(18.5);
    });

    it('caches rates', async () => {
      const provider = new MockExchangeRateProvider();
      const fetchLatestRatesSpy = vi.spyOn(provider, 'fetchLatestRates');
      const service2 = new ExchangeRateService(provider, 'USD', 24);

      await service2.getLatestRates('USD');
      await service2.getLatestRates('USD');
      expect(fetchLatestRatesSpy).toHaveBeenCalledTimes(1);
    });

    it('expires cache after TTL', async () => {
      const provider = new MockExchangeRateProvider();
      const fetchLatestRatesSpy = vi.spyOn(provider, 'fetchLatestRates');
      const service2 = new ExchangeRateService(provider, 'USD', 0.0001); // ~0.036 seconds TTL

      await service2.getLatestRates('USD');
      vi.useFakeTimers();
      vi.setSystemTime(new Date(Date.now() + 5000));
      const result = await service2.getLatestRates('USD');
      expect(result.NGN).toBe(1500);
      expect(fetchLatestRatesSpy).toHaveBeenCalledTimes(2);
      vi.useRealTimers();
    })
  })

  describe('getRate', () => {
    it('returns 1 for same currency', async () => {
      const rate = await service.getRate('USD', 'USD');
      expect(rate).toBe(1);
    });

    it('returns rate for currency pair', async () => {
      const rate = await service.getRate('USD', 'NGN');
      expect(rate).toBe(1500);
    });

    it('returns rate for reverse pair', async () => {
      const rate = await service.getRate('NGN', 'USD');
      expect(rate).toBe(1);
    });

    it('throws for unknown currency pair', async () => {
      await expect(service.getRate('USD', 'XXX')).rejects.toThrow('No exchange rate available');
    });
  })

  describe('convert', () => {
    it('converts USD to NGN', async () => {
      const result = await service.convert(10, 'USD', 'NGN');
      expect(result).toBe(15000);
    });

    it('converts NGN to USD', async () => {
      const result = await service.convert(1500, 'NGN', 'USD');
      expect(result).toBe(1500);
    });

    it('returns same amount for same currency', async () => {
      const result = await service.convert(100, 'USD', 'USD');
      expect(result).toBe(100);
    });

    it('throws for unknown currency pair', async () => {
      await expect(service.convert(10, 'USD', 'XXX')).rejects.toThrow('No exchange rate available');
    });
  })

  describe('convertWithMetadata', () => {
    it('converts and returns metadata', async () => {
      const result = await service.convertWithMetadata(10, 'USD', 'NGN');
      expect(result.convertedAmount).toBe(15000);
      expect(result.fromCurrency).toBe('USD');
      expect(result.toCurrency).toBe('NGN');
      expect(result.rate).toBe(1500);
      expect(result.isLive).toBe(true);
      expect(result.rateTimestamp).toBeDefined();
    })

    it('falls back to cache when provider fails', async () => {
      const provider = new MockExchangeRateProvider();
      const service2 = new ExchangeRateService(provider, 'USD', 0.0001);

      // First call populates cache
      await service2.convertWithMetadata(10, 'USD', 'NGN');

      // Expire cache so provider is called on next request
      vi.useFakeTimers();
      vi.setSystemTime(new Date(Date.now() + 5000));

      // Mock provider now throws
      vi.spyOn(provider, 'fetchLatestRates').mockRejectedValue(new Error('Provider down'));

      const result = await service2.convertWithMetadata(10, 'USD', 'NGN');
      expect(result.convertedAmount).toBe(15000);
      expect(result.isLive).toBe(false);
      vi.useRealTimers();
    })

    it('throws when no cache available', async () => {
      const provider = new MockExchangeRateProvider();
      const service2 = new ExchangeRateService(provider, 'USD', 24);

      vi.spyOn(provider, 'fetchLatestRates').mockRejectedValue(new Error('Provider down'));

      await expect(service2.convertWithMetadata(10, 'USD', 'NGN')).rejects.toThrow('Unable to get exchange rate');
    })
  })

  describe('clearCache', () => {
    it('clears all cached rates', async () => {
      const service2 = new ExchangeRateService(new MockExchangeRateProvider(), 'USD', 24);
      await service2.getLatestRates('USD');
      expect(service2.getCacheStats().size).toBe(1);
      service2.clearCache();
      expect(service2.getCacheStats().size).toBe(0);
    });
  })
})

describe('createExchangeRateProvider', () => {
  it('creates mock provider by default', () => {
    const service = createExchangeRateProvider({ provider: 'mock' });
    expect(service).toBeInstanceOf(ExchangeRateService);
  })

  it('throws for unimplemented providers', () => {
    expect(() => createExchangeRateProvider({ provider: 'exchangerate-api' })).toThrow('exchangerate-api provider not yet implemented');
  })
})

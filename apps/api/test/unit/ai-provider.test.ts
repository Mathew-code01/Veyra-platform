import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MockAIProvider, createAIProvider } from '../../src/modules/ai-gateway/ai-provider.js';

describe('MockAIProvider', () => {
  it('has correct name and providerId', () => {
    const provider = new MockAIProvider();
    expect(provider.name).toBe('Mock AI Provider');
    expect(provider.providerId).toBe('mock');
  });

  it('validates a known model and capability', async () => {
    const provider = new MockAIProvider();
    const result = await provider.validateModel('mock-text-small', 'text_generation');
    expect(result.valid).toBe(true);
    expect(result.contextLimit).toBe(4096);
  });

  it('rejects unknown model', async () => {
    const provider = new MockAIProvider();
    const result = await provider.validateModel('unknown-model', 'text_generation');
    expect(result.valid).toBe(false);
  });

  it('rejects unsupported capability for model', async () => {
    const provider = new MockAIProvider();
    const result = await provider.validateModel('mock-text-small', 'vision');
    expect(result.valid).toBe(false);
  });

  it('invokes a model and returns mock response', async () => {
    const provider = new MockAIProvider();
    const result = await provider.invoke({
      modelId: 'mock-text-small',
      capability: 'text_generation',
      input: 'Hello, world!',
    });

    expect(result.result).toBeDefined();
    expect(result.tokensInput).toBeDefined();
    expect(result.tokensOutput).toBeDefined();
    expect(result.costCents).toBeDefined();
    expect(result.costCents).toBeGreaterThan(0);
  });

  it('throws for unknown model in invoke', async () => {
    const provider = new MockAIProvider();
    await expect(
      provider.invoke({
        modelId: 'unknown-model',
        capability: 'text_generation',
        input: 'test',
      })
    ).rejects.toThrow('Model not found');
  });
});

describe('createAIProvider', () => {
  it('creates a mock provider', () => {
    const provider = createAIProvider('mock');
    expect(provider.name).toBe('Mock AI Provider');
    expect(provider.providerId).toBe('mock');
  });

  it('throws for unsupported provider', () => {
    expect(() => createAIProvider('unknown' as any)).toThrow('Unsupported AI provider');
  });
});

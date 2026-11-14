/**
 * AI provider abstraction interface.
 * Allows supported providers to be added later without rewriting gateway logic.
 *
 * No BYOK keys are stored or processed by the platform.
 * Desktop's AIManager remains authoritative for local/BYOK execution.
 */
export interface AIProvider {
  name: string;
  providerId: string;

  // Model validation
  validateModel(modelId: string, capability: string): Promise<{ valid: boolean; contextLimit?: number; costPer1kInputCents?: number; costPer1kOutputCents?: number }>;

  // Invoke the model
  invoke(params: {
    modelId: string;
    capability: string;
    input: string;
    stream?: boolean;
  }): Promise<{
    result: string;
    tokensInput?: number;
    tokensOutput?: number;
    costCents: number;
  }>;
}

/**
 * Mock AI provider for development and testing.
 * No real AI calls are made. Responses are deterministic mock data.
 */
export class MockAIProvider implements AIProvider {
  readonly name = 'Mock AI Provider';
  readonly providerId = 'mock';

  private models = new Map<string, {
    contextLimit: number;
    capabilities: string[];
    costPer1kInputCents: number;
    costPer1kOutputCents: number;
  }>();

  constructor() {
    // Register mock models
    this.registerModel('mock-text-small', {
      contextLimit: 4096,
      capabilities: ['text_generation', 'summarization'],
      costPer1kInputCents: 1,
      costPer1kOutputCents: 2,
    });
    this.registerModel('mock-text-large', {
      contextLimit: 32768,
      capabilities: ['text_generation', 'summarization', 'analysis', 'reasoning'],
      costPer1kInputCents: 3,
      costPer1kOutputCents: 6,
    });
    this.registerModel('mock-vision', {
      contextLimit: 16384,
      capabilities: ['vision', 'image_analysis'],
      costPer1kInputCents: 5,
      costPer1kOutputCents: 10,
    });
  }

  private registerModel(modelId: string, info: {
    contextLimit: number;
    capabilities: string[];
    costPer1kInputCents: number;
    costPer1kOutputCents: number;
  }) {
    this.models.set(modelId, info);
  }

  async validateModel(modelId: string, capability: string): Promise<{
    valid: boolean;
    contextLimit?: number;
    costPer1kInputCents?: number;
    costPer1kOutputCents?: number;
  }> {
    const model = this.models.get(modelId);
    if (!model) {
      return { valid: false };
    }
    if (!model.capabilities.includes(capability)) {
      return { valid: false };
    }
    return {
      valid: true,
      contextLimit: model.contextLimit,
      costPer1kInputCents: model.costPer1kInputCents,
      costPer1kOutputCents: model.costPer1kOutputCents,
    };
  }

  async invoke(params: {
    modelId: string;
    capability: string;
    input: string;
    stream?: boolean;
  }): Promise<{
    result: string;
    tokensInput?: number;
    tokensOutput?: number;
    costCents: number;
  }> {
    const model = this.models.get(params.modelId);
    if (!model) {
      throw new Error(`Model not found: ${params.modelId}`);
    }

    // Mock deterministic response
    const inputTokens = Math.ceil(params.input.length / 4);
    const outputTokens = Math.ceil((params.input.length * 0.5) / 4);
    const costCents = Math.ceil(
      (inputTokens * model.costPer1kInputCents + outputTokens * model.costPer1kOutputCents) / 1000
    );

    return {
      result: `[Mock AI response for model ${params.modelId}]\nInput: ${params.input.substring(0, 100)}...`,
      tokensInput: inputTokens,
      tokensOutput: outputTokens,
      costCents: Math.max(costCents, 1), // Minimum 1 cent
    };
  }
}

/**
 * Create an AI provider based on configuration.
 * Currently only mock is supported. Real providers can be added later.
 */
export function createAIProvider(providerId: string = 'mock'): AIProvider {
  switch (providerId) {
    case 'mock':
      return new MockAIProvider();
    default:
      throw new Error(`Unsupported AI provider: ${providerId}`);
  }
}

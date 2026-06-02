export const MODEL_PRICING = {
  text: {
    'gpt-5.1': {
      provider: 'openai' as const,
      modelId: 'gpt-5.1',
      displayName: 'GPT-5.1',
      inputPer1M: 1.25,
      outputPer1M: 10.0,
      avgCostPerMessage: 0.005,
      supportsVision: true,
      isActive: true,
      notes: 'Universal, найдвартай, vision багтаасан',
    },
    'gemini-3-flash': {
      provider: 'google' as const,
      modelId: 'gemini-3-flash',
      displayName: 'Gemini 3 Flash',
      inputPer1M: 0.50,
      outputPer1M: 3.00,
      avgCostPerMessage: 0.002,
      supportsVision: true,
      isActive: true,
      notes: 'Хурдан, хямд, vision багтаасан',
    },
    'grok-4.1-fast': {
      provider: 'xai' as const,
      modelId: 'grok-4-1-fast',
      displayName: 'Grok 4.1 Fast',
      inputPer1M: 0.20,
      outputPer1M: 0.50,
      avgCostPerMessage: 0.0007,
      supportsVision: false,
      isActive: true,
      notes: 'Хамгийн хямд, 2M context. Vision сул — зурганд Vision Model ашиглана.',
    },
  },
  vision: {
    'gpt-5.1': {
      provider: 'openai' as const,
      modelId: 'gpt-5.1',
      displayName: 'GPT-5.1',
      inputPer1M: 1.25,
      outputPer1M: 10.0,
      avgCostPerImage: 0.005,
      isActive: true,
    },
    'gemini-3-flash': {
      provider: 'google' as const,
      modelId: 'gemini-3-flash',
      displayName: 'Gemini 3 Flash',
      inputPer1M: 0.50,
      outputPer1M: 3.00,
      avgCostPerImage: 0.002,
      isActive: true,
    },
  },
  stt: {
    'whisper-1': {
      provider: 'openai' as const,
      modelId: 'whisper-1',
      displayName: 'OpenAI Whisper',
      pricePerMinute: 0.006,
      isActive: true,
      notes: 'Монгол хэл дэмждэг (mn). OpenAI key-г ашиглана.',
    },
  },
  lastUpdated: '2026-06-02',
} as const

export type TextModelId = keyof typeof MODEL_PRICING.text
export type VisionModelId = keyof typeof MODEL_PRICING.vision
export type SttModelId = keyof typeof MODEL_PRICING.stt

export function calcTextCost(modelId: TextModelId, inputTokens: number, outputTokens: number): number {
  const model = MODEL_PRICING.text[modelId]
  return (inputTokens / 1_000_000) * model.inputPer1M + (outputTokens / 1_000_000) * model.outputPer1M
}

export function calcSttCost(durationSeconds: number): number {
  return (durationSeconds / 60) * MODEL_PRICING.stt['whisper-1'].pricePerMinute
}

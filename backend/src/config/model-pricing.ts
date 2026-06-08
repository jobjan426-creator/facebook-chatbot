export const MODEL_PRICING = {
    text: {
          'gpt-4o': {
                  provider: 'openai' as const,
                  modelId: 'gpt-4o',
                  displayName: 'GPT-4o',
                  inputPer1M: 2.5,
                  outputPer1M: 10.0,
                  avgCostPerMessage: 0.005,
                  supportsVision: true,
                  isActive: true,
                  notes: 'ChatGPT 4o - текст, дуу хоолой, зураг дэмждэг',
          },
          'gemini-3-flash': {
                  provider: 'google' as const,
                  modelId: 'gemini-3-flash',
                  displayName: 'Gemini 1.5 Flash',
                  inputPer1M: 0.075,
                  outputPer1M: 0.30,
                  avgCostPerMessage: 0.0005,
                  supportsVision: true,
                  isActive: true,
                  notes: 'Gemini - зураг, PDF унших дэмждэг',
          },
          'gpt-4o-mini': {
                  provider: 'openai' as const,
                  modelId: 'gpt-4o-mini',
                  displayName: 'GPT-4o Mini',
                  inputPer1M: 0.15,
                  outputPer1M: 0.60,
                  avgCostPerMessage: 0.0003,
                  supportsVision: true,
                  isActive: true,
                  notes: 'Хямд, хурдан GPT-4o mini',
          },
    },
    vision: {
          'gpt-4o': {
                  provider: 'openai' as const,
                  modelId: 'gpt-4o',
                  displayName: 'GPT-4o Vision',
                  inputPer1M: 2.5,
                  outputPer1M: 10.0,
                  avgCostPerImage: 0.005,
                  isActive: true,
          },
          'gemini-3-flash': {
                  provider: 'google' as const,
                  modelId: 'gemini-3-flash',
                  displayName: 'Gemini 1.5 Flash Vision',
                  inputPer1M: 0.075,
                  outputPer1M: 0.30,
                  avgCostPerImage: 0.001,
                  isActive: true,
          },
    },
    stt: {
          'whisper-1': {
                  provider: 'openai' as const,
                  modelId: 'whisper-1',
                  displayName: 'Whisper',
                  costPerMinute: 0.006,
                  isActive: true,
          },
    },
} as const

export type TextModelId = keyof typeof MODEL_PRICING.text
export type VisionModelId = keyof typeof MODEL_PRICING.vision
export type SttModelId = keyof typeof MODEL_PRICING.stt

export function calcTextCost(
    modelId: TextModelId,
    inputTokens: number,
    outputTokens: number
  ): number {
    const p = MODEL_PRICING.text[modelId]
    return (inputTokens / 1_000_000) * p.inputPer1M + (outputTokens / 1_000_000) * p.outputPer1M
}

import { generateText, CoreMessage } from 'ai'
import { createOpenAI } from '@ai-sdk/openai'
import { createGoogleGenerativeAI } from '@ai-sdk/google'

import { decrypt } from './crypto.service.js'
import { prisma } from '../lib/prisma.js'
import { MODEL_PRICING, TextModelId, VisionModelId, calcTextCost } from '../config/model-pricing.js'
import { Tenant, TenantApiKeys } from '@prisma/client'

type TenantWithKeys = Tenant & { apiKeys: TenantApiKeys | null }

function getDecryptedKeys(keys: TenantApiKeys | null) {
  return {
    openaiKey: keys?.openaiKey ? decrypt(keys.openaiKey) : undefined,
    geminiKey: keys?.geminiKey ? decrypt(keys.geminiKey) : undefined,
    xaiKey: keys?.xaiKey ? decrypt(keys.xaiKey) : undefined,
  }
}

function getTextProvider(tenant: TenantWithKeys) {
  const modelId = tenant.textModel as TextModelId
  const pricing = (MODEL_PRICING.text as any)[modelId]
  const keys = getDecryptedKeys(tenant.apiKeys)

  if (pricing.provider === 'openai') {
    if (!keys.openaiKey) throw new Error('OpenAI API key not configured')
    return { model: createOpenAI({ apiKey: keys.openaiKey })(pricing.modelId), pricing }
  }
  if (pricing.provider === 'google') {
    if (!keys.geminiKey) throw new Error('Gemini API key not configured')
    return { model: createGoogleGenerativeAI({ apiKey: keys.geminiKey })(pricing.modelId), pricing }
  }
  throw new Error(`Unknown provider for model ${modelId}`)
}

function getVisionProvider(tenant: TenantWithKeys) {
  const modelId = tenant.visionModel as VisionModelId
  const pricing = (MODEL_PRICING.vision as any)[modelId]
  const keys = getDecryptedKeys(tenant.apiKeys)

  if (pricing.provider === 'openai') {
    if (!keys.openaiKey) throw new Error('OpenAI API key not configured')
    return createOpenAI({ apiKey: keys.openaiKey })(pricing.modelId)
  }
  if (pricing.provider === 'google') {
    if (!keys.geminiKey) throw new Error('Gemini API key not configured')
    return createGoogleGenerativeAI({ apiKey: keys.geminiKey })(pricing.modelId)
  }
  throw new Error(`Unknown vision provider`)
}

export interface GenerateReplyOptions {
  tenant: TenantWithKeys
  history: CoreMessage[]
  ragContext?: string
  imageUrl?: string
  conversationId?: string
}

export async function generateReply(opts: GenerateReplyOptions): Promise<string> {
  const { tenant, history, ragContext, imageUrl, conversationId } = opts

  const textModelId = tenant.textModel as TextModelId
  const textModelConfig = MODEL_PRICING.text[textModelId]

  let systemPrompt = tenant.aiPersona
  const now = new Date().toLocaleString('mn-MN', { timeZone: tenant.timezone })
  systemPrompt += `\n\nОдоогийн цаг: ${now}`

  if (ragContext) {
    systemPrompt += `\n\nМэдлэгийн сангаас холбогдох мэдээлэл:\n${ragContext}`
  }

  let messages = [...history]

  // Vision fallback for Grok: analyze image with vision model first
  if (imageUrl && !textModelConfig.supportsVision) {
    const visionModel = getVisionProvider(tenant)
    const visionResult = await generateText({
      model: visionModel,
      messages: [
        {
          role: 'user',
          content: [{ type: 'image', image: imageUrl }, { type: 'text', text: 'Энэ зургийг тайлбарла.' }],
        },
      ],
    })
    const lastMsg = messages[messages.length - 1]
    if (lastMsg && lastMsg.role === 'user' && typeof lastMsg.content === 'string') {
      messages[messages.length - 1] = {
        ...lastMsg,
        content: `${lastMsg.content}\n\n[Зургийн тайлбар: ${visionResult.text}]`,
      }
    }
  } else if (imageUrl && textModelConfig.supportsVision) {
    // Replace last user text with multimodal content
    const lastIdx = messages.length - 1
    const lastMsg = messages[lastIdx]
    if (lastMsg?.role === 'user') {
      messages[lastIdx] = {
        role: 'user',
        content: [
          { type: 'image', image: imageUrl },
          { type: 'text', text: typeof lastMsg.content === 'string' ? lastMsg.content : '' },
        ],
      }
    }
  }

  const { model } = getTextProvider(tenant)

  const result = await generateText({ model, system: systemPrompt, messages })

  // Log usage
  const cost = calcTextCost(textModelId, result.usage.promptTokens, result.usage.completionTokens)
  await prisma.aiUsageLog.create({
    data: {
      tenantId: tenant.id,
      category: 'text',
      provider: textModelConfig.provider,
      modelId: textModelId,
      inputTokens: result.usage.promptTokens,
      outputTokens: result.usage.completionTokens,
      estimatedCostUsd: cost,
      conversationId,
    },
  })

  // Auto-handoff detection
  const handoffKeywords = ['оператор', 'менежер', 'хүн', 'гомдол', 'буцаалт', 'operator', 'manager']
  const userMessages = messages.filter((m) => m.role === 'user')
  const lastUserContent = userMessages[userMessages.length - 1]?.content
  const lastUserText = typeof lastUserContent === 'string' ? lastUserContent : ''

  if (handoffKeywords.some((kw) => lastUserText.toLowerCase().includes(kw))) {
    if (conversationId) {
      await prisma.conversation.update({
        where: { id: conversationId },
        data: { status: 'awaiting_human', handoffReason: 'Keyword trigger: ' + lastUserText.slice(0, 100) },
      })
    }
  }

  return result.text
}

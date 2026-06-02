import { decrypt } from './crypto.service.js'
import { prisma } from '../lib/prisma.js'
import { calcSttCost } from '../config/model-pricing.js'
import FormData from 'form-data'
import fetch from 'node-fetch'

export async function transcribeAudio(
  audioUrl: string,
  tenantId: string,
  conversationId?: string
): Promise<string> {
  const keys = await prisma.tenantApiKeys.findUnique({ where: { tenantId } })
  if (!keys?.openaiKey) throw new Error('OpenAI API key not configured for voice transcription')

  const apiKey = decrypt(keys.openaiKey)

  // Download audio from Meta URL
  const audioRes = await fetch(audioUrl)
  if (!audioRes.ok) throw new Error('Failed to download audio from Meta')

  const audioBuffer = await audioRes.buffer()
  const contentType = audioRes.headers.get('content-type') || 'audio/mpeg'

  // Prepare FormData for Whisper API
  const form = new FormData()
  form.append('file', audioBuffer, {
    filename: 'audio.mp3',
    contentType,
  })
  form.append('model', 'whisper-1')
  form.append('language', 'mn') // Mongolian
  form.append('response_format', 'json')

  const whisperRes = await fetch('https://api.openai.com/v1/audio/transcriptions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      ...form.getHeaders(),
    },
    body: form,
  })

  if (!whisperRes.ok) {
    const err = await whisperRes.text()
    throw new Error(`Whisper API error: ${err}`)
  }

  const result = (await whisperRes.json()) as { text: string; duration?: number }

  // Log STT usage
  const durationSeconds = result.duration || 0
  const cost = calcSttCost(durationSeconds)

  await prisma.aiUsageLog.create({
    data: {
      tenantId,
      category: 'stt',
      provider: 'openai',
      modelId: 'whisper-1',
      durationSeconds,
      estimatedCostUsd: cost,
      conversationId,
    },
  })

  return result.text
}

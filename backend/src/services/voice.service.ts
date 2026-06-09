import { decrypt } from './crypto.service.js'
import { prisma } from '../lib/prisma.js'
import { calcSttCost } from '../config/model-pricing.js'
import FormData from 'form-data'
import fetch from 'node-fetch'
import pino from 'pino'

const logger = pino()
const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta'

async function transcribeWithWhisper(
  audioBuffer: Buffer,
  contentType: string,
  apiKey: string,
  tenantId: string,
  conversationId?: string
): Promise<string> {
  const form = new FormData()
  form.append('file', audioBuffer, {
    filename: 'audio.mp3',
    contentType,
  })
  form.append('model', 'whisper-1')
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

async function transcribeWithGemini(
  audioBuffer: Buffer,
  mimeType: string,
  apiKey: string,
  tenantId: string,
  conversationId?: string
): Promise<string> {
  const base64Audio = audioBuffer.toString('base64')

  const requestBody = {
    contents: [
      {
        parts: [
          {
            inlineData: {
              mimeType: mimeType.startsWith('audio/') ? mimeType : 'audio/mpeg',
              data: base64Audio,
            },
          },
          {
            text: 'Энэ дуут мессежийн агуулгыг яг байгаагаар нь бичгээр гарга. Хэл солихгүйгээр зөвхөн агуулгыг бичнэ үү.',
          },
        ],
      },
    ],
  }

  const res = await fetch(
    `${GEMINI_BASE}/models/gemini-1.5-flash:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody),
    }
  )

  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Gemini audio transcription error: ${err}`)
  }

  const data = (await res.json()) as {
    candidates?: Array<{ content: { parts: Array<{ text?: string }> } }>
  }

  const transcript = data.candidates?.[0]?.content?.parts?.[0]?.text
  if (!transcript) throw new Error('Gemini returned empty transcription')

  const durationSeconds = audioBuffer.length / 16000 // rough estimate
  await prisma.aiUsageLog.create({
    data: {
      tenantId,
      category: 'stt',
      provider: 'google',
      modelId: 'gemini-1.5-flash',
      durationSeconds,
      estimatedCostUsd: 0,
      conversationId,
    },
  })

  return transcript
}

export async function transcribeAudio(
  audioUrl: string,
  tenantId: string,
  conversationId?: string
): Promise<string> {
  const keys = await prisma.tenantApiKeys.findUnique({ where: { tenantId } })

  if (!keys?.openaiKey && !keys?.geminiKey) {
    throw new Error('Voice transcription requires OpenAI or Gemini API key')
  }

  // Download audio from Meta CDN
  const audioRes = await fetch(audioUrl)
  if (!audioRes.ok) throw new Error(`Failed to download audio from Meta: ${audioRes.status}`)

  const audioBuffer = await audioRes.buffer()
  const contentType = audioRes.headers.get('content-type') || 'audio/mpeg'

  // Prefer Whisper (OpenAI) — fall back to Gemini if no OpenAI key
  if (keys.openaiKey) {
    logger.info({ tenantId }, 'Transcribing with Whisper')
    return transcribeWithWhisper(
      audioBuffer,
      contentType,
      decrypt(keys.openaiKey),
      tenantId,
      conversationId
    )
  }

  logger.info({ tenantId }, 'No OpenAI key — transcribing with Gemini')
  return transcribeWithGemini(
    audioBuffer,
    contentType,
    decrypt(keys.geminiKey!),
    tenantId,
    conversationId
  )
}

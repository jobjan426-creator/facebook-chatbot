import { decrypt } from './crypto.service.js'
import { prisma } from '../lib/prisma.js'
import fetch from 'node-fetch'
import pino from 'pino'

const logger = pino()
const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta'

function normalizeMimeType(rawType: string): string {
  if (rawType.includes('ogg')) return 'audio/ogg'
  if (rawType.includes('mp4') || rawType.includes('m4a')) return 'audio/mp4'
  if (rawType.includes('aac')) return 'audio/aac'
  if (rawType.includes('wav')) return 'audio/wav'
  if (rawType.includes('webm')) return 'audio/webm'
  if (rawType.startsWith('audio/')) return rawType.split(';')[0].trim()
  if (rawType.includes('jpeg') || rawType.includes('jpg')) return 'image/jpeg'
  if (rawType.includes('png')) return 'image/png'
  if (rawType.includes('webp')) return 'image/webp'
  if (rawType.startsWith('image/')) return rawType.split(';')[0].trim()
  return rawType
}

async function callGemini(
  apiKey: string,
  parts: object[]
): Promise<string> {
  const res = await fetch(
    `${GEMINI_BASE}/models/gemini-1.5-flash:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents: [{ parts }] }),
    }
  )

  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Gemini API error: ${err}`)
  }

  const data = (await res.json()) as {
    candidates?: Array<{ content: { parts: Array<{ text?: string }> } }>
  }

  const text = data.candidates?.[0]?.content?.parts?.[0]?.text
  if (!text) throw new Error('Gemini returned empty response')
  return text
}

export async function analyzeImage(
  tenantId: string,
  imageBuffer: Buffer,
  mimeType: string,
  userQuestion: string
): Promise<string> {
  const keys = await prisma.tenantApiKeys.findUnique({ where: { tenantId } })
  if (!keys?.geminiKey) throw new Error('Gemini API key required for image analysis')
  const apiKey = decrypt(keys.geminiKey)

  const normalizedMime = normalizeMimeType(mimeType) || 'image/jpeg'
  const base64 = imageBuffer.toString('base64')

  logger.info({ tenantId, mimeType: normalizedMime, sizeKb: Math.round(imageBuffer.length / 1024) }, 'Analyzing image with Gemini')

  return callGemini(apiKey, [
    { inlineData: { mimeType: normalizedMime, data: base64 } },
    { text: `Энэ зургийг харж дэлгэрэнгүй тайлбарла. Харагдаж байгаа бүх зүйлийг дурдаарай. Хэрэглэгч дараах зүйлийг асуусан байна: "${userQuestion}"` },
  ])
}

export async function transcribeAudioWithGemini(
  tenantId: string,
  audioBuffer: Buffer,
  mimeType: string
): Promise<string> {
  const keys = await prisma.tenantApiKeys.findUnique({ where: { tenantId } })
  if (!keys?.geminiKey) throw new Error('Gemini API key required for audio transcription')
  const apiKey = decrypt(keys.geminiKey)

  const normalizedMime = normalizeMimeType(mimeType) || 'audio/mpeg'
  const base64 = audioBuffer.toString('base64')

  logger.info({ tenantId, mimeType: normalizedMime, sizeKb: Math.round(audioBuffer.length / 1024) }, 'Transcribing audio with Gemini')

  return callGemini(apiKey, [
    { inlineData: { mimeType: normalizedMime, data: base64 } },
    { text: 'Энэ аудио дахь яриаг яг байгаагаар нь бичгээр гарга. Зөвхөн хэлсэн үгийг бичнэ, тайлбар нэмэхгүй.' },
  ])
}

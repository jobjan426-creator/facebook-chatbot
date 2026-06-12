import { decrypt } from './crypto.service.js'
import { prisma } from '../lib/prisma.js'
import { calcSttCost, GEMINI_MODEL_ID } from '../config/model-pricing.js'
import { generateContentWithFallback } from './gemini-client.js'
import FormData from 'form-data'
import fetch from 'node-fetch'
import pino from 'pino'

const logger = pino()

// Whisper picks its decoder based on the filename extension, not the
// Content-Type header. Facebook voice messages are usually served as
// audio/mp4 (AAC/m4a); naming the upload "audio.mp3" makes Whisper try to
// parse an mp4 container as mp3 and reject the whole file.
function extensionForContentType(contentType: string): string {
  const type = contentType.toLowerCase()
  if (type.includes('mp4') || type.includes('m4a') || type.includes('aac')) return 'm4a'
  if (type.includes('ogg')) return 'ogg'
  if (type.includes('wav')) return 'wav'
  if (type.includes('webm')) return 'webm'
  if (type.includes('mpeg') || type.includes('mp3')) return 'mp3'
  return 'mp3'
}

// Mongolian and Kazakh both use Cyrillic with heavy overlap, but Kazakh has
// several letters that don't exist in Mongolian (Әә ҒғҚқ Ңң Ұұ Іі Һһ). When
// Whisper misdetects short/quiet Mongolian clips as Kazakh, it "transcribes"
// them phonetically using these letters, producing fluent-looking but
// meaningless gibberish. Treat their presence as a failed transcription.
function looksLikeKazakh(text: string): boolean {
  return /[әғқңұіһӘҒҚҢҰІҺ]/.test(text)
}

// SonorAI only accepts wav, mp3, m4a, ogg, webm as `mime`.
function mimeForSonor(contentType: string): string {
  const type = contentType.toLowerCase()
  if (type.includes('wav')) return 'audio/wav'
  if (type.includes('mp4') || type.includes('m4a') || type.includes('aac')) return 'audio/m4a'
  if (type.includes('ogg')) return 'audio/ogg'
  if (type.includes('webm')) return 'audio/webm'
  return 'audio/mpeg'
}

async function transcribeWithWhisper(
  audioBuffer: Buffer,
  contentType: string,
  apiKey: string,
  tenantId: string,
  conversationId?: string
): Promise<string> {
  const form = new FormData()
  form.append('file', audioBuffer, {
    filename: `audio.${extensionForContentType(contentType)}`,
    contentType,
  })
  form.append('model', 'whisper-1')
  form.append('response_format', 'json')
  // The API rejects language="mn" outright, so bias the model toward
  // Mongolian via a Mongolian-language prompt instead — without this,
  // short/quiet clips are sometimes misdetected as English and Whisper
  // hallucinates generic English filler text instead of transcribing.
  form.append('prompt', 'Сайн байна уу. Энэ бол монгол хэл дээрх дуут мессеж.')

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

  if (looksLikeKazakh(result.text)) {
    throw new Error(`Whisper misdetected language as Kazakh: "${result.text}"`)
  }

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

  const result = await generateContentWithFallback(apiKey, JSON.stringify(requestBody))
  if (!result.ok) throw new Error(`Gemini audio transcription error: ${result.err}`)

  const transcript = result.text
  if (!transcript) throw new Error('Gemini returned empty transcription')
  if (looksLikeKazakh(transcript)) {
    throw new Error(`Gemini misdetected language as Kazakh: "${transcript}"`)
  }

  const durationSeconds = audioBuffer.length / 16000 // rough estimate
  await prisma.aiUsageLog.create({
    data: {
      tenantId,
      category: 'stt',
      provider: 'google',
      modelId: GEMINI_MODEL_ID,
      durationSeconds,
      estimatedCostUsd: 0,
      conversationId,
    },
  })

  return transcript
}

async function transcribeWithSonor(
  audioBuffer: Buffer,
  contentType: string,
  apiKey: string,
  tenantId: string,
  conversationId?: string
): Promise<string> {
  const base64Audio = audioBuffer.toString('base64')

  const res = await fetch('https://sonor.online/v1/stt', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      audio: base64Audio,
      mime: mimeForSonor(contentType),
      lang: 'mn',
    }),
  })

  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Sonor STT API error: ${err}`)
  }

  const result = (await res.json()) as { text?: string; words?: number }
  if (!result.text) throw new Error('Sonor returned empty transcription')

  const durationSeconds = audioBuffer.length / 16000 // rough estimate
  await prisma.aiUsageLog.create({
    data: {
      tenantId,
      category: 'stt',
      provider: 'sonor',
      modelId: 'sonor-stt',
      durationSeconds,
      estimatedCostUsd: 0,
      conversationId,
    },
  })

  return result.text
}

export async function transcribeAudio(
  audioUrl: string,
  tenantId: string,
  conversationId?: string
): Promise<string> {
  const keys = await prisma.tenantApiKeys.findUnique({ where: { tenantId } })

  if (!keys?.sonorKey && !keys?.openaiKey && !keys?.geminiKey) {
    throw new Error('Voice transcription requires a Sonor, OpenAI, or Gemini API key')
  }

  // Download audio from Meta CDN
  const audioRes = await fetch(audioUrl)
  if (!audioRes.ok) throw new Error(`Failed to download audio from Meta: ${audioRes.status}`)

  const audioBuffer = await audioRes.buffer()
  const contentType = audioRes.headers.get('content-type') || 'audio/mpeg'

  // SonorAI is purpose-built for Mongolian STT (explicit lang="mn") and has
  // proven more reliable than Gemini/Whisper for this tenant's audio. Try it
  // first, then Gemini, falling back to Whisper last.
  if (keys.sonorKey) {
    try {
      logger.info({ tenantId }, 'Transcribing with Sonor')
      return await transcribeWithSonor(
        audioBuffer,
        contentType,
        decrypt(keys.sonorKey),
        tenantId,
        conversationId
      )
    } catch (err) {
      if (!keys.geminiKey && !keys.openaiKey) throw err
      logger.warn(
        { tenantId, err: err instanceof Error ? err.message : String(err) },
        'Sonor transcription failed — trying next provider'
      )
    }
  }

  // Gemini has proven far more reliable than Whisper for Mongolian audio —
  // Whisper repeatedly misdetects Mongolian as English/Kazakh and produces
  // fluent-sounding gibberish. Prefer Gemini when a key is available, and
  // only fall back to Whisper if Gemini fails or no Gemini key is set.
  if (keys.geminiKey) {
    try {
      logger.info({ tenantId }, 'Transcribing with Gemini')
      return await transcribeWithGemini(
        audioBuffer,
        contentType,
        decrypt(keys.geminiKey),
        tenantId,
        conversationId
      )
    } catch (err) {
      if (!keys.openaiKey) throw err
      logger.warn(
        { tenantId, err: err instanceof Error ? err.message : String(err) },
        'Gemini transcription failed — trying Whisper'
      )
    }
  }

  logger.info({ tenantId }, 'Transcribing with Whisper')
  return transcribeWithWhisper(
    audioBuffer,
    contentType,
    decrypt(keys.openaiKey!),
    tenantId,
    conversationId
  )
}

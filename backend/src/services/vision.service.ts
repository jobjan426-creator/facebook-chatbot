import { decrypt } from './crypto.service.js'
import { prisma } from '../lib/prisma.js'
import { GEMINI_MODEL_ID } from '../config/model-pricing.js'
import fetch from 'node-fetch'
import pino from 'pino'

const logger = pino()
const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta'
const GEMINI_UPLOAD_BASE = 'https://generativelanguage.googleapis.com/upload/v1beta'

async function uploadToGeminiFileAPI(
  apiKey: string,
  buffer: Buffer,
  mimeType: string,
  displayName: string
): Promise<string> {
  const initRes = await fetch(`${GEMINI_UPLOAD_BASE}/files?key=${apiKey}`, {
    method: 'POST',
    headers: {
      'X-Goog-Upload-Protocol': 'resumable',
      'X-Goog-Upload-Command': 'start',
      'X-Goog-Upload-Header-Content-Length': String(buffer.length),
      'X-Goog-Upload-Header-Content-Type': mimeType,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ file: { displayName } }),
  })
  if (!initRes.ok) throw new Error(`File upload init failed: ${await initRes.text()}`)

  const uploadUrl = initRes.headers.get('x-goog-upload-url')
  if (!uploadUrl) throw new Error('No upload URL returned')

  const uploadRes = await fetch(uploadUrl, {
    method: 'POST',
    headers: {
      'Content-Length': String(buffer.length),
      'X-Goog-Upload-Offset': '0',
      'X-Goog-Upload-Command': 'upload, finalize',
    },
    body: buffer,
  })
  if (!uploadRes.ok) throw new Error(`File upload failed: ${await uploadRes.text()}`)

  const uploaded = (await uploadRes.json()) as { file: { name: string; state?: string } }
  const fileId = uploaded.file.name

  // Wait for ACTIVE state (small files are usually instant, but audio/images may take a moment)
  if (uploaded.file.state === 'PROCESSING') {
    await waitForFileActive(apiKey, fileId)
  }

  return fileId
}

async function waitForFileActive(apiKey: string, fileId: string): Promise<void> {
  for (let i = 0; i < 10; i++) {
    await new Promise((r) => setTimeout(r, 1000))
    const res = await fetch(`${GEMINI_BASE}/${fileId}?key=${apiKey}`)
    if (!res.ok) return
    const data = (await res.json()) as { state?: string }
    if (data.state === 'ACTIVE') return
    if (data.state === 'FAILED') throw new Error('Gemini file processing failed')
  }
}

async function queryGeminiWithFile(
  apiKey: string,
  fileId: string,
  mimeType: string,
  prompt: string
): Promise<string> {
  const res = await fetch(
    `${GEMINI_BASE}/models/${GEMINI_MODEL_ID}:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          parts: [
            { fileData: { mimeType, fileUri: `${GEMINI_BASE}/${fileId}` } },
            { text: prompt },
          ],
        }],
      }),
    }
  )
  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Gemini generate failed: ${err}`)
  }
  const data = (await res.json()) as {
    candidates?: Array<{ content: { parts: Array<{ text?: string }> } }>
  }
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text
  if (!text) throw new Error('Empty response from Gemini')
  return text
}

async function getGeminiKey(tenantId: string): Promise<string> {
  const keys = await prisma.tenantApiKeys.findUnique({ where: { tenantId } })
  if (!keys?.geminiKey) throw new Error('Gemini API key not configured for this tenant')
  return decrypt(keys.geminiKey)
}

export async function analyzeImage(
  tenantId: string,
  imageBuffer: Buffer,
  mimeType: string,
  userQuestion: string
): Promise<string> {
  const apiKey = await getGeminiKey(tenantId)
  const cleanMime = mimeType.split(';')[0].trim() || 'image/jpeg'

  logger.info({ tenantId, mimeType: cleanMime, sizeKb: Math.round(imageBuffer.length / 1024) }, 'Uploading image to Gemini')

  const fileId = await uploadToGeminiFileAPI(apiKey, imageBuffer, cleanMime, 'image')
  const prompt = `Энэ зургийг харж дэлгэрэнгүй тайлбарла. Харагдаж байгаа бүх объект, тоног төхөөрөмж, зүйлсийг нэрлэ. Хэрэглэгч дараах зүйлийг асуусан байна: "${userQuestion}"`

  try {
    const result = await queryGeminiWithFile(apiKey, fileId, cleanMime, prompt)
    logger.info({ tenantId }, 'Image analyzed successfully')
    return result
  } finally {
    // Clean up uploaded file (fire and forget)
    fetch(`${GEMINI_BASE}/${fileId}?key=${apiKey}`, { method: 'DELETE' }).catch(() => {})
  }
}

export async function transcribeAudioWithGemini(
  tenantId: string,
  audioBuffer: Buffer,
  rawMimeType: string
): Promise<string> {
  const apiKey = await getGeminiKey(tenantId)

  // Normalize MIME type for Gemini support
  let mimeType: string
  if (rawMimeType.includes('ogg')) mimeType = 'audio/ogg'
  else if (rawMimeType.includes('m4a') || (rawMimeType.includes('mp4') && rawMimeType.includes('audio'))) mimeType = 'audio/mp4'
  else if (rawMimeType.includes('aac')) mimeType = 'audio/aac'
  else if (rawMimeType.includes('wav')) mimeType = 'audio/wav'
  else if (rawMimeType.includes('webm')) mimeType = 'audio/webm'
  else mimeType = 'audio/mpeg'

  logger.info({ tenantId, mimeType, sizeKb: Math.round(audioBuffer.length / 1024) }, 'Uploading audio to Gemini')

  const fileId = await uploadToGeminiFileAPI(apiKey, audioBuffer, mimeType, 'voice_message')
  const prompt = 'Энэ аудио дахь яриаг яг байгаагаар нь бичгээр гарга. Зөвхөн хэлсэн үгийг бичнэ, тайлбар нэмэхгүй.'

  try {
    const result = await queryGeminiWithFile(apiKey, fileId, mimeType, prompt)
    logger.info({ tenantId }, 'Audio transcribed successfully')
    return result
  } finally {
    fetch(`${GEMINI_BASE}/${fileId}?key=${apiKey}`, { method: 'DELETE' }).catch(() => {})
  }
}

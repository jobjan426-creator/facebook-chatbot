import { decrypt } from './crypto.service.js'
import { prisma } from '../lib/prisma.js'
import { GEMINI_MODEL_ID } from '../config/model-pricing.js'
import { PDFParse } from 'pdf-parse'
import fetch from 'node-fetch'
import pino from 'pino'

const logger = pino()
const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta'
const GEMINI_UPLOAD_BASE = 'https://generativelanguage.googleapis.com/upload/v1beta'

const MAX_TEXT_CHARS = 80_000

async function extractTextFromBuffer(buffer: Buffer, mimeType: string): Promise<string | null> {
  if (mimeType !== 'application/pdf') return null
  try {
    const parser = new PDFParse({ data: buffer })
    const result = await parser.getText()
    await parser.destroy()
    return result.text.slice(0, MAX_TEXT_CHARS)
  } catch (err) {
    logger.warn({ err }, 'PDF text extraction failed')
    return null
  }
}

const GEMINI_FALLBACK_MODEL_ID = 'gemini-2.0-flash'

async function callGemini(
  apiKey: string,
  modelId: string,
  body: string
): Promise<{ ok: true; text: string } | { ok: false; status: number; err: string }> {
  const res = await fetch(
    `${GEMINI_BASE}/models/${modelId}:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
    }
  )
  if (res.ok) {
    const data = (await res.json()) as {
      candidates?: Array<{ content: { parts: Array<{ text?: string }> } }>
    }
    return { ok: true, text: data.candidates?.[0]?.content?.parts?.[0]?.text || '' }
  }
  return { ok: false, status: res.status, err: await res.text() }
}

async function queryGeminiWithText(apiKey: string, combinedText: string, question: string): Promise<string> {
  const body = JSON.stringify({
    contents: [{
      parts: [{
        text: `Дараах баримт бичгүүд:\n\n${combinedText}\n\nДээрх баримт бичгүүд дээр үндэслэн дараах асуултад нарийвчлан, дэлгэрэнгүй хариул: ${question}`,
      }],
    }],
  })

  for (let attempt = 1; attempt <= 3; attempt++) {
    const result = await callGemini(apiKey, GEMINI_MODEL_ID, body)
    if (result.ok) return result.text

    const retriable = result.status === 503 || result.status === 429
    if (!retriable || attempt === 3) {
      logger.warn({ err: result.err, attempt }, 'RAG text query failed')
      break
    }
    logger.warn({ err: result.err, attempt }, 'RAG text query failed, retrying')
    await new Promise((r) => setTimeout(r, attempt * 1000))
  }

  // Last resort: try a different Gemini model in case the primary one is overloaded.
  // Never fall back to the raw combinedText here — for some PDFs the locally
  // extracted text decodes into the wrong script/language (e.g. due to custom
  // font encodings), and dumping that into the prompt causes the AI to reply
  // in that wrong language.
  const fallback = await callGemini(apiKey, GEMINI_FALLBACK_MODEL_ID, body)
  if (fallback.ok) return fallback.text

  logger.warn({ err: fallback.err }, 'RAG fallback model also failed')
  return ''
}

async function queryGeminiWithFileIds(
  apiKey: string,
  files: Array<{ mimeType: string; geminiFileId: string | null; fileName: string }>,
  question: string
): Promise<string> {
  const fileParts = files
    .filter((f): f is typeof f & { geminiFileId: string } => f.geminiFileId !== null)
    .map((f) => ({
      fileData: {
        mimeType: f.mimeType,
        fileUri: `https://generativelanguage.googleapis.com/v1beta/${f.geminiFileId}`,
      },
    }))

  if (fileParts.length === 0) return ''

  const res = await fetch(
    `${GEMINI_BASE}/models/${GEMINI_MODEL_ID}:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          parts: [
            ...fileParts,
            { text: `Дараах асуултад дэлгэрэнгүй хариул: ${question}` },
          ],
        }],
      }),
    }
  )

  if (!res.ok) {
    const err = await res.text()
    logger.warn({ err }, 'RAG File API query failed (file may be expired)')
    return ''
  }

  const data = (await res.json()) as {
    candidates?: Array<{ content: { parts: Array<{ text?: string }> } }>
  }
  return data.candidates?.[0]?.content?.parts?.[0]?.text || ''
}

export async function uploadFileToGemini(
  tenantId: string,
  fileBuffer: Buffer,
  fileName: string,
  mimeType: string,
  fileSize: number
): Promise<string> {
  const keys = await prisma.tenantApiKeys.findUnique({ where: { tenantId } })
  if (!keys?.geminiKey) throw new Error('Gemini API key required for knowledge base')
  const apiKey = decrypt(keys.geminiKey)

  // Step 1: Start resumable upload session
  const initRes = await fetch(`${GEMINI_UPLOAD_BASE}/files?key=${apiKey}`, {
    method: 'POST',
    headers: {
      'X-Goog-Upload-Protocol': 'resumable',
      'X-Goog-Upload-Command': 'start',
      'X-Goog-Upload-Header-Content-Length': String(fileSize),
      'X-Goog-Upload-Header-Content-Type': mimeType,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ file: { displayName: fileName } }),
  })

  if (!initRes.ok) {
    const err = await initRes.text()
    throw new Error(`Gemini upload init failed: ${err}`)
  }

  const uploadUrl = initRes.headers.get('x-goog-upload-url')
  if (!uploadUrl) throw new Error('Gemini did not return upload URL')

  // Step 2: Upload file content
  const uploadRes = await fetch(uploadUrl, {
    method: 'POST',
    headers: {
      'Content-Length': String(fileSize),
      'X-Goog-Upload-Offset': '0',
      'X-Goog-Upload-Command': 'upload, finalize',
    },
    body: fileBuffer,
  })

  if (!uploadRes.ok) {
    const err = await uploadRes.text()
    throw new Error(`Gemini file upload failed: ${err}`)
  }

  const uploaded = (await uploadRes.json()) as { file: { name: string } }
  const geminiFileId = uploaded.file.name

  // Extract text locally so we don't depend on 48h Gemini File TTL
  const textContent = await extractTextFromBuffer(fileBuffer, mimeType)
  if (textContent) {
    logger.info({ tenantId, fileName, chars: textContent.length }, 'PDF text extracted')
  }

  await prisma.tenantKnowledgeFile.create({
    data: { tenantId, fileName, fileSize, mimeType, geminiFileId, textContent },
  })

  return geminiFileId
}

type KnowledgeFileRow = {
  fileName: string
  textContent: string | null
  geminiFileId: string | null
  mimeType: string
}

export async function queryKnowledgeBase(
  tenantId: string,
  question: string
): Promise<string> {
  const keys = await prisma.tenantApiKeys.findUnique({ where: { tenantId } })
  if (!keys?.geminiKey) return ''
  const apiKey = decrypt(keys.geminiKey)

  const files = (await prisma.tenantKnowledgeFile.findMany({
    where: { tenantId },
    select: { fileName: true, textContent: true, geminiFileId: true, mimeType: true },
  })) as KnowledgeFileRow[]

  if (files.length === 0) return ''

  // Prefer locally stored text content (no TTL issue)
  const filesWithText = files.filter((f) => f.textContent)
  if (filesWithText.length > 0) {
    const combinedText = filesWithText
      .map((f) => `=== ${f.fileName} ===\n${f.textContent}`)
      .join('\n\n')
    logger.info({ tenantId, fileCount: filesWithText.length }, 'RAG using stored text content')
    return queryGeminiWithText(apiKey, combinedText, question)
  }

  // Fallback: use Gemini File API (for files uploaded before text extraction was added)
  // Note: these files expire after 48h
  const filesWithGemini = files.filter((f) => f.geminiFileId)
  if (filesWithGemini.length > 0) {
    logger.info({ tenantId }, 'RAG falling back to Gemini File API (re-upload PDF to use local text extraction)')
    return queryGeminiWithFileIds(apiKey, filesWithGemini, question)
  }

  return ''
}

export async function deleteFileFromGemini(
  tenantId: string,
  fileId: string
): Promise<void> {
  const keys = await prisma.tenantApiKeys.findUnique({ where: { tenantId } })
  const file = await prisma.tenantKnowledgeFile.findUnique({ where: { id: fileId } })
  if (!file || file.tenantId !== tenantId) return

  if (file.geminiFileId && keys?.geminiKey) {
    const apiKey = decrypt(keys.geminiKey)
    await fetch(`${GEMINI_BASE}/${file.geminiFileId}?key=${apiKey}`, { method: 'DELETE' })
  }

  await prisma.tenantKnowledgeFile.delete({ where: { id: fileId } })
}

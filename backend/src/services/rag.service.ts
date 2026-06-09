import { decrypt } from './crypto.service.js'
import { prisma } from '../lib/prisma.js'
import fetch from 'node-fetch'
import pino from 'pino'
// pdf-parse uses CommonJS module.exports — use require to avoid ESM interop issues
// eslint-disable-next-line @typescript-eslint/no-require-imports
const pdfParse: (buffer: Buffer) => Promise<{ text: string }> = require('pdf-parse')

const logger = pino()
const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta'
const GEMINI_UPLOAD_BASE = 'https://generativelanguage.googleapis.com/upload/v1beta'

// Max characters to store per file — ~80K chars ≈ 20K tokens, safe for all models
const MAX_TEXT_CHARS = 80_000

async function extractTextFromBuffer(buffer: Buffer, mimeType: string): Promise<string | null> {
  if (mimeType !== 'application/pdf') return null
  try {
    const data = await pdfParse(buffer)
    return data.text.slice(0, MAX_TEXT_CHARS)
  } catch (err) {
    logger.warn({ err }, 'PDF text extraction failed')
    return null
  }
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

  // Extract text from PDF for local storage (avoids 48h Gemini File API TTL)
  const textContent = await extractTextFromBuffer(fileBuffer, mimeType)
  if (textContent) {
    logger.info({ tenantId, fileName, chars: textContent.length }, 'PDF text extracted for local RAG')
  } else {
    logger.warn({ tenantId, fileName, mimeType }, 'Could not extract text from file — RAG will be limited')
  }

  await prisma.tenantKnowledgeFile.create({
    data: {
      tenantId,
      fileName,
      fileSize,
      mimeType,
      geminiFileId,
      textContent,
    },
  })

  return geminiFileId
}

type KnowledgeFileRow = { fileName: string; textContent: string | null }

export async function queryKnowledgeBase(
  tenantId: string,
  question: string
): Promise<string> {
  const files = (await prisma.tenantKnowledgeFile.findMany({
    where: { tenantId },
    select: { fileName: true, textContent: true },
  })) as KnowledgeFileRow[]

  if (files.length === 0) return ''

  const filesWithText = files.filter((f) => f.textContent)
  if (filesWithText.length === 0) {
    logger.warn({ tenantId }, 'Knowledge files exist but have no extracted text — user should re-upload')
    return ''
  }

  // Build context from stored text — no Gemini File API TTL issue
  const combinedText = filesWithText
    .map((f) => `=== ${f.fileName} ===\n${f.textContent}`)
    .join('\n\n')

  // Use Gemini to extract a focused answer from the document text
  const keys = await prisma.tenantApiKeys.findUnique({ where: { tenantId } })
  if (!keys?.geminiKey) {
    // No Gemini key: return raw text so the main AI can use it directly
    return combinedText
  }
  const apiKey = decrypt(keys.geminiKey)

  const requestBody = {
    contents: [
      {
        parts: [
          {
            text: `Дараах баримт бичгүүд:\n\n${combinedText}\n\nДээрх баримт бичгүүд дээр үндэслэн дараах асуултад нарийвчлан, дэлгэрэнгүй хариул: ${question}`,
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
    logger.warn({ err, tenantId }, 'RAG Gemini query failed — using raw text as context fallback')
    return combinedText
  }

  const data = (await res.json()) as {
    candidates?: Array<{ content: { parts: Array<{ text?: string }> } }>
  }

  return data.candidates?.[0]?.content?.parts?.[0]?.text || combinedText
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

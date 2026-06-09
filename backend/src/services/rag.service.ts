import { decrypt } from './crypto.service.js'
import { prisma } from '../lib/prisma.js'
import fetch from 'node-fetch'
import FormData from 'form-data'
import pino from 'pino'

const logger = pino()
const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta'
const GEMINI_UPLOAD_BASE = 'https://generativelanguage.googleapis.com/upload/v1beta'

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

  // Save to DB
  await prisma.tenantKnowledgeFile.create({
    data: {
      tenantId,
      fileName,
      fileSize,
      mimeType,
      geminiFileId,
    },
  })

  return geminiFileId
}

export async function queryKnowledgeBase(
  tenantId: string,
  question: string
): Promise<string> {
  const keys = await prisma.tenantApiKeys.findUnique({ where: { tenantId } })
  if (!keys?.geminiKey) return ''
  const apiKey = decrypt(keys.geminiKey)

  const files = await prisma.tenantKnowledgeFile.findMany({
    where: { tenantId, geminiFileId: { not: null } },
  })

  if (files.length === 0) return ''

  // Build contents with all uploaded files
  const fileParts = files.map((f: { mimeType: string; geminiFileId: string | null }) => ({
    fileData: { mimeType: f.mimeType, fileUri: `https://generativelanguage.googleapis.com/v1beta/${f.geminiFileId}` },
  }))

  const requestBody = {
    contents: [
      {
        parts: [
          ...fileParts,
          { text: `Based on the documents above, answer this question accurately and in detail: ${question}` },
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
    logger.warn({ err }, 'RAG query failed — returning empty context')
    return ''
  }

  const data = (await res.json()) as {
    candidates?: Array<{ content: { parts: Array<{ text?: string }> } }>
  }

  return data.candidates?.[0]?.content?.parts?.[0]?.text || ''
}

export async function deleteFileFromGemini(
  tenantId: string,
  fileId: string
): Promise<void> {
  const keys = await prisma.tenantApiKeys.findUnique({ where: { tenantId } })
  if (!keys?.geminiKey) return
  const apiKey = decrypt(keys.geminiKey)

  const file = await prisma.tenantKnowledgeFile.findUnique({ where: { id: fileId } })
  if (!file || file.tenantId !== tenantId) return

  if (file.geminiFileId) {
    await fetch(`${GEMINI_BASE}/${file.geminiFileId}?key=${apiKey}`, { method: 'DELETE' })
  }

  await prisma.tenantKnowledgeFile.delete({ where: { id: fileId } })
}

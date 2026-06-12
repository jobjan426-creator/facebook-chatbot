import { generateText } from 'ai'
import { createOpenAI } from '@ai-sdk/openai'
import { decrypt } from './crypto.service.js'
import { getEffectiveApiKeys } from './api-keys.service.js'
import { prisma } from '../lib/prisma.js'
import { GEMINI_MODEL_ID } from '../config/model-pricing.js'
import { generateContentWithFallback } from './gemini-client.js'
import { PDFParse } from 'pdf-parse'
import { OfficeParser } from 'officeparser'
import fetch from 'node-fetch'
import pino from 'pino'

const logger = pino()
const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta'
const GEMINI_UPLOAD_BASE = 'https://generativelanguage.googleapis.com/upload/v1beta'

const MAX_TEXT_CHARS = 80_000

// Word, Excel (incl. Google Sheets exports) and PowerPoint files — extracted
// via officeparser, which handles the OOXML zip formats.
const OFFICE_MIME_TYPES = new Set([
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
])

async function extractTextFromBuffer(buffer: Buffer, mimeType: string): Promise<string | null> {
  try {
    if (mimeType === 'application/pdf') {
      const parser = new PDFParse({ data: buffer })
      const result = await parser.getText()
      await parser.destroy()
      return result.text.slice(0, MAX_TEXT_CHARS)
    }
    if (mimeType === 'text/plain' || mimeType === 'application/json' || mimeType === 'text/csv') {
      return buffer.toString('utf-8').slice(0, MAX_TEXT_CHARS)
    }
    if (OFFICE_MIME_TYPES.has(mimeType)) {
      const ast = await OfficeParser.parseOffice(buffer)
      return ast.toText().slice(0, MAX_TEXT_CHARS)
    }
    return null
  } catch (err) {
    logger.warn({ err, mimeType }, 'Document text extraction failed')
    return null
  }
}

async function queryWithText(
  apiKey: string | undefined,
  openaiKey: string | undefined,
  combinedText: string,
  question: string
): Promise<string> {
  const prompt = `Дараах баримт бичгүүд:\n\n${combinedText}\n\nДээрх баримт бичгүүд дээр үндэслэн дараах асуултад нарийвчлан, дэлгэрэнгүй хариул: ${question}`

  // Never fall back to the raw combinedText here — for some PDFs the locally
  // extracted text decodes into the wrong script/language (e.g. due to custom
  // font encodings), and dumping that into the prompt causes the AI to reply
  // in that wrong language.
  if (apiKey) {
    const body = JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
    const result = await generateContentWithFallback(apiKey, body)
    if (result.ok) return result.text
    logger.warn({ err: result.err, status: result.status }, 'RAG text query failed (Gemini), trying OpenAI fallback')
  }

  if (openaiKey) {
    const model = createOpenAI({ apiKey: openaiKey })('gpt-4o-mini')
    const result = await generateText({ model, messages: [{ role: 'user', content: prompt }] })
    return result.text
  }

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
  const keys = await getEffectiveApiKeys(tenantId)
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
    logger.info({ tenantId, fileName, chars: textContent.length }, 'Document text extracted')
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
  const keys = await getEffectiveApiKeys(tenantId)
  if (!keys?.geminiKey && !keys?.openaiKey) return ''
  const apiKey = keys?.geminiKey ? decrypt(keys.geminiKey) : undefined
  const openaiKey = keys?.openaiKey ? decrypt(keys.openaiKey) : undefined

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
    return queryWithText(apiKey, openaiKey, combinedText, question)
  }

  // Fallback: use Gemini File API (for files uploaded before text extraction was added)
  // Note: these files expire after 48h
  const filesWithGemini = files.filter((f) => f.geminiFileId)
  if (filesWithGemini.length > 0 && apiKey) {
    logger.info({ tenantId }, 'RAG falling back to Gemini File API (re-upload PDF to use local text extraction)')
    return queryGeminiWithFileIds(apiKey, filesWithGemini, question)
  }

  return ''
}

export async function deleteFileFromGemini(
  tenantId: string,
  fileId: string
): Promise<void> {
  const keys = await getEffectiveApiKeys(tenantId)
  const file = await prisma.tenantKnowledgeFile.findUnique({ where: { id: fileId } })
  if (!file || file.tenantId !== tenantId) return

  if (file.geminiFileId && keys?.geminiKey) {
    const apiKey = decrypt(keys.geminiKey)
    await fetch(`${GEMINI_BASE}/${file.geminiFileId}?key=${apiKey}`, { method: 'DELETE' })
  }

  await prisma.tenantKnowledgeFile.delete({ where: { id: fileId } })
}

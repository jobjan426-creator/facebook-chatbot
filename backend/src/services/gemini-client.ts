import fetch from 'node-fetch'
import pino from 'pino'
import { GEMINI_MODEL_ID } from '../config/model-pricing.js'

const logger = pino()
const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta'
const GEMINI_TIMEOUT_MS = 6000
const GEMINI_RETRY_DELAY_MS = 1500

export type GeminiResult =
  | { ok: true; text: string }
  | { ok: false; status: number; err: string }

async function callGeminiModel(apiKey: string, modelId: string, body: string): Promise<GeminiResult> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), GEMINI_TIMEOUT_MS)
  try {
    const res = await fetch(
      `${GEMINI_BASE}/models/${modelId}:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
        signal: controller.signal,
      }
    )
    if (res.ok) {
      const data = (await res.json()) as {
        candidates?: Array<{ content: { parts: Array<{ text?: string }> } }>
      }
      return { ok: true, text: data.candidates?.[0]?.content?.parts?.[0]?.text || '' }
    }
    return { ok: false, status: res.status, err: await res.text() }
  } catch (err) {
    return { ok: false, status: 0, err: String(err) }
  } finally {
    clearTimeout(timeout)
  }
}

// 503 (model overloaded) and aborted/network errors (status 0) are transient —
// Gemini's own error message says these spikes are "usually temporary", so a
// single short retry after a brief delay often succeeds. Other errors (404
// model not found, 400 bad request, 403/429 key issues) won't be fixed by
// retrying, so fail fast in those cases.
function isRetryable(result: GeminiResult): boolean {
  return !result.ok && (result.status === 503 || result.status === 0)
}

export async function generateContentWithFallback(apiKey: string, body: string): Promise<GeminiResult> {
  const first = await callGeminiModel(apiKey, GEMINI_MODEL_ID, body)
  if (first.ok) return first
  if (!isRetryable(first)) {
    logger.warn({ err: first.err, status: first.status }, 'Gemini generateContent failed (non-retryable)')
    return first
  }

  logger.warn({ err: first.err, status: first.status }, 'Gemini generateContent failed (transient), retrying')
  await new Promise((r) => setTimeout(r, GEMINI_RETRY_DELAY_MS))

  const retry = await callGeminiModel(apiKey, GEMINI_MODEL_ID, body)
  if (!retry.ok) {
    logger.warn({ err: retry.err, status: retry.status }, 'Gemini retry also failed')
  }
  return retry
}

import fetch from 'node-fetch'
import pino from 'pino'
import { GEMINI_MODEL_ID } from '../config/model-pricing.js'

const logger = pino()
const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta'
const GEMINI_FALLBACK_MODEL_ID = 'gemini-2.0-flash-lite'
const GEMINI_TIMEOUT_MS = 6000

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

// Single short-timeout attempt per model — Gemini "high demand" 503s can take
// tens of seconds to come back, so retrying the same model repeatedly just
// makes the user wait far longer than the message buffer window.
export async function generateContentWithFallback(apiKey: string, body: string): Promise<GeminiResult> {
  const primary = await callGeminiModel(apiKey, GEMINI_MODEL_ID, body)
  if (primary.ok) return primary
  logger.warn({ err: primary.err, status: primary.status }, 'Gemini generateContent failed, trying fallback model')

  const fallback = await callGeminiModel(apiKey, GEMINI_FALLBACK_MODEL_ID, body)
  if (!fallback.ok) {
    logger.warn({ err: fallback.err, status: fallback.status }, 'Gemini fallback model also failed')
  }
  return fallback
}

import { Worker, Job } from 'bullmq'
import { redis } from '../lib/redis.js'

const bullConnection = { url: process.env.REDIS_URL || 'redis://localhost:6379' }
import { prisma } from '../lib/prisma.js'
import { generateReply } from '../services/ai.service.js'
import { transcribeAudio } from '../services/voice.service.js'
import { analyzeImage, transcribeAudioWithGemini } from '../services/vision.service.js'
import { queryKnowledgeBase } from '../services/rag.service.js'
import { getEffectiveApiKeys } from '../services/api-keys.service.js'
import { sendMessage, sendTypingAction } from '../services/meta.service.js'
import { emitToTenant } from '../socket/index.js'
import { flushBuffer, BufferedMessage } from '../services/buffer.service.js'
import { ConversationStatus } from '@prisma/client'
import { CoreMessage } from 'ai'
import fetch from 'node-fetch'
import pino from 'pino'

const logger = pino()

interface FlushBufferJob {
        tenantId: string
        senderId: string
        conversationId: string
        channelId: string
}

interface ProcessMessagesJob {
        tenantId: string
        senderId: string
        conversationId: string
        channelId: string
        messages: BufferedMessage[]
}

async function processMessages(job: Job<ProcessMessagesJob>): Promise<void> {
        const { tenantId, senderId, conversationId, channelId, messages } = job.data

  const conversation = await prisma.conversation.findUnique({
            where: { id: conversationId },
  })

  if (
            conversation?.status === ConversationStatus.human_active ||
            conversation?.status === ConversationStatus.awaiting_human
          ) {
            logger.info({ conversationId }, 'Skipping AI - human active')
            return
  }

  const tenant = await prisma.tenant.findUnique({
            where: { id: tenantId },
            include: { apiKeys: true },
  })

  if (!tenant || tenant.status !== 'active') {
            logger.warn({ tenantId }, 'Tenant not found or not active, skipping')
            return
  }

  // Fall back to shared platform keys for any key the tenant hasn't set itself.
  tenant.apiKeys = await getEffectiveApiKeys(tenantId)

  const channel = await prisma.tenantChannel.findUnique({ where: { id: channelId } })
        if (!channel) {
                  logger.warn({ channelId }, 'Channel not found, skipping')
                  return
        }

  // Show typing indicator while AI is processing
  await sendTypingAction(channel, senderId, 'typing_on').catch(() => {})

  const processedTexts: string[] = []

  for (const msg of messages as BufferedMessage[]) {
            if (msg.mediaType === 'audio' && msg.mediaUrl) {
                        // 1. Try Whisper (OpenAI) — best quality
                        // 2. Try Gemini inline audio — fallback if no OpenAI key
                        try {
                                      const transcript = await transcribeAudio(msg.mediaUrl, tenantId, conversationId)
                                      if (!transcript.trim()) throw new Error('Empty transcript returned')
                                      logger.info({ tenantId, conversationId, transcript: transcript.slice(0, 300) }, 'Whisper transcript')
                                      processedTexts.push(`[Дуут мессеж]: ${transcript}`)
                        } catch (whisperErr) {
                                      const whisperErrMsg = whisperErr instanceof Error ? whisperErr.message : String(whisperErr)
                                      logger.warn({ err: whisperErrMsg }, 'Whisper failed — trying Gemini audio transcription')
                                      try {
                                                    const audioRes = await fetch(msg.mediaUrl)
                                                    if (!audioRes.ok) throw new Error(`Audio download failed: ${audioRes.status}`)
                                                    const audioBuffer = await audioRes.buffer()
                                                    const mimeType = audioRes.headers.get('content-type') || 'audio/mpeg'
                                                    const transcript = await transcribeAudioWithGemini(tenantId, audioBuffer, mimeType)
                                                    logger.info({ tenantId, conversationId, transcript: transcript.slice(0, 300) }, 'Gemini transcript')
                                                    processedTexts.push(`[Дуут мессеж]: ${transcript}`)
                                      } catch (geminiErr) {
                                                    const geminiErrMsg = geminiErr instanceof Error ? geminiErr.message : String(geminiErr)
                                                    logger.error({ err: `whisper: ${whisperErrMsg} | gemini: ${geminiErrMsg}` }, 'Both voice transcription methods failed')
                                                    processedTexts.push('[Дуут мессеж — таниж чадсангүй, текстээр бичнэ үү]')
                                      }
                        }
            } else if (msg.mediaType === 'image' && msg.mediaUrl) {
                        // Analyze image with Gemini inline data (reliable, no CDN access issues)
                        try {
                                      const imgRes = await fetch(msg.mediaUrl)
                                      if (!imgRes.ok) throw new Error(`Image download failed: ${imgRes.status}`)
                                      const imgBuffer = await imgRes.buffer()
                                      const mimeType = imgRes.headers.get('content-type') || 'image/jpeg'
                                      const userQ = msg.text || 'Энэ зураг юу байна?'
                                      const description = await analyzeImage(tenantId, imgBuffer, mimeType, userQ)
                                      processedTexts.push(`[Хэрэглэгч зураг илгээсэн. Зургийн агуулга: ${description}]`)
                                      if (msg.text) processedTexts.push(msg.text)
                        } catch (err) {
                                      logger.error({ err }, 'Image analysis failed')
                                      processedTexts.push(msg.text || '[Зураг — боловсруулж чадсангүй]')
                        }
            } else {
                        if (msg.text) processedTexts.push(msg.text)
            }
  }

  const combinedText = processedTexts.join('\n')
        if (!combinedText) {
                  logger.warn({ conversationId }, 'No text or image to process, skipping')
                  return
        }

  const history = await prisma.message.findMany({
            where: { conversationId },
            orderBy: { createdAt: 'asc' },
            take: 20,
  })

  const coreMessages = history.map((m) => ({
            role: (m.sentBy === 'ai' ? 'assistant' : 'user') as 'assistant' | 'user',
            content: m.content ?? '',
  })) as CoreMessage[]

  coreMessages.push({ role: 'user', content: combinedText })

  const ragContext = await queryKnowledgeBase(tenantId, combinedText).catch(() => '')

  let replyText: string
        try {
                  replyText = await generateReply({
                              tenant,
                              history: coreMessages,
                              ragContext,
                              conversationId,
                  })
        } catch (err) {
                  const errMsg = err instanceof Error ? err.message : String(err)
                  logger.error({ err: errMsg, tenantId, conversationId }, 'generateReply failed - check AI API keys in tenant settings')
                  // Send fallback message so user gets a response
          try {
                      await sendMessage(channel, senderId, 'Уучлаарай, одоогоор хариулах боломжгүй байна. Удахгүй холбогдоно.')
          } catch (sendErr) {
                      logger.error({ sendErr }, 'Failed to send fallback message')
          }
                  return
        }

  if (!replyText || replyText.trim() === '') {
            logger.warn({ conversationId }, 'generateReply returned empty, skipping send')
            return
  }

  try {
            await sendTypingAction(channel, senderId, 'typing_off').catch(() => {})
            await sendMessage(channel, senderId, replyText)
            logger.info({ conversationId, senderId }, 'AI reply sent successfully')
  } catch (err) {
            logger.error({ err, conversationId, senderId }, 'sendMessage failed')
            return
  }

  const savedMsg = await prisma.message.create({
            data: {
                        conversationId,
                        
                        content: replyText,
                        sentBy: 'ai',
            },
  })

  emitToTenant(tenantId, 'new_message', {
            conversationId,
            message: savedMsg,
  })

  await prisma.conversation.update({
            where: { id: conversationId },
            data: { updatedAt: new Date() },
  })
}

async function processFlushBuffer(job: Job<FlushBufferJob>): Promise<void> {
        await flushBuffer(job.data.tenantId, job.data.senderId, job.data.conversationId, job.data.channelId)
}

export function startMessageWorker(): void {
        const worker = new Worker(
                  'messages',
                  async (job: Job) => {
                              if (job.name === 'flush-buffer') {
                                            await processFlushBuffer(job as Job<FlushBufferJob>)
                              } else if (job.name === 'process-messages') {
                                            await processMessages(job as Job<ProcessMessagesJob>)
                              }
                  },
              {
                          connection: bullConnection,
                          concurrency: 10,
              }
                )

  worker.on('failed', (job, err) => {
            logger.error({ jobId: job?.id, jobName: job?.name, err }, 'Job failed')
  })

  worker.on('error', (err) => {
            logger.error({ err }, 'Worker error')
  })

  logger.info('Message worker started')
}

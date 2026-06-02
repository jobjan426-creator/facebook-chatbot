import { Queue } from 'bullmq'
import { redis } from '../lib/redis.js'

const bullConnection = { url: process.env.REDIS_URL || 'redis://localhost:6379' }

const INITIAL_WAIT_MS = 8000
const HARD_CAP_MS = 15000
const BUFFER_TTL_SECONDS = 20

export interface BufferedMessage {
  messageId: string
  text?: string
  mediaUrl?: string
  mediaType?: 'text' | 'audio' | 'image'
  timestamp: number
}

export const messageQueue = new Queue('messages', {
  connection: bullConnection,
  defaultJobOptions: {
    removeOnComplete: 50,
    removeOnFail: 100,
    attempts: 3,
    backoff: { type: 'exponential', delay: 1000 },
  },
})

const bufferKey = (tenantId: string, senderId: string) => `buffer:${tenantId}:${senderId}`
const lockKey = (tenantId: string, senderId: string) => `buffer_lock:${tenantId}:${senderId}`
const jobKey = (tenantId: string, senderId: string) => `buffer_job:${tenantId}:${senderId}`

export async function appendToBuffer(
  tenantId: string,
  senderId: string,
  message: BufferedMessage,
  conversationId: string,
  channelId: string
): Promise<void> {
  const key = bufferKey(tenantId, senderId)
  const jobRef = jobKey(tenantId, senderId)

  // Append message to buffer
  await redis.rpush(key, JSON.stringify(message))
  await redis.expire(key, BUFFER_TTL_SECONDS)

  // Check if buffer is past hard cap
  const firstMsg = await redis.lindex(key, 0)
  if (firstMsg) {
    const first = JSON.parse(firstMsg) as BufferedMessage
    const age = Date.now() - first.timestamp
    if (age >= HARD_CAP_MS) {
      await flushBuffer(tenantId, senderId, conversationId, channelId)
      return
    }
  }

  // Cancel existing delayed job and create new one
  const existingJobId = await redis.get(jobRef)
  if (existingJobId) {
    const job = await messageQueue.getJob(existingJobId)
    if (job) await job.remove()
  }

  const job = await messageQueue.add(
    'flush-buffer',
    { tenantId, senderId, conversationId, channelId },
    { delay: INITIAL_WAIT_MS, jobId: `${tenantId}:${senderId}:${Date.now()}` }
  )

  await redis.set(jobRef, job.id!, 'EX', 30)
}

export async function flushBuffer(
  tenantId: string,
  senderId: string,
  conversationId: string,
  channelId: string
): Promise<void> {
  const key = bufferKey(tenantId, senderId)
  const lock = lockKey(tenantId, senderId)

  // Race condition guard
  const locked = await redis.set(lock, '1', 'EX', 30, 'NX')
  if (!locked) return

  try {
    const items = await redis.lrange(key, 0, -1)
    if (items.length === 0) return

    await redis.del(key)
    await redis.del(jobKey(tenantId, senderId))

    const messages = items.map((i) => JSON.parse(i) as BufferedMessage)

    await messageQueue.add('process-messages', {
      tenantId,
      senderId,
      conversationId,
      channelId,
      messages,
    })
  } finally {
    await redis.del(lock)
  }
}

import './config/index.js' // validate env first
import { createServer } from 'http'
import express from 'express'
import helmet from 'helmet'
import cors from 'cors'
import pino from 'pino'
import pinoHttp from 'pino-http'
import { env } from './config/index.js'
import { initSocket } from './socket/index.js'
import { prisma } from './lib/prisma.js'

import authRouter from './routes/auth.js'
import tenantsRouter from './routes/tenants.js'
import settingsRouter from './routes/settings.js'
import webhookRouter from './routes/webhook.js'
import conversationsRouter from './routes/conversations.js'
import messagesRouter from './routes/messages.js'
import knowledgeRouter from './routes/knowledge.js'
import channelsRouter from './routes/channels.js'
import usageRouter from './routes/usage.js'

const logger = pino({
  transport: env.NODE_ENV === 'development' ? { target: 'pino-pretty' } : undefined,
})

const app = express()

app.use(helmet())
app.use(cors({ origin: env.APP_URL, credentials: true }))
app.use(express.json())
app.use(express.urlencoded({ extended: false }))
app.use(pinoHttp({ logger }))

// Health check
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() })
})

// Routes
app.use('/auth', authRouter)
app.use('/api/tenants', tenantsRouter)
app.use('/api/settings', settingsRouter)
app.use('/api/conversations', conversationsRouter)
app.use('/api/messages', messagesRouter)
app.use('/api/knowledge', knowledgeRouter)
app.use('/api/channels', channelsRouter)
app.use('/api/usage', usageRouter)
app.use('/webhook', webhookRouter)

// Serve frontend in production
if (env.NODE_ENV === 'production') {
  const path = require('path')
  const publicPath = path.join(__dirname, '..', 'public')
  app.use(express.static(publicPath))
  app.get('*', (_req: import('express').Request, res: import('express').Response) => {
    res.sendFile(path.join(publicPath, 'index.html'))
  })
}

const httpServer = createServer(app)
initSocket(httpServer)

async function start() {
  try {
    await prisma.$connect()
    logger.info('Database connected')

    // Start BullMQ worker
    const { startMessageWorker } = await import('./workers/message.worker.js')
    startMessageWorker()

    httpServer.listen(env.PORT, () => {
      logger.info(`Server running on port ${env.PORT}`)
    })
  } catch (err) {
    logger.error(err, 'Failed to start server')
    process.exit(1)
  }
}

start()

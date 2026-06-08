import './config/index.js' // validate env first
import { createServer } from 'http'
import express, { Request, Response, NextFunction } from 'express'
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

// Save raw body for webhook signature verification BEFORE json parsing
app.use((req: Request, _res: Response, next: NextFunction) => {
    if (req.path.startsWith('/webhook')) {
          let data = Buffer.alloc(0)
          req.on('data', (chunk: Buffer) => {
                  data = Buffer.concat([data, chunk])
          })
          req.on('end', () => {
                  ;(req as Request & { rawBody: Buffer }).rawBody = data
                  next()
          })
    } else {
          next()
    }
})

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
app.use('/webhook', webhookRouter)
app.use('/api/conversations', conversationsRouter)
app.use('/api/messages', messagesRouter)
app.use('/api/knowledge', knowledgeRouter)
app.use('/api/channels', channelsRouter)
app.use('/api/usage', usageRouter)

const httpServer = createServer(app)
initSocket(httpServer)

const port = env.PORT

httpServer.listen(port, () => {
    logger.info(`Server running on port ${port}`)
})

// Graceful shutdown
process.on('SIGTERM', async () => {
    logger.info('SIGTERM received, shutting down gracefully')
    await prisma.$disconnect()
    process.exit(0)
})

export default app

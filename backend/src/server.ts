import './config/index.js' // validate env first
import 'express-async-errors'
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
import platformRouter from './routes/platform.js'

const logger = pino({
        transport: env.NODE_ENV === 'development' ? { target: 'pino-pretty' } : undefined,
})

const app = express()

app.use(helmet())
app.use(cors({ origin: env.APP_URL, credentials: true }))

// Save raw body for webhook signature verification BEFORE json parsing
// Also parse JSON body for webhook routes manually after collecting raw body
app.use((req: Request, _res: Response, next: NextFunction) => {
        if (req.path.startsWith('/webhook')) {
                  let data = Buffer.alloc(0)
                  req.on('data', (chunk: Buffer) => {
                              data = Buffer.concat([data, chunk])
                  })
                  req.on('end', () => {
                              ;(req as Request & { rawBody: Buffer }).rawBody = data
                              // Manually parse JSON body so req.body is available
                               if (data.length > 0) {
                                             try {
                                                             req.body = JSON.parse(data.toString('utf8'))
                                             } catch {
                                                             req.body = {}
                                             }
                               }
                              next()
                  })
        } else {
                  next()
        }
})

// Only apply json/urlencoded parsers to non-webhook routes
app.use((req: Request, res: Response, next: NextFunction) => {
        if (req.path.startsWith('/webhook')) {
                  return next()
        }
        express.json()(req, res, next)
})
app.use((req: Request, res: Response, next: NextFunction) => {
        if (req.path.startsWith('/webhook')) {
                  return next()
        }
        express.urlencoded({ extended: false })(req, res, next)
})

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
app.use('/api/platform', platformRouter)
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

// Global error handler — keeps a single failed request from crashing the whole server
app.use((err: Error, req: Request, res: Response, _next: NextFunction) => {
        logger.error({ err, path: req.path }, 'Unhandled request error')
        if (!res.headersSent) {
                  res.status(500).json({ error: 'Internal server error' })
        }
})

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

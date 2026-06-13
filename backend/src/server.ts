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

const PRIVACY_POLICY_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Privacy Policy — Bota AI Platform</title>
  <style>
    body { font-family: -apple-system, Segoe UI, Roboto, sans-serif; max-width: 760px; margin: 0 auto; padding: 40px 20px; color: #1a1a1a; line-height: 1.65; }
    h1 { font-size: 28px; margin-bottom: 4px; }
    h2 { font-size: 19px; margin-top: 32px; }
    .updated { color: #666; font-size: 14px; margin-bottom: 24px; }
    a { color: #1877F2; }
    li { margin: 6px 0; }
  </style>
</head>
<body>
  <h1>Privacy Policy</h1>
  <p class="updated">Bota AI Platform · Last updated: 14 June 2026</p>

  <p>Bota AI Platform ("we", "us", "the Service") provides an AI-powered messaging
  assistant that connects to business pages on Facebook Messenger and Instagram to
  automatically reply to customer messages on behalf of the business that owns the page.
  This policy explains what data we process and why.</p>

  <h2>Information we process</h2>
  <ul>
    <li><strong>Messages and comments</strong> sent to a connected Facebook Page or
    Instagram professional account (text, voice messages, images), so the AI can
    understand and respond to them.</li>
    <li><strong>Basic public profile information</strong> (name, username, profile
    picture) of the people messaging the connected page, used to display the
    conversation to the business operator.</li>
    <li><strong>Page access tokens</strong> provided by Meta when a business connects
    its page, stored encrypted and used only to receive messages and send replies.</li>
  </ul>

  <h2>How we use information</h2>
  <ul>
    <li>To generate and send automated replies to customer messages and comments.</li>
    <li>To transcribe voice messages and analyze images so the AI can respond to them.</li>
    <li>To show the connected business its own conversations in an inbox.</li>
  </ul>

  <h2>Sharing with AI providers</h2>
  <p>To generate replies, message content may be sent to third-party AI providers
  (such as Google Gemini, OpenAI, and SonorAI for Mongolian speech recognition) strictly
  to produce a response. These providers process the data on our behalf and we do not sell
  personal data to anyone. Each connected business's data is processed in isolation and is
  never mixed with another business's data.</p>

  <h2>Data retention</h2>
  <p>Conversation data is retained only as long as needed to operate the Service for the
  connected business. A business can disconnect its page at any time, after which we stop
  receiving its messages, and can request deletion of its data.</p>

  <h2>Your rights</h2>
  <p>Users may contact us to request access to, or deletion of, their data. Businesses can
  remove a connected page from the Service settings at any time.</p>

  <h2>Contact</h2>
  <p>For any privacy questions or data deletion requests, contact:
  <a href="mailto:jbota1814@gmail.com">jbota1814@gmail.com</a></p>
</body>
</html>`

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

// Public Privacy Policy (required for Meta App Review). Registered before the
// SPA catch-all so it is served as a crawler-friendly static HTML page.
app.get('/privacy', (_req: Request, res: Response) => {
        res.type('html').send(PRIVACY_POLICY_HTML)
})

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

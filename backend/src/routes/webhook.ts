import { Router, Request, Response, NextFunction } from 'express'
import { env } from '../config/index.js'
import { handleMetaWebhook } from '../webhooks/meta.handler.js'
import crypto from 'crypto'

const router = Router()

// Webhook verification (GET)
router.get('/meta', (req: Request, res: Response) => {
      const mode = req.query['hub.mode']
      const token = req.query['hub.verify_token']
      const challenge = req.query['hub.challenge']

             if (mode === 'subscribe' && token === env.META_WEBHOOK_VERIFY_TOKEN) {
                     res.status(200).send(challenge)
             } else {
                     res.sendStatus(403)
             }
})

// Incoming events (POST)
router.post('/meta', verifyMetaSignature, handleMetaWebhook)

function verifyMetaSignature(req: Request, res: Response, next: NextFunction): void {
      // If META_APP_SECRET is not configured, skip signature check
  if (!env.META_APP_SECRET) {
          next()
          return
  }

  const signature = req.headers['x-hub-signature-256'] as string
      if (!signature) {
              next()
              return
      }

  try {
          const rawBody = (req as Request & { rawBody?: Buffer }).rawBody
          const bodyToSign = rawBody ?? Buffer.from(JSON.stringify(req.body))

        const expected =
                  'sha256=' +
                  crypto
              .createHmac('sha256', env.META_APP_SECRET)
              .update(bodyToSign)
              .digest('hex')

        if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) {
                  res.sendStatus(401)
                  return
        }
  } catch {
          // On any error, let the request through rather than blocking it
  }

  next()
}

export default router

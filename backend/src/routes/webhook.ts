import { Router, Request, Response } from 'express'
import { env } from '../config/index.js'
import { handleMetaWebhook } from '../webhooks/meta.handler.js'
import crypto from 'crypto'

const router = Router()

// Webhook verification
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

// Incoming events
router.post('/meta', verifyMetaSignature, handleMetaWebhook)

function verifyMetaSignature(req: Request, res: Response, next: () => void): void {
  const signature = req.headers['x-hub-signature-256'] as string
  if (!signature) {
    res.sendStatus(401)
    return
  }

  const expected = 'sha256=' + crypto
    .createHmac('sha256', env.META_APP_SECRET)
    .update(JSON.stringify(req.body))
    .digest('hex')

  if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) {
    res.sendStatus(401)
    return
  }

  next()
}

export default router

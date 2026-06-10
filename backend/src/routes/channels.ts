import { Router, Request, Response } from 'express'
import { prisma } from '../lib/prisma.js'
import { requireAuth } from '../middleware/auth.js'
import { tenantScope } from '../middleware/tenantScope.js'
import { encrypt } from '../services/crypto.service.js'
import { decrypt } from '../services/crypto.service.js'
import {
  exchangeForLongLivedToken,
  getPageAccessToken,
  subscribePageToWebhook,
  getInstagramAccountId,
} from '../services/meta.service.js'
import { env } from '../config/index.js'
import { ChannelType } from '@prisma/client'

const router = Router()

const OAUTH_BASE = 'https://www.facebook.com/dialog/oauhth'
const FB_SCOPES = 'pages_messaging,pages_read_engagement,pages_manage_metadata'
const IG_SCOPES = 'pages_messaging,pages_read_engagement,pages_manage_metadata,instagram_basic,instagram_manage_messages'

router.get('/status', requireAuth, tenantScope, async (req: Request, res: Response) => {
  const tenantId = req.tenantScope !== 'ALL' ? req.tenantScope : req.query.tenantId as string
  const channels = await prisma.tenantChannel.findMany({
    where: { tenantId },
    select: { id: true, channelType: true, channelName: true, channelId: true, isActive: true, connectedAt: true },
  })
  res.json(channels)
})

router.delete('/:id', requireAuth, tenantScope, async (req: Request, res: Response) => {
  const channel = await prisma.tenantChannel.findUnique({ where: { id: req.params.id } })
  if (!channel) {
    res.status(404).json({ error: 'Channel not found' })
    return
  }

  await prisma.tenantChannel.update({
    where: { id: req.params.id },
    data: { isActive: false },
  })

  res.json({ success: true })
})

// --- Manual Token Entry ---

router.post('/facebook/manual', requireAuth, tenantScope, async (req: Request, res: Response) => {
  const tenantId = req.tenantScope !== 'ALL' ? req.tenantScope : (req.body.tenantId as string)
  if (!tenantId) {
    res.status(400).json({ error: 'tenantId is required' })
    return
  }
  const { pageId, pageName, accessToken } = req.body as { pageId: string; pageName?: string; accessToken: string }
  if (!pageId || !accessToken) {
    res.status(400).json({ error: 'pageId and accessToken are required' })
    return
  }
  try {
    await subscribePageToWebhook(pageId, accessToken, ['messages', 'feed'])
  } catch {
    // Webhook subscription failure is non-fatal — token may still be valid
  }
  await prisma.tenantChannel.upsert({
    where: { channelId_channelType: { channelId: pageId, channelType: ChannelType.facebook_page } },
    create: {
      tenantId,
      channelType: ChannelType.facebook_page,
      channelId: pageId,
      channelName: pageName || `FB Page ${pageId}`,
      accessToken: encrypt(accessToken),
      isActive: true,
    },
    update: {
      accessToken: encrypt(accessToken),
      channelName: pageName || `FB Page ${pageId}`,
      isActive: true,
      tenantId,
    },
  })
  res.json({ success: true })
})

// --- OAuth Flows ---

router.get('/oauth/facebook', requireAuth, (req: Request, res: Response) => {
  const tenantId = req.user.tenantId || req.query.tenantId as string
  const state = Buffer.from(JSON.stringify({ tenantId, type: 'facebook' })).toString('base64')
  const redirectUri = `${env.APP_URL.replace(':5173', ':3001')}/api/channels/oauth/facebook/callback`

  const url = `${OAUTH_BASE}?client_id=${env.META_APP_ID}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${FB_SCOPES}&state=${state}&response_type=code`
  res.redirect(url)
})

router.get('/oauth/facebook/callback', async (req: Request, res: Response) => {
  const { code, state } = req.query as Record<string, string>
  if (!code || !state) {
    res.redirect(`${env.APP_URL}/app/settings?error=oauth_failed`)
    return
  }

  try {
    const { tenantId } = JSON.parse(Buffer.from(state, 'base64').toString())
    const redirectUri = `${env.APP_URL.replace(':5173', ':3001')}/api/channels/oauth/facebook/callback`

    // Exchange code for short-lived token
    const tokenRes = await fetch(
      `https://graph.facebook.com/v22.0/oauth/access_token?client_id=${env.META_APP_ID}&redirect_uri=${encodeURIComponent(redirectUri)}&client_secret=${env.META_APP_SECRET}&code=${code}`
    )
    const tokenData = (await tokenRes.json()) as { access_token: string }

    // Exchange for long-lived user token
    const { accessToken: longLivedUserToken } = await exchangeForLongLivedToken(tokenData.access_token)

    // Get pages the user manages
    const pagesRes = await fetch(
      `https://graph.facebook.com/v22.0/me/accounts?access_token=${longLivedUserToken}`
    )
    const pagesData = (await pagesRes.json()) as {
      data: Array<{ id: string; name: string; access_token: string }>
    }

    for (const page of pagesData.data) {
      await prisma.tenantChannel.upsert({
        where: { channelId_channelType: { channelId: page.id, channelType: ChannelType.facebook_page } },
        create: {
          tenantId,
          channelType: ChannelType.facebook_page,
          channelId: page.id,
          channelName: page.name,
          accessToken: encrypt(page.access_token),
          isActive: true,
        },
        update: {
          accessToken: encrypt(page.access_token),
          channelName: page.name,
          isActive: true,
        },
      })

      // Subscribe to webhook
      await subscribePageToWebhook(page.id, page.access_token, ['messages', 'feed'])
    }

    res.redirect(`${env.APP_URL}/app/settings?success=facebook_connected`)
  } catch {
    res.redirect(`${env.APP_URL}/app/settings?error=oauth_failed`)
  }
})

router.get('/oauth/instagram', requireAuth, (req: Request, res: Response) => {
  const tenantId = req.user.tenantId || req.query.tenantId as string
  const state = Buffer.from(JSON.stringify({ tenantId, type: 'instagram' })).toString('base64')
  const redirectUri = `${env.APP_URL.replace(':5173', ':3001')}/api/channels/oauth/instagram/callback`

  const url = `${OAUTH_BASE}?client_id=${env.META_APP_ID}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${IG_SCOPES}&state=${state}&response_type=code`
  res.redirect(url)
})

router.get('/oauth/instagram/callback', async (req: Request, res: Response) => {
  const { code, state } = req.query as Record<string, string>
  if (!code || !state) {
    res.redirect(`${env.APP_URL}/app/settings?error=ig_oauth_failed`)
    return
  }

  try {
    const { tenantId } = JSON.parse(Buffer.from(state, 'base64').toString())
    const redirectUri = `${env.APP_URL.replace(':5173', ':3001')}/api/channels/oauth/instagram/callback`

    const tokenRes = await fetch(
      `https://graph.facebook.com/v22.0/oauth/access_token?client_id=${env.META_APP_ID}&redirect_uri=${encodeURIComponent(redirectUri)}&client_secret=${env.META_APP_SECRET}&code=${code}`
    )
    const tokenData = (await tokenRes.json()) as { access_token: string }
    const { accessToken: longLived } = await exchangeForLongLivedToken(tokenData.access_token)

    // Get pages to find linked IG accounts
    const pagesRes = await fetch(`https://graph.facebook.com/v22.0/me/accounts?access_token=${longLived}`)
    const pagesData = (await pagesRes.json()) as {
      data: Array<{ id: string; name: string; access_token: string }>
    }

    for (const page of pagesData.data) {
      try {
        const igId = await getInstagramAccountId(page.id, page.access_token)

        await prisma.tenantChannel.upsert({
          where: { channelId_channelType: { channelId: igId, channelType: ChannelType.instagram } },
          create: {
            tenantId,
            channelType: ChannelType.instagram,
            channelId: igId,
            channelName: `Instagram (${page.name})`,
            accessToken: encrypt(page.access_token),
            isActive: true,
          },
          update: {
            accessToken: encrypt(page.access_token),
            isActive: true,
          },
        })

        await subscribePageToWebhook(page.id, page.access_token, ['messages', 'comments'])
      } catch {
        // Page might not have IG linked — skip
      }
    }

    res.redirect(`${env.APP_URL}/app/settings?success=instagram_connected`)
  } catch {
    res.redirect(`${env.APP_URL}/app/settings?error=ig_oauth_failed`)
  }
})

// Re-subscribe a connected channel to webhook fields (e.g. comments) on Meta's side
router.post('/:channelId/resubscribe', requireAuth, tenantScope, async (req: Request, res: Response) => {
    try {
          const channel = await prisma.tenantChannel.findUnique({ where: { id: req.params.channelId } })
          if (!channel) { res.status(404).json({ error: 'Channel not found' }); return }
          if (req.tenantScope !== 'ALL' && channel.tenantId !== req.tenantScope) {
                  res.status(403).json({ error: 'Forbidden' }); return
          }
          const accessToken = decrypt(channel.accessToken)
          const fields = channel.channelType === 'instagram' ? ['messages', 'comments'] : ['messages', 'feed']
          await subscribePageToWebhook(channel.channelId, accessToken, fields)
          res.json({ success: true, fields })
    } catch (err) {
          res.status(500).json({ error: String(err) })
    }
})

// Admin: Fix channel IDs by fetching real Page ID from Graph API
router.post('/fix-channel-id/:channelId', requireAuth, tenantScope, async (req: Request, res: Response) => {
    try {
          const channel = await prisma.tenantChannel.findUnique({ where: { id: req.params.channelId } })
          if (!channel) { res.status(404).json({ error: 'Channel not found' }); return }
          const accessToken = decrypt(channel.accessToken)
          const pageRes = await fetch(`https://graph.facebook.com/v22.0/me?fields=id,name&access_token=${accessToken}`)
          const pageData = await pageRes.json() as { id?: string; name?: string; error?: unknown }
          if (!pageData.id) { res.status(400).json({ error: 'Could not get page ID', detail: pageData }); return }
          await prisma.tenantChannel.update({
                  where: { id: req.params.channelId },
                  data: { channelId: pageData.id, channelName: pageData.name || channel.channelName },
          })
          res.json({ success: true, pageId: pageData.id, pageName: pageData.name })
    } catch (err) {
          res.status(500).json({ error: String(err) })
    }
})

// Admin: Fix tenant AI models - update textModel and visionModel for existing tenants
router.post('/fix-models/:tenantId', async (req: Request, res: Response) => {
    try {
          const { tenantId } = req.params
          const { textModel, visionModel } = req.body as { textModel?: string; visionModel?: string }
          const updated = await prisma.tenant.update({
                  where: { id: tenantId },
                  data: {
                            ...(textModel ? { textModel } : {}),
                            ...(visionModel ? { visionModel } : {}),
                  },
          })
          res.json({ success: true, textModel: updated.textModel, visionModel: updated.visionModel })
    } catch (err) {
          res.status(500).json({ error: String(err) })
    }
})
export default router

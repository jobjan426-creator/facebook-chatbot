import { Router, Request, Response, RequestHandler } from 'express'
import multer from 'multer'
import { prisma } from '../lib/prisma.js'
import { requireAuth } from '../middleware/auth.js'
import { tenantScope } from '../middleware/tenantScope.js'
import { uploadFileToGemini, deleteFileFromGemini } from '../services/rag.service.js'

const router = Router()
router.use(requireAuth, tenantScope)

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB
  fileFilter: (_req, file, cb) => {
    const allowed = ['application/pdf', 'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'text/plain', 'application/json']
    if (allowed.includes(file.mimetype)) {
      cb(null, true)
    } else {
      cb(new Error('Only PDF, DOCX, TXT, JSON files allowed') as unknown as null, false)
    }
  },
})

function getTenantId(req: Request): string {
  return req.tenantScope === 'ALL' ? (req.query.tenantId as string) : req.tenantScope
}

router.get('/', async (req: Request, res: Response) => {
  const tenantId = getTenantId(req)
  const files = await prisma.tenantKnowledgeFile.findMany({
    where: { tenantId },
    orderBy: { uploadedAt: 'desc' },
  })
  res.json(files)
})

router.post('/upload', upload.single('file') as unknown as RequestHandler, async (req: Request, res: Response) => {
  if (!req.file) {
    res.status(400).json({ error: 'No file uploaded' })
    return
  }

  const tenantId = getTenantId(req)

  try {
    const geminiFileId = await uploadFileToGemini(
      tenantId,
      req.file.buffer,
      req.file.originalname,
      req.file.mimetype,
      req.file.size
    )

    const file = await prisma.tenantKnowledgeFile.findFirst({
      where: { tenantId, geminiFileId },
    })

    res.status(201).json(file)
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Upload failed'
    res.status(500).json({ error: msg })
  }
})

router.delete('/:id', async (req: Request, res: Response) => {
  const tenantId = getTenantId(req)

  try {
    await deleteFileFromGemini(tenantId, req.params.id)
    res.status(204).send()
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Delete failed'
    res.status(500).json({ error: msg })
  }
})

export default router

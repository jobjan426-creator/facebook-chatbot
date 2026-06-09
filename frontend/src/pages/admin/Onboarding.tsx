import { useEffect, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import { api, TenantSettings, ApiKeys, KnowledgeFile } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { formatDate, formatFileSize } from '@/lib/utils'

type FbMode = 'manual' | 'oauth'

export default function Onboarding() {
  const { tenantId } = useParams<{ tenantId: string }>()
  const [settings, setSettings] = useState<TenantSettings | null>(null)
  const [apiKeys, setApiKeys] = useState<ApiKeys | null>(null)
  const [channels, setChannels] = useState<{ id: string; channelType: string; channelName: string | null; isActive: boolean }[]>([])

  // API Keys form
  const [newKeys, setNewKeys] = useState({ geminiKey: '', openaiKey: '', xaiKey: '' })
  const [savingKeys, setSavingKeys] = useState(false)
  const [keysMsg, setKeysMsg] = useState('')

  // AI Persona
  const [persona, setPersona] = useState('')
  const [savingPersona, setSavingPersona] = useState(false)
  const [personaMsg, setPersonaMsg] = useState('')

  // Facebook
  const [fbMode, setFbMode] = useState<FbMode>('manual')
  const [fbPageId, setFbPageId] = useState('')
  const [fbPageName, setFbPageName] = useState('')
  const [fbToken, setFbToken] = useState('')
  const [connectingFb, setConnectingFb] = useState(false)
  const [fbMsg, setFbMsg] = useState('')

  // Knowledge base
  const [knowledgeFiles, setKnowledgeFiles] = useState<KnowledgeFile[]>([])
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState('')
  const [dragOver, setDragOver] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Activate
  const [activating, setActivating] = useState(false)
  const [activateMsg, setActivateMsg] = useState('')

  const [loadError, setLoadError] = useState('')

  useEffect(() => {
    if (!tenantId) return
    Promise.all([
      api.getSettings(tenantId),
      api.getApiKeys(tenantId),
      api.getChannels(tenantId),
      api.getKnowledgeFiles(tenantId),
    ]).then(([s, k, c, kf]) => {
      setSettings(s)
      setApiKeys(k)
      setChannels(c)
      setKnowledgeFiles(kf)
      setPersona(s.aiPersona || '')
    }).catch((err) => {
      setLoadError(err instanceof Error ? err.message : 'Өгөгдөл ачааллахад алдаа гарлаа')
    })
  }, [tenantId])

  if (loadError) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-3">
        <p className="text-red-500 text-sm font-medium">{loadError}</p>
        <button onClick={() => window.location.reload()} className="text-xs text-indigo-600 hover:underline">
          Дахин ачааллах
        </button>
      </div>
    )
  }

  if (!settings || !apiKeys) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="flex items-center gap-2 text-zinc-400 text-sm">
          <span className="w-4 h-4 border-2 border-zinc-200 border-t-indigo-500 rounded-full animate-spin" />
          Ачааллаж байна...
        </div>
      </div>
    )
  }

  const hasFacebook = channels.some((c) => c.channelType === 'facebook_page' && c.isActive)
  const hasInstagram = channels.some((c) => c.channelType === 'instagram' && c.isActive)
  const alreadyActive = settings.status === 'active'
  const authToken = localStorage.getItem('token') ?? ''

  const steps = [
    { id: 1, label: 'API Keys', done: !!apiKeys.geminiKey },
    { id: 2, label: 'AI Дүр', done: (settings.aiPersona?.length ?? 0) > 10 },
    { id: 3, label: 'Facebook', done: hasFacebook },
    { id: 4, label: 'Instagram', done: hasInstagram },
  ]
  const completedCount = steps.filter((s) => s.done).length
  const progress = Math.round((completedCount / steps.length) * 100)
  const canActivate = steps[0].done && steps[1].done && (steps[2].done || steps[3].done)

  async function saveApiKeys() {
    if (!tenantId) return
    setSavingKeys(true)
    try {
      const payload: Partial<ApiKeys> = {}
      if (newKeys.geminiKey) payload.geminiKey = newKeys.geminiKey
      if (newKeys.openaiKey) payload.openaiKey = newKeys.openaiKey
      if (newKeys.xaiKey) payload.xaiKey = newKeys.xaiKey
      await api.updateApiKeys(payload, tenantId)
      setKeysMsg('success')
      const fresh = await api.getApiKeys(tenantId)
      setApiKeys(fresh)
      setNewKeys({ geminiKey: '', openaiKey: '', xaiKey: '' })
    } catch {
      setKeysMsg('error')
    } finally {
      setSavingKeys(false)
      setTimeout(() => setKeysMsg(''), 3000)
    }
  }

  async function savePersona() {
    if (!tenantId || !settings) return
    setSavingPersona(true)
    try {
      await api.updatePersona({ aiPersona: persona, timezone: settings.timezone }, tenantId)
      setPersonaMsg('success')
      const fresh = await api.getSettings(tenantId)
      setSettings(fresh)
    } catch {
      setPersonaMsg('error')
    } finally {
      setSavingPersona(false)
      setTimeout(() => setPersonaMsg(''), 3000)
    }
  }

  async function connectFbManual() {
    if (!tenantId || !fbPageId || !fbToken) return
    setConnectingFb(true)
    try {
      await api.connectFacebookManual(
        { pageId: fbPageId, pageName: fbPageName || fbPageId, accessToken: fbToken },
        tenantId,
      )
      setFbMsg('success')
      const fresh = await api.getChannels(tenantId)
      setChannels(fresh)
      setFbPageId('')
      setFbPageName('')
      setFbToken('')
    } catch (err) {
      setFbMsg(err instanceof Error ? err.message : 'error')
    } finally {
      setConnectingFb(false)
      setTimeout(() => setFbMsg(''), 5000)
    }
  }

  async function handleFileUpload(file: File) {
    if (!tenantId) return
    setUploading(true)
    setUploadError('')
    try {
      await api.uploadKnowledgeFile(file, tenantId)
      const fresh = await api.getKnowledgeFiles(tenantId)
      setKnowledgeFiles(fresh)
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'Upload амжилтгүй')
    } finally {
      setUploading(false)
    }
  }

  async function handleFileDelete(id: string) {
    if (!tenantId || !confirm('Файлыг устгах уу?')) return
    await api.deleteKnowledgeFile(id, tenantId)
    setKnowledgeFiles((f) => f.filter((x) => x.id !== id))
  }

  async function handleActivate() {
    if (!tenantId) return
    setActivating(true)
    try {
      await api.activateTenant(tenantId)
      setActivateMsg('success')
      const fresh = await api.getSettings(tenantId)
      setSettings(fresh)
    } catch {
      setActivateMsg('error')
    } finally {
      setActivating(false)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-indigo-50/40">
      <div className="max-w-2xl mx-auto px-4 py-8 space-y-5">

        {/* ── Header card ── */}
        <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-indigo-900 via-indigo-800 to-violet-800 p-6 text-white shadow-xl">
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,rgba(139,92,246,0.3),transparent_60%)]" />
          <div className="relative">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-indigo-300 text-[11px] font-semibold uppercase tracking-widest mb-1">
                  Тенант тохируулга
                </p>
                <h1 className="text-2xl font-bold tracking-tight">{settings.name}</h1>
              </div>
              <span className={`mt-1 px-3 py-1 rounded-full text-[11px] font-semibold border ${
                alreadyActive
                  ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
                  : 'bg-amber-500/20 text-amber-300 border-amber-500/30'
              }`}>
                {alreadyActive ? '● Идэвхтэй' : '○ Тохируулж байна'}
              </span>
            </div>

            {/* Progress bar */}
            <div className="mt-5">
              <div className="flex justify-between text-[11px] text-indigo-300 mb-2">
                <span>Явц</span>
                <span>{completedCount}/{steps.length} алхам — {progress}%</span>
              </div>
              <div className="h-1.5 bg-indigo-950/60 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-emerald-400 to-teal-400 rounded-full transition-all duration-700"
                  style={{ width: `${progress}%` }}
                />
              </div>
              {/* Step dots */}
              <div className="flex justify-between mt-4">
                {steps.map((step) => (
                  <div key={step.id} className="flex flex-col items-center gap-1.5">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold border-2 transition-all ${
                      step.done
                        ? 'bg-emerald-500 border-emerald-400 text-white shadow-lg shadow-emerald-500/30'
                        : 'bg-indigo-800/60 border-indigo-600 text-indigo-300'
                    }`}>
                      {step.done ? '✓' : step.id}
                    </div>
                    <span className="text-[10px] text-indigo-300 font-medium">{step.label}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* ── Step 1: API Keys ── */}
        <SectionCard step={1} title="API Keys" done={steps[0].done} description="AI загвар ажиллуулахад шаардлагатай нууц түлхүүрүүд">
          <div className="space-y-3">

            {/* Gemini — required */}
            <KeyField
              label="Google Gemini API Key"
              required
              masked={apiKeys.geminiKey}
              value={newKeys.geminiKey}
              placeholder="AIza..."
              hint="Мэдлэгийн сан embeddings болон vision загварт хэрэгтэй"
              highlightColor="orange"
              onChange={(v) => setNewKeys({ ...newKeys, geminiKey: v })}
            />

            {/* OpenAI — optional */}
            <KeyField
              label="OpenAI API Key"
              masked={apiKeys.openaiKey}
              value={newKeys.openaiKey}
              placeholder="sk-..."
              hint="GPT загвар болон Whisper дуу таних"
              onChange={(v) => setNewKeys({ ...newKeys, openaiKey: v })}
            />

            {/* xAI — optional */}
            <KeyField
              label="xAI (Grok) API Key"
              masked={apiKeys.xaiKey}
              value={newKeys.xaiKey}
              placeholder="xai-..."
              hint="Grok текст загвар ашиглах бол"
              onChange={(v) => setNewKeys({ ...newKeys, xaiKey: v })}
            />

            <div className="flex items-center gap-3 pt-1">
              <Button
                onClick={saveApiKeys}
                disabled={savingKeys}
                className="bg-indigo-600 hover:bg-indigo-700 text-white"
              >
                {savingKeys ? 'Хадгалж байна...' : 'Keys хадгалах'}
              </Button>
              <FeedbackMsg state={keysMsg} />
            </div>
          </div>
        </SectionCard>

        {/* ── Step 2: AI Persona ── */}
        <SectionCard step={2} title="AI Дүр (System Prompt)" done={steps[1].done} description="Чатботын зан чанар, хэл, хариулах хэв маягийг тодорхойлно">
          <div className="space-y-3">
            <textarea
              value={persona}
              onChange={(e) => setPersona(e.target.value)}
              rows={8}
              className="w-full px-4 py-3 border border-zinc-200 rounded-xl text-sm font-mono focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent resize-y bg-zinc-50 placeholder:text-zinc-300 transition-shadow"
              placeholder="Жишээ: Та манай дэлгүүрийн найрсаг AI туслах юм. Монгол хэлээр тодорхой, товч хариулна. Бараа бүтээгдэхүүн, үнэ, хүргэлтийн талаар мэдэгдэл өгнө. Хэрэглэгчийн асуултад эелдэг хандна..."
            />
            <div className="flex items-center justify-between">
              <span className={`text-xs ${persona.length < 10 ? 'text-amber-500' : 'text-zinc-400'}`}>
                {persona.length} тэмдэгт{persona.length < 10 ? ' — хэтэрхий богино' : ''}
              </span>
              <div className="flex items-center gap-3">
                <FeedbackMsg state={personaMsg} />
                <Button
                  onClick={savePersona}
                  disabled={savingPersona || persona.length === 0}
                  className="bg-indigo-600 hover:bg-indigo-700 text-white"
                >
                  {savingPersona ? 'Хадгалж байна...' : 'Хадгалах'}
                </Button>
              </div>
            </div>
          </div>
        </SectionCard>

        {/* ── Knowledge Base ── */}
        <SectionCard step="📄" title="Мэдлэгийн сан" done={knowledgeFiles.length > 0} description="PDF, DOCX, TXT файл оруулна уу. AI хариулт үүсгэхэд ашиглана" optional>
          <div className="space-y-4">
            <div
              onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e) => { e.preventDefault(); setDragOver(false); const f = e.dataTransfer.files[0]; if (f) handleFileUpload(f) }}
              onClick={() => fileInputRef.current?.click()}
              className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors ${dragOver ? 'border-blue-400 bg-blue-50' : 'border-zinc-200 hover:border-zinc-400'}`}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,.doc,.docx,.txt,.json"
                className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFileUpload(f); e.target.value = '' }}
              />
              <p className="text-xl mb-1">📄</p>
              <p className="text-sm font-medium text-zinc-700">
                {uploading ? 'Оруулж байна...' : 'Файл чирж оруулах эсвэл дарж сонгоно уу'}
              </p>
              <p className="text-xs text-zinc-400 mt-1">PDF, DOCX, TXT — хамгийн их 50MB</p>
            </div>

            {uploadError && <p className="text-sm text-red-600">{uploadError}</p>}

            {knowledgeFiles.length > 0 && (
              <div className="space-y-2">
                {knowledgeFiles.map((f) => (
                  <div key={f.id} className="flex items-center justify-between p-3 bg-zinc-50 border border-zinc-200 rounded-lg">
                    <div>
                      <p className="text-sm font-medium text-zinc-900">{f.fileName}</p>
                      <p className="text-xs text-zinc-400">{formatFileSize(f.fileSize)} · {formatDate(f.uploadedAt)}</p>
                    </div>
                    <Button size="sm" variant="destructive" onClick={() => handleFileDelete(f.id)}>Устгах</Button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </SectionCard>

        {/* ── Step 3: Facebook ── */}
        <SectionCard step={3} title="Facebook Page" done={hasFacebook} description="Messenger мессеж болон comment автомат хариулах">
          {hasFacebook ? (
            <ConnectedBadge
              name={channels.find((c) => c.channelType === 'facebook_page')?.channelName ?? 'Facebook Page'}
              detail="Messenger мессеж хүлээн авч байна"
            />
          ) : (
            <div className="space-y-4">
              {/* Mode toggle */}
              <div className="flex p-1 bg-zinc-100 rounded-xl gap-1">
                {(['manual', 'oauth'] as FbMode[]).map((mode) => (
                  <button
                    key={mode}
                    onClick={() => setFbMode(mode)}
                    className={`flex-1 py-2 text-sm font-medium rounded-lg transition-all ${
                      fbMode === mode ? 'bg-white shadow text-zinc-900' : 'text-zinc-500 hover:text-zinc-700'
                    }`}
                  >
                    {mode === 'manual' ? 'Access Token' : 'OAuth нэвтрэх'}
                  </button>
                ))}
              </div>

              {fbMode === 'manual' ? (
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-zinc-500 mb-1.5">
                        Page ID <span className="text-red-400">*</span>
                      </label>
                      <input
                        value={fbPageId}
                        onChange={(e) => setFbPageId(e.target.value)}
                        className="w-full px-3 py-2.5 border border-zinc-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent bg-zinc-50"
                        placeholder="123456789"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-zinc-500 mb-1.5">Page нэр</label>
                      <input
                        value={fbPageName}
                        onChange={(e) => setFbPageName(e.target.value)}
                        className="w-full px-3 py-2.5 border border-zinc-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent bg-zinc-50"
                        placeholder="Миний дэлгүүр"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-zinc-500 mb-1.5">
                      Page Access Token <span className="text-red-400">*</span>
                    </label>
                    <input
                      type="password"
                      value={fbToken}
                      onChange={(e) => setFbToken(e.target.value)}
                      className="w-full px-3 py-2.5 border border-zinc-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent bg-zinc-50 font-mono"
                      placeholder="EAABs..."
                    />
                    <p className="text-xs text-zinc-400 mt-1.5">
                      Facebook Developer Console → App → Messenger → Page Access Token
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <Button
                      onClick={connectFbManual}
                      disabled={connectingFb || !fbPageId || !fbToken}
                      className="bg-[#1877F2] hover:bg-[#166FE5] text-white"
                    >
                      {connectingFb ? 'Холбож байна...' : 'Facebook холбох'}
                    </Button>
                    <FeedbackMsg state={fbMsg} successText="Холбогдлоо ✓" />
                  </div>
                </div>
              ) : (
                <div className="flex flex-col items-center py-6 gap-3 text-center">
                  <p className="text-sm text-zinc-500 max-w-xs">
                    Facebook бүртгэлээр нэвтрэн зөвшөөрлийн дэлгэц гарна. Page admin эрх шаардлагатай.
                  </p>
                  <a
                    href={`/api/channels/oauth/facebook?tenantId=${tenantId}&token=${authToken}`}
                    className="inline-flex items-center gap-2 px-5 py-2.5 bg-[#1877F2] text-white text-sm font-semibold rounded-xl hover:bg-[#166FE5] transition-colors shadow-md shadow-blue-500/20"
                  >
                    <FbIcon />
                    Facebook-ээр нэвтрэх
                  </a>
                </div>
              )}
            </div>
          )}
        </SectionCard>

        {/* ── Step 4: Instagram ── */}
        <SectionCard step={4} title="Instagram" done={hasInstagram} description="Instagram DM автомат хариулах (заавал биш)" optional>
          {hasInstagram ? (
            <ConnectedBadge
              name={channels.find((c) => c.channelType === 'instagram')?.channelName ?? 'Instagram'}
              detail="Instagram DM хүлээн авч байна"
            />
          ) : (
            <div className="flex flex-col items-center py-6 gap-3 text-center">
              <p className="text-sm text-zinc-500 max-w-xs">
                Instagram Professional Account холбоно. Facebook Business Manager-тай хамт тохируулна.
              </p>
              <a
                href={`/api/channels/oauth/instagram?tenantId=${tenantId}&token=${authToken}`}
                className="inline-flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-purple-500 via-pink-500 to-orange-400 text-white text-sm font-semibold rounded-xl hover:opacity-90 transition-opacity shadow-md shadow-pink-500/20"
              >
                <IgIcon />
                Instagram холбох
              </a>
            </div>
          )}
        </SectionCard>

        {/* ── Activate ── */}
        {!alreadyActive ? (
          <div className={`rounded-2xl p-6 border-2 transition-all ${
            canActivate
              ? 'bg-gradient-to-br from-indigo-50 to-violet-50 border-indigo-200 shadow-lg shadow-indigo-100'
              : 'bg-zinc-50 border-zinc-200'
          }`}>
            <h3 className={`font-semibold text-base mb-1 ${canActivate ? 'text-indigo-900' : 'text-zinc-400'}`}>
              Тенант идэвхжүүлэх
            </h3>
            <p className="text-sm text-zinc-500 mb-4 leading-relaxed">
              {canActivate
                ? 'Бүх шаардлагатай тохируулга хийгдсэн. Идэвхжүүлснээр тенант Facebook/Instagram мессеж хүлээн авна.'
                : 'Идэвхжүүлэхийн тулд API Keys болон AI Дүр тохируулж, дор хаяж нэг суваг холбосон байх шаардлагатай.'}
            </p>
            <div className="flex items-center gap-3">
              <Button
                disabled={!canActivate || activating}
                onClick={handleActivate}
                size="lg"
                className={canActivate ? 'bg-indigo-600 hover:bg-indigo-700 text-white shadow-md shadow-indigo-300' : ''}
              >
                {activating ? 'Идэвхжүүлж байна...' : 'Идэвхжүүлэх'}
              </Button>
              {activateMsg === 'success' && (
                <span className="text-sm text-emerald-600 font-medium">Идэвхжлээ ✓</span>
              )}
              {activateMsg === 'error' && (
                <span className="text-sm text-red-500 font-medium">Алдаа гарлаа</span>
              )}
            </div>
          </div>
        ) : (
          <div className="bg-gradient-to-r from-emerald-50 to-teal-50 border-2 border-emerald-200 rounded-2xl p-6 shadow-sm">
            <div className="flex items-center gap-4">
              <div className="w-11 h-11 bg-emerald-500 rounded-full flex items-center justify-center text-white text-xl font-bold shadow-lg shadow-emerald-200 flex-shrink-0">
                ✓
              </div>
              <div>
                <h3 className="font-semibold text-emerald-900">Тенант идэвхтэй байна</h3>
                <p className="text-sm text-emerald-700 mt-0.5">
                  Facebook болон Instagram мессеж хүлээн авч, AI автоматаар хариулж байна
                </p>
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  )
}

/* ── Sub-components ── */

function SectionCard({
  step, title, done, description, optional, children,
}: {
  step: number | string
  title: string
  done: boolean
  description: string
  optional?: boolean
  children: React.ReactNode
}) {
  return (
    <div className={`bg-white rounded-2xl border-2 overflow-hidden transition-all duration-300 ${
      done ? 'border-emerald-200 shadow-sm shadow-emerald-50' : 'border-zinc-200'
    }`}>
      <div className={`px-6 py-4 flex items-center gap-4 border-b ${
        done ? 'border-emerald-100 bg-gradient-to-r from-emerald-50/60 to-transparent' : 'border-zinc-100'
      }`}>
        <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0 transition-all ${
          done ? 'bg-emerald-500 text-white shadow-md shadow-emerald-200' : 'bg-zinc-100 text-zinc-500'
        }`}>
          {done ? '✓' : step}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h2 className="font-semibold text-zinc-900 text-sm">{title}</h2>
            {optional && (
              <span className="text-[10px] px-1.5 py-0.5 bg-zinc-100 text-zinc-400 rounded-full border border-zinc-200">
                заавал биш
              </span>
            )}
            {done && (
              <span className="text-[10px] px-1.5 py-0.5 bg-emerald-100 text-emerald-700 rounded-full font-medium">
                Дууссан
              </span>
            )}
          </div>
          <p className="text-xs text-zinc-400 mt-0.5">{description}</p>
        </div>
      </div>
      <div className="p-6">{children}</div>
    </div>
  )
}

function KeyField({
  label, required, masked, value, placeholder, hint, highlightColor, onChange,
}: {
  label: string
  required?: boolean
  masked: string | null
  value: string
  placeholder: string
  hint: string
  highlightColor?: 'orange'
  onChange: (v: string) => void
}) {
  const isOrange = highlightColor === 'orange'
  return (
    <div className={`p-4 rounded-xl border ${isOrange ? 'bg-orange-50 border-orange-200' : 'bg-zinc-50 border-zinc-200'}`}>
      <div className="flex items-center gap-2 mb-2.5">
        <span className="text-sm font-semibold text-zinc-900">{label}</span>
        {required && (
          <span className="text-[10px] px-1.5 py-0.5 bg-orange-100 text-orange-700 rounded-full font-semibold border border-orange-200">
            ЗААВАЛ
          </span>
        )}
        {!required && (
          <span className="text-[10px] px-1.5 py-0.5 bg-zinc-100 text-zinc-400 rounded-full border border-zinc-200">
            заавал биш
          </span>
        )}
        {masked && (
          <span className="text-[10px] px-1.5 py-0.5 bg-emerald-100 text-emerald-700 rounded-full font-medium">
            ✓ Орсон
          </span>
        )}
      </div>
      {masked && (
        <p className="text-xs text-zinc-400 font-mono mb-2">{masked}</p>
      )}
      <input
        type="password"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={`w-full px-3 py-2.5 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:border-transparent bg-white placeholder:text-zinc-300 font-mono transition-shadow ${
          isOrange ? 'border-orange-300 focus:ring-orange-400' : 'border-zinc-200 focus:ring-indigo-400'
        }`}
        placeholder={masked ? 'Шинэ key оруулах...' : placeholder}
      />
      <p className="text-xs text-zinc-400 mt-1.5">{hint}</p>
    </div>
  )
}

function ConnectedBadge({ name, detail }: { name: string; detail: string }) {
  return (
    <div className="flex items-center gap-3 p-4 bg-emerald-50 border border-emerald-200 rounded-xl">
      <div className="w-9 h-9 bg-emerald-500 rounded-full flex items-center justify-center text-white font-bold flex-shrink-0 shadow shadow-emerald-200">
        ✓
      </div>
      <div>
        <p className="text-sm font-semibold text-emerald-900">{name}</p>
        <p className="text-xs text-emerald-600 mt-0.5">{detail}</p>
      </div>
    </div>
  )
}

function FeedbackMsg({
  state,
  successText = 'Хадгалагдлаа ✓',
}: {
  state: string
  successText?: string
}) {
  if (!state) return null
  const isSuccess = state === 'success'
  return (
    <span className={`text-sm font-medium ${isSuccess ? 'text-emerald-600' : 'text-red-500'}`}>
      {isSuccess ? successText : 'Алдаа гарлаа'}
    </span>
  )
}

function FbIcon() {
  return (
    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
      <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
    </svg>
  )
}

function IgIcon() {
  return (
    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
      <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z" />
    </svg>
  )
}

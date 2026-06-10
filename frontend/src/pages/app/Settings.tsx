import { useEffect, useState } from 'react'
import { api, TenantSettings, ApiKeys } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { MODEL_PRICING_DISPLAY } from '@/lib/model-pricing'

export default function Settings() {
  const [settings, setSettings] = useState<TenantSettings | null>(null)
  const [apiKeys, setApiKeys] = useState<ApiKeys>({ openaiKey: null, geminiKey: null, xaiKey: null })
  const [newKeys, setNewKeys] = useState({ openaiKey: '', geminiKey: '', xaiKey: '' })
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState('')
  const [msgIsError, setMsgIsError] = useState(false)

  const [channels, setChannels] = useState<{ id: string; channelType: string; channelName: string | null; isActive: boolean }[]>([])
  const [resubscribing, setResubscribing] = useState<string | null>(null)

  useEffect(() => {
    api.getSettings().then(setSettings)
    api.getApiKeys().then(setApiKeys)
    api.getChannels().then(setChannels)

    const params = new URLSearchParams(window.location.search)
    const success = params.get('success')
    const error = params.get('error')
    if (success || error) {
      const SUCCESS_MSG: Record<string, string> = {
        facebook_connected: 'Facebook Page амжилттай холбогдлоо ✓',
        instagram_connected: 'Instagram амжилттай холбогдлоо ✓',
      }
      const ERROR_MSG: Record<string, string> = {
        oauth_failed: 'Холболт амжилтгүй боллоо. Дахин оролдоно уу.',
        ig_oauth_failed: 'Instagram холболт амжилтгүй боллоо. Дахин оролдоно уу.',
        token_exchange_failed: 'Facebook-ээс token авч чадсангүй. Redirect URI тохиргоог шалгана уу.',
        no_pages: 'Таны Facebook бүртгэлд удирдаж буй Page олдсонгүй. Page Admin эрхтэй эсэхээ шалгана уу.',
      }
      if (success) {
        setMsg(SUCCESS_MSG[success] || 'Амжилттай ✓')
        setMsgIsError(false)
      } else if (error) {
        setMsg(ERROR_MSG[error] || 'Алдаа гарлаа')
        setMsgIsError(true)
      }
      window.history.replaceState({}, '', window.location.pathname)
    }
  }, [])

  async function handleResubscribe(id: string) {
    setResubscribing(id)
    setMsg('')
    try {
      const res = await api.resubscribeChannel(id)
      setMsg(`Холболт сэргээгдлээ: ${res.fields.join(', ')}`)
      setMsgIsError(false)
    } catch (err) {
      setMsg(err instanceof Error ? err.message : 'Сэргээх үед алдаа гарлаа')
      setMsgIsError(true)
    } finally {
      setResubscribing(null)
    }
  }

  async function handleDeleteChannel(id: string) {
    if (!confirm('Энэ холболтыг устгах уу?')) return
    try {
      await api.disconnectChannel(id)
      setChannels((prev) => prev.filter((c) => c.id !== id))
    } catch (err) {
      setMsg(err instanceof Error ? err.message : 'Устгах үед алдаа гарлаа')
      setMsgIsError(true)
    }
  }

  async function savePersona() {
    if (!settings) return
    setSaving(true)
    try {
      await api.updatePersona({
        aiPersona: settings.aiPersona,
        timezone: settings.timezone,
        commentAutoReplyEnabled: settings.commentAutoReplyEnabled,
        commentAutoReplyText: settings.commentAutoReplyText,
        commentDmOpenerText: settings.commentDmOpenerText,
      })
      setMsg('Хадгалагдлаа ✓')
      setMsgIsError(false)
    } catch {
      setMsg('Алдаа гарлаа')
      setMsgIsError(true)
    } finally {
      setSaving(false)
      setTimeout(() => setMsg(''), 2000)
    }
  }

  async function saveModels() {
    if (!settings) return
    setSaving(true)
    try {
      await api.updateModels({
        textModel: settings.textModel,
        visionModel: settings.visionModel,
        sttModel: settings.sttModel,
      })
      setMsg('Хадгалагдлаа ✓')
      setMsgIsError(false)
    } catch {
      setMsg('Алдаа гарлаа')
      setMsgIsError(true)
    } finally {
      setSaving(false)
      setTimeout(() => setMsg(''), 2000)
    }
  }

  async function saveApiKeys() {
    setSaving(true)
    try {
      const payload: Partial<ApiKeys> = {}
      if (newKeys.openaiKey) payload.openaiKey = newKeys.openaiKey
      if (newKeys.geminiKey) payload.geminiKey = newKeys.geminiKey
      if (newKeys.xaiKey) payload.xaiKey = newKeys.xaiKey
      await api.updateApiKeys(payload)
      setMsg('API keys хадгалагдлаа ✓')
      setMsgIsError(false)
      const fresh = await api.getApiKeys()
      setApiKeys(fresh)
      setNewKeys({ openaiKey: '', geminiKey: '', xaiKey: '' })
    } catch {
      setMsg('Алдаа гарлаа')
      setMsgIsError(true)
    } finally {
      setSaving(false)
      setTimeout(() => setMsg(''), 2000)
    }
  }

  if (!settings) return <div className="p-6 text-sm text-zinc-400">Ачааллаж байна...</div>

  return (
    <div className="max-w-3xl mx-auto p-4 sm:p-6 space-y-6 sm:space-y-8">
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-indigo-900 via-indigo-800 to-violet-800 p-6 text-white shadow-xl">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,rgba(139,92,246,0.3),transparent_60%)]" />
        <div className="relative">
          <p className="text-indigo-300 text-[11px] font-semibold uppercase tracking-widest mb-1">{settings.name}</p>
          <h1 className="text-xl font-semibold">Тохиргоо</h1>
          <p className="text-sm text-indigo-200 mt-1">AI чатботынхоо тохиргоог энд удирдана уу</p>
        </div>
      </div>

      {msg && (
        <div className={`text-sm px-4 py-2 rounded-lg ${msgIsError ? 'bg-red-50 text-red-700' : 'bg-green-50 text-green-700'}`}>
          {msg}
        </div>
      )}

      {/* AI Persona */}
      <section className="bg-white rounded-xl border border-zinc-200 p-6 space-y-4">
        <SectionTitle icon="🤖" color="bg-indigo-100">AI Дүр (System Prompt)</SectionTitle>
        <textarea
          value={settings.aiPersona}
          onChange={(e) => setSettings({ ...settings, aiPersona: e.target.value })}
          rows={8}
          className="w-full px-3 py-2 border border-zinc-300 rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500 resize-y"
          placeholder="Чи манай бизнесийн AI туслах юм..."
        />
        <Button onClick={savePersona} disabled={saving}>Хадгалах</Button>
      </section>

      {/* Comment auto-reply */}
      <section className="bg-white rounded-xl border border-zinc-200 p-6 space-y-4">
        <div className="flex items-center justify-between">
          <SectionTitle icon="💬" color="bg-emerald-100">Comment Auto-Reply</SectionTitle>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={settings.commentAutoReplyEnabled}
              onChange={(e) => setSettings({ ...settings, commentAutoReplyEnabled: e.target.checked })}
              className="w-4 h-4"
            />
            <span className="text-sm text-zinc-600">Идэвхтэй</span>
          </label>
        </div>
        <div>
          <label className="block text-sm font-medium text-zinc-700 mb-1">Нийтийн comment хариу</label>
          <textarea
            value={settings.commentAutoReplyText}
            onChange={(e) => setSettings({ ...settings, commentAutoReplyText: e.target.value })}
            rows={3}
            className="w-full px-3 py-2 border border-zinc-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-zinc-700 mb-1">DM эхний мессеж</label>
          <textarea
            value={settings.commentDmOpenerText}
            onChange={(e) => setSettings({ ...settings, commentDmOpenerText: e.target.value })}
            rows={3}
            className="w-full px-3 py-2 border border-zinc-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <Button onClick={savePersona} disabled={saving}>Хадгалах</Button>
      </section>

      {/* Model Selection */}
      <section className="bg-white rounded-xl border border-zinc-200 p-6 space-y-4">
        <SectionTitle icon="🧠" color="bg-violet-100">AI Загвар сонголт</SectionTitle>
        <div className="grid grid-cols-1 gap-4">
          <ModelSelector
            label="Text Model"
            value={settings.textModel}
            options={MODEL_PRICING_DISPLAY.text}
            onChange={(v) => setSettings({ ...settings, textModel: v })}
          />
          <ModelSelector
            label="Vision Model"
            value={settings.visionModel}
            options={MODEL_PRICING_DISPLAY.vision}
            onChange={(v) => setSettings({ ...settings, visionModel: v })}
          />
          <div>
            <label className="block text-sm font-medium text-zinc-700 mb-1">STT Model</label>
            <div className="px-3 py-2 border border-zinc-200 rounded-lg text-sm bg-zinc-50 text-zinc-500">
              OpenAI Whisper (Монгол хэл) — $0.006/мин
            </div>
          </div>
        </div>
        <Button onClick={saveModels} disabled={saving}>Хадгалах</Button>
      </section>

      {/* API Keys */}
      <section className="bg-white rounded-xl border border-zinc-200 p-6 space-y-4">
        <SectionTitle icon="🔑" color="bg-amber-100">API Keys</SectionTitle>
        <div className="space-y-3">
          <ApiKeyField
            label="OpenAI API Key"
            masked={apiKeys.openaiKey}
            value={newKeys.openaiKey}
            onChange={(v) => setNewKeys({ ...newKeys, openaiKey: v })}
            hint="GPT-4o текст болон Whisper STT-д хэрэгтэй"
          />
          <ApiKeyField
            label="Gemini API Key *"
            masked={apiKeys.geminiKey}
            value={newKeys.geminiKey}
            onChange={(v) => setNewKeys({ ...newKeys, geminiKey: v })}
            hint="Мэдлэгийн санд ЗААВАЛ шаардлагатай"
          />
          <ApiKeyField
            label="xAI (Grok) API Key"
            masked={apiKeys.xaiKey}
            value={newKeys.xaiKey}
            onChange={(v) => setNewKeys({ ...newKeys, xaiKey: v })}
            hint="Grok текст загвар ашиглах бол"
          />
        </div>
        <Button onClick={saveApiKeys} disabled={saving}>API Keys хадгалах</Button>
      </section>

      {/* Channels */}
      <section className="bg-white rounded-xl border border-zinc-200 p-6 space-y-4">
        <SectionTitle icon="🔌" color="bg-blue-100">Холболтууд</SectionTitle>
        <p className="text-xs text-zinc-400 -mt-2">
          Comment Auto-Reply ажиллахгүй байвал доорх "🔄 Сэргээх" товчийг дарж холболтоо сэргээнэ үү.
        </p>
        <div className="space-y-3">
          {channels.map((ch) => (
            <div key={ch.id} className="flex items-center justify-between p-3 border border-zinc-200 rounded-lg">
              <div>
                <p className="text-sm font-medium text-zinc-900">
                  {ch.channelType === 'facebook_page' ? '📘 Facebook Page' : '📸 Instagram'}
                </p>
                {ch.channelName && <p className="text-xs text-zinc-500">{ch.channelName}</p>}
              </div>
              <div className="flex items-center gap-2">
                <span className={`text-xs px-2 py-1 rounded-full ${ch.isActive ? 'bg-green-100 text-green-700' : 'bg-zinc-100 text-zinc-500'}`}>
                  {ch.isActive ? 'Холбогдсон' : 'Салгасан'}
                </span>
                <button
                  onClick={() => handleResubscribe(ch.id)}
                  disabled={resubscribing === ch.id}
                  className="text-xs px-3 py-1.5 rounded-full border border-blue-200 bg-blue-50 text-blue-700 font-medium hover:bg-blue-100 transition-colors disabled:opacity-50"
                >
                  {resubscribing === ch.id ? 'Сэргээж байна...' : '🔄 Сэргээх'}
                </button>
                <button
                  onClick={() => handleDeleteChannel(ch.id)}
                  className="text-xs px-3 py-1.5 rounded-full border border-red-200 bg-red-50 text-red-700 font-medium hover:bg-red-100 transition-colors"
                >
                  🗑 Устгах
                </button>
              </div>
            </div>
          ))}
          <div className="flex gap-3 pt-2">
            <a href={`/api/channels/oauth/facebook?token=${localStorage.getItem('token')}`} className="text-sm text-blue-600 hover:underline">
              + Facebook Page холбох
            </a>
            <a href={`/api/channels/oauth/instagram?token=${localStorage.getItem('token')}`} className="text-sm text-blue-600 hover:underline">
              + Instagram холбох
            </a>
          </div>
        </div>
      </section>
    </div>
  )
}

function SectionTitle({ icon, color, children }: { icon: string; color: string; children: React.ReactNode }) {
  return (
    <h2 className="font-semibold text-zinc-900 flex items-center gap-2">
      <span className={`w-7 h-7 rounded-full flex items-center justify-center text-sm shrink-0 ${color}`}>{icon}</span>
      {children}
    </h2>
  )
}

function ModelSelector({ label, value, options, onChange }: {
  label: string
  value: string
  options: Array<{ id: string; name: string; price: string }>
  onChange: (v: string) => void
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-zinc-700 mb-1">{label}</label>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        {options.map((opt) => (
          <button
            key={opt.id}
            type="button"
            onClick={() => onChange(opt.id)}
            className={`p-3 border rounded-lg text-left transition-colors ${value === opt.id ? 'border-blue-500 bg-blue-50' : 'border-zinc-200 hover:bg-zinc-50'}`}
          >
            <p className="text-sm font-medium text-zinc-900">{opt.name}</p>
            <p className="text-xs text-zinc-500">{opt.price}</p>
          </button>
        ))}
      </div>
    </div>
  )
}

function ApiKeyField({ label, masked, value, onChange, hint }: {
  label: string
  masked: string | null
  value: string
  onChange: (v: string) => void
  hint: string
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-zinc-700 mb-1">{label}</label>
      {masked && (
        <p className="text-xs text-zinc-400 mb-1">Одоогийн: {masked}</p>
      )}
      <input
        type="password"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full px-3 py-2 border border-zinc-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        placeholder={masked ? 'Шинэ key оруулах (хоосон орхивол өөрчлөхгүй)' : 'sk-...'}
      />
      <p className="text-xs text-zinc-400 mt-1">{hint}</p>
    </div>
  )
}

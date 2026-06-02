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

  const [channels, setChannels] = useState<{ id: string; channelType: string; channelName: string | null; isActive: boolean }[]>([])

  useEffect(() => {
    api.getSettings().then(setSettings)
    api.getApiKeys().then(setApiKeys)
    api.getChannels().then(setChannels)
  }, [])

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
    } catch {
      setMsg('Алдаа гарлаа')
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
    } catch {
      setMsg('Алдаа гарлаа')
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
      const fresh = await api.getApiKeys()
      setApiKeys(fresh)
      setNewKeys({ openaiKey: '', geminiKey: '', xaiKey: '' })
    } catch {
      setMsg('Алдаа гарлаа')
    } finally {
      setSaving(false)
      setTimeout(() => setMsg(''), 2000)
    }
  }

  if (!settings) return <div className="p-6 text-sm text-zinc-400">Ачааллаж байна...</div>

  return (
    <div className="max-w-3xl mx-auto p-6 space-y-8">
      <h1 className="text-xl font-semibold text-zinc-900">Тохиргоо</h1>

      {msg && <div className="bg-green-50 text-green-700 text-sm px-4 py-2 rounded-lg">{msg}</div>}

      {/* AI Persona */}
      <section className="bg-white rounded-xl border border-zinc-200 p-6 space-y-4">
        <h2 className="font-semibold text-zinc-900">AI Дүр (System Prompt)</h2>
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
          <h2 className="font-semibold text-zinc-900">Comment Auto-Reply</h2>
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
        <h2 className="font-semibold text-zinc-900">AI Загвар сонголт</h2>
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
        <h2 className="font-semibold text-zinc-900">API Keys</h2>
        <div className="space-y-3">
          <ApiKeyField
            label="OpenAI API Key"
            masked={apiKeys.openaiKey}
            value={newKeys.openaiKey}
            onChange={(v) => setNewKeys({ ...newKeys, openaiKey: v })}
            hint="GPT-5.1 текст болон Whisper STT-д хэрэгтэй"
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
        <h2 className="font-semibold text-zinc-900">Холболтууд</h2>
        <div className="space-y-3">
          {channels.map((ch) => (
            <div key={ch.id} className="flex items-center justify-between p-3 border border-zinc-200 rounded-lg">
              <div>
                <p className="text-sm font-medium text-zinc-900">
                  {ch.channelType === 'facebook_page' ? '📘 Facebook Page' : '📸 Instagram'}
                </p>
                {ch.channelName && <p className="text-xs text-zinc-500">{ch.channelName}</p>}
              </div>
              <span className={`text-xs px-2 py-1 rounded-full ${ch.isActive ? 'bg-green-100 text-green-700' : 'bg-zinc-100 text-zinc-500'}`}>
                {ch.isActive ? 'Холбогдсон' : 'Салгасан'}
              </span>
            </div>
          ))}
          <div className="flex gap-3 pt-2">
            <a href="/api/channels/oauth/facebook" className="text-sm text-blue-600 hover:underline">
              + Facebook Page холбох
            </a>
            <a href="/api/channels/oauth/instagram" className="text-sm text-blue-600 hover:underline">
              + Instagram холбох
            </a>
          </div>
        </div>
      </section>
    </div>
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

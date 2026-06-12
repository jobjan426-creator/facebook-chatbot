import { useEffect, useState } from 'react'
import { api, ApiKeys } from '@/lib/api'
import { Button } from '@/components/ui/button'

export default function PlatformKeys() {
  const [apiKeys, setApiKeys] = useState<ApiKeys>({ openaiKey: null, geminiKey: null, xaiKey: null, sonorKey: null })
  const [newKeys, setNewKeys] = useState({ openaiKey: '', geminiKey: '', xaiKey: '', sonorKey: '' })
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState('')
  const [msgIsError, setMsgIsError] = useState(false)

  useEffect(() => {
    api.getPlatformApiKeys().then(setApiKeys).catch(() => {})
  }, [])

  async function save() {
    setSaving(true)
    try {
      const payload: Partial<ApiKeys> = {}
      if (newKeys.geminiKey) payload.geminiKey = newKeys.geminiKey
      if (newKeys.openaiKey) payload.openaiKey = newKeys.openaiKey
      if (newKeys.xaiKey) payload.xaiKey = newKeys.xaiKey
      if (newKeys.sonorKey) payload.sonorKey = newKeys.sonorKey
      await api.updatePlatformApiKeys(payload)
      setMsg('Нийтлэг key хадгалагдлаа ✓')
      setMsgIsError(false)
      const fresh = await api.getPlatformApiKeys()
      setApiKeys(fresh)
      setNewKeys({ openaiKey: '', geminiKey: '', xaiKey: '', sonorKey: '' })
    } catch {
      setMsg('Алдаа гарлаа')
      setMsgIsError(true)
    } finally {
      setSaving(false)
      setTimeout(() => setMsg(''), 2500)
    }
  }

  return (
    <div className="max-w-2xl mx-auto p-4 sm:p-6 space-y-6">
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-indigo-900 via-indigo-800 to-violet-800 p-6 text-white shadow-xl">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,rgba(139,92,246,0.3),transparent_60%)]" />
        <div className="relative">
          <p className="text-indigo-300 text-[11px] font-semibold uppercase tracking-widest mb-1">🔑 Platform</p>
          <h1 className="text-xl font-semibold">Нийтлэг API Keys</h1>
          <p className="text-sm text-indigo-200 mt-1">
            Энд оруулсан key-г өөрийн тусдаа key оруулаагүй БҮХ tenant автоматаар ашиглана. Tenant өөрийн key оруулсан бол түүнийг нь ашиглана (override). Шинэ tenant болгонд key дахин оруулах шаардлагагүй болно.
          </p>
        </div>
      </div>

      <section className="bg-white rounded-xl border border-zinc-200 p-6 space-y-4">
        <div className="space-y-3">
          <ApiKeyField
            label="Google Gemini API Key"
            masked={apiKeys.geminiKey}
            value={newKeys.geminiKey}
            onChange={(v) => setNewKeys({ ...newKeys, geminiKey: v })}
            hint="Мэдлэгийн сан, vision загвар, дуу таних"
          />
          <ApiKeyField
            label="OpenAI API Key"
            masked={apiKeys.openaiKey}
            value={newKeys.openaiKey}
            onChange={(v) => setNewKeys({ ...newKeys, openaiKey: v })}
            hint="GPT загвар болон Whisper дуу таних"
          />
          <ApiKeyField
            label="xAI (Grok) API Key"
            masked={apiKeys.xaiKey}
            value={newKeys.xaiKey}
            onChange={(v) => setNewKeys({ ...newKeys, xaiKey: v })}
            hint="Grok текст загвар ашиглах бол"
          />
          <ApiKeyField
            label="SonorAI (Монгол Speech-to-Text) API Key"
            masked={apiKeys.sonorKey}
            value={newKeys.sonorKey}
            onChange={(v) => setNewKeys({ ...newKeys, sonorKey: v })}
            hint="Дуут мессежийг монголоор хамгийн нарийн таниулахад ашиглана"
          />
        </div>
        <div className="flex items-center gap-3">
          <Button onClick={save} disabled={saving}>Нийтлэг key хадгалах</Button>
          {msg && <span className={`text-sm ${msgIsError ? 'text-red-600' : 'text-green-600'}`}>{msg}</span>}
        </div>
      </section>
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

import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { api, TenantSettings, ApiKeys } from '@/lib/api'
import { Button } from '@/components/ui/button'

interface Step {
  id: number
  label: string
  done: boolean
}

export default function Onboarding() {
  const { tenantId } = useParams<{ tenantId: string }>()
  const [settings, setSettings] = useState<TenantSettings | null>(null)
  const [apiKeys, setApiKeys] = useState<ApiKeys | null>(null)
  const [channels, setChannels] = useState<{ isActive: boolean }[]>([])
  const [activating, setActivating] = useState(false)
  const [msg, setMsg] = useState('')

  useEffect(() => {
    if (!tenantId) return
    Promise.all([
      api.getSettings(tenantId),
      api.getApiKeys(tenantId),
      api.getChannels(tenantId),
    ]).then(([s, k, c]) => {
      setSettings(s)
      setApiKeys(k)
      setChannels(c)
    })
  }, [tenantId])

  if (!settings || !apiKeys) return <div className="p-6 text-sm text-zinc-400">Ачааллаж байна...</div>

  const steps: Step[] = [
    { id: 1, label: 'Тенант мэдээлэл (нэр, timezone)', done: !!settings.name && !!settings.timezone },
    { id: 2, label: 'Нэвтрэх мэдээлэл (email + нууц үг)', done: true }, // always done if tenant exists
    { id: 3, label: 'API Keys (Gemini заавал)', done: !!apiKeys.geminiKey },
    { id: 4, label: 'AI Загвар сонголт', done: !!settings.textModel && !!settings.visionModel },
    { id: 5, label: 'AI Дүр (system prompt)', done: settings.aiPersona.length > 10 },
    { id: 6, label: 'Сувгийн холболт (FB/IG)', done: channels.some((c) => c.isActive) },
    { id: 7, label: 'Мэдлэгийн сан (заавал биш)', done: false },
  ]

  const requiredDone = steps.slice(0, 6).every((s) => s.done)
  const alreadyActive = settings.status === 'active'

  async function handleActivate() {
    if (!tenantId) return
    setActivating(true)
    try {
      await api.activateTenant(tenantId)
      setMsg('Тенант идэвхжлээ! ✓')
      const fresh = await api.getSettings(tenantId)
      setSettings(fresh)
    } catch {
      setMsg('Идэвхжүүлэхэд алдаа гарлаа')
    } finally {
      setActivating(false)
    }
  }

  return (
    <div className="max-w-xl mx-auto p-6 space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-zinc-900">Onboarding: {settings.name}</h1>
        <p className="text-sm text-zinc-500 mt-1">
          Статус:{' '}
          <span className={`font-medium ${alreadyActive ? 'text-green-600' : 'text-yellow-600'}`}>
            {alreadyActive ? 'Идэвхтэй' : 'Тохируулж байна'}
          </span>
        </p>
      </div>

      {msg && <div className="bg-green-50 text-green-700 text-sm px-4 py-2 rounded-lg">{msg}</div>}

      {/* Progress */}
      <div className="bg-white border border-zinc-200 rounded-xl p-6 space-y-3">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold text-zinc-900">Явц</h2>
          <span className="text-sm text-zinc-500">
            {steps.filter((s) => s.done).length} / {steps.length}
          </span>
        </div>
        {steps.map((step) => (
          <div key={step.id} className="flex items-center gap-3">
            <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${step.done ? 'bg-green-100 text-green-700' : 'bg-zinc-100 text-zinc-400'}`}>
              {step.done ? '✓' : step.id}
            </span>
            <span className={`text-sm ${step.done ? 'text-zinc-900' : 'text-zinc-500'}`}>
              {step.label}
            </span>
          </div>
        ))}
      </div>

      {/* Activate button */}
      {!alreadyActive && (
        <Button
          className="w-full"
          disabled={!requiredDone || activating}
          onClick={handleActivate}
        >
          {activating ? 'Идэвхжүүлж байна...' : requiredDone ? 'Идэвхжүүлэх' : '1-6 алхам дуусаагүй байна'}
        </Button>
      )}

      {alreadyActive && (
        <div className="bg-green-50 border border-green-200 rounded-xl p-4 text-sm text-green-700">
          ✅ Тенант идэвхтэй байна. Facebook/Instagram мессеж хүлээн авах боломжтой.
        </div>
      )}

      {/* Quick links */}
      <div className="bg-white border border-zinc-200 rounded-xl p-6 space-y-2">
        <h2 className="font-semibold text-zinc-900 mb-3">Тохируулгын холбоос</h2>
        <a href={`/api/channels/oauth/facebook?tenantId=${tenantId}`} className="block text-sm text-blue-600 hover:underline">
          → Facebook Page холбох
        </a>
        <a href={`/api/channels/oauth/instagram?tenantId=${tenantId}`} className="block text-sm text-blue-600 hover:underline">
          → Instagram холбох
        </a>
        <a href={`/admin/tenants/${tenantId}/settings`} className="block text-sm text-blue-600 hover:underline">
          → Тохиргоо засах
        </a>
      </div>
    </div>
  )
}

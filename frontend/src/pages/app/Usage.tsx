import { useEffect, useState } from 'react'
import { api, UsageSummary, DailyUsage } from '@/lib/api'
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'

const CATEGORY_LABELS: Record<string, string> = {
  text: 'Текст',
  vision: 'Зураг',
  stt: 'Дуут мессеж',
  rag: 'Мэдлэгийн сан',
}

export default function Usage() {
  const [summary, setSummary] = useState<UsageSummary | null>(null)
  const [daily, setDaily] = useState<DailyUsage[]>([])

  useEffect(() => {
    api.getUsageSummary().then(setSummary)
    api.getUsageDaily().then(setDaily)
  }, [])

  if (!summary) return <div className="p-6 text-sm text-zinc-400">Ачааллаж байна...</div>

  return (
    <div className="max-w-3xl mx-auto p-4 sm:p-6 space-y-6">
      <h1 className="text-xl font-semibold text-zinc-900">Хэрэглээ & Зардал</h1>

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <StatCard label="Нийт зардал" value={`$${summary.totalCostUsd}`} sub={summary.month} />
        <StatCard label="Нийт дуудлага" value={String(summary.totalCalls)} />
        {Object.entries(summary.byCategory).map(([cat, d]) => (
          <StatCard
            key={cat}
            label={CATEGORY_LABELS[cat] || cat}
            value={`$${d.cost.toFixed(4)}`}
            sub={`${d.calls} дуудлага`}
          />
        ))}
      </div>

      {/* Daily chart */}
      {daily.length > 0 && (
        <div className="bg-white border border-zinc-200 rounded-xl p-6">
          <h2 className="font-semibold text-zinc-900 mb-4">Өдрийн зардал (USD)</h2>
          <ResponsiveContainer width="100%" height={200}>
            <AreaChart data={daily}>
              <XAxis dataKey="date" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `$${v.toFixed(3)}`} />
              <Tooltip formatter={(v: number) => [`$${v.toFixed(5)}`, 'Зардал']} />
              <Area type="monotone" dataKey="cost" stroke="#2563eb" fill="#eff6ff" strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  )
}

function StatCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="bg-white border border-zinc-200 rounded-xl p-4">
      <p className="text-xs text-zinc-500 mb-1">{label}</p>
      <p className="text-xl font-bold text-zinc-900">{value}</p>
      {sub && <p className="text-xs text-zinc-400 mt-0.5">{sub}</p>}
    </div>
  )
}

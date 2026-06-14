import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api, TenantWithOwner, CreateTenantDto } from '@/lib/api'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { formatDate } from '@/lib/utils'

const STATUS_VARIANT: Record<string, 'default' | 'success' | 'warning' | 'destructive' | 'secondary'> = {
  active: 'success',
  suspended: 'destructive',
  pending_setup: 'warning',
}

const STATUS_LABEL: Record<string, string> = {
  active: 'Идэвхтэй',
  suspended: 'Зогсоосон',
  pending_setup: 'Тохируулж байна',
}

export default function Tenants() {
  const [tenants, setTenants] = useState<TenantWithOwner[]>([])
  const [showCreate, setShowCreate] = useState(false)
  const [form, setForm] = useState<CreateTenantDto>({
    name: '',
    ownerEmail: '',
    ownerPassword: '',
    timezone: 'Asia/Ulaanbaatar',
    industry: '',
  })
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    api.getTenants().then(setTenants)
  }, [])

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    setCreating(true)
    setError('')
    try {
      await api.createTenant(form)
      const fresh = await api.getTenants()
      setTenants(fresh)
      setShowCreate(false)
      setForm({ name: '', ownerEmail: '', ownerPassword: '', timezone: 'Asia/Ulaanbaatar', industry: '' })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Алдаа гарлаа')
    } finally {
      setCreating(false)
    }
  }

  async function handleSuspend(id: string) {
    const reason = prompt('Зогсоох шалтгаан:')
    if (reason === null) return
    await api.suspendTenant(id, reason)
    setTenants((t) => t.map((x) => x.id === id ? { ...x, status: 'suspended' } : x))
  }

  async function handleActivate(id: string) {
    await api.activateTenant(id)
    setTenants((t) => t.map((x) => x.id === id ? { ...x, status: 'active' } : x))
  }

  async function handleResetPassword(id: string, email: string) {
    const newPassword = prompt(`"${email}"-ийн шинэ нууц үг (хамгийн багадаа 8 тэмдэгт):`)
    if (newPassword === null) return
    if (newPassword.length < 8) {
      alert('Нууц үг хамгийн багадаа 8 тэмдэгт байх ёстой')
      return
    }
    try {
      await api.resetTenantPassword(id, newPassword)
      alert(`Нууц үг шинэчлэгдлээ ✓\n\nНэвтрэх: ${email}\nНууц үг: ${newPassword}`)
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Алдаа гарлаа')
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('Тенантыг бүрмөсөн устгах уу?')) return
    await api.deleteTenant(id)
    setTenants((t) => t.filter((x) => x.id !== id))
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-zinc-900">Тенантууд</h1>
        <Button onClick={() => setShowCreate(true)}>+ Шинэ тенант</Button>
      </div>

      {/* Create form */}
      {showCreate && (
        <div className="bg-white border border-zinc-200 rounded-xl p-6">
          <h2 className="font-semibold text-zinc-900 mb-4">Шинэ тенант үүсгэх</h2>
          <form onSubmit={handleCreate} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Бизнесийн нэр" value={form.name} onChange={(v) => setForm({ ...form, name: v })} required />
            <Field label="Эзний и-мэйл" type="email" value={form.ownerEmail} onChange={(v) => setForm({ ...form, ownerEmail: v })} required />
            <Field label="Түр нууц үг" type="password" value={form.ownerPassword} onChange={(v) => setForm({ ...form, ownerPassword: v })} required />
            <div>
              <label className="block text-sm font-medium text-zinc-700 mb-1">Салбар</label>
              <select
                value={form.industry}
                onChange={(e) => setForm({ ...form, industry: e.target.value })}
                className="w-full px-3 py-2 border border-zinc-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">Сонгоно уу</option>
                <option value="restaurant">Ресторан</option>
                <option value="salon">Салон</option>
                <option value="online_shop">Онлайн дэлгүүр</option>
                <option value="other">Бусад</option>
              </select>
            </div>
            {error && <p className="text-sm text-red-600 col-span-2">{error}</p>}
            <div className="col-span-2 flex gap-3">
              <Button type="submit" disabled={creating}>{creating ? 'Үүсгэж байна...' : 'Үүсгэх'}</Button>
              <Button type="button" variant="ghost" onClick={() => setShowCreate(false)}>Буцах</Button>
            </div>
          </form>
        </div>
      )}

      {/* Table */}
      <div className="bg-white border border-zinc-200 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-zinc-50 border-b border-zinc-200">
            <tr>
              <th className="text-left px-4 py-3 font-medium text-zinc-600">Бизнес</th>
              <th className="text-left px-4 py-3 font-medium text-zinc-600">Эзэн</th>
              <th className="text-left px-4 py-3 font-medium text-zinc-600">Статус</th>
              <th className="text-left px-4 py-3 font-medium text-zinc-600">Яриа</th>
              <th className="text-left px-4 py-3 font-medium text-zinc-600">Бүртгэгдсэн</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {tenants.map((t) => {
              const href = `/admin/tenants/${t.id}/onboarding`
              const cell = 'block px-4 py-3 hover:bg-indigo-50/40 transition-colors'
              return (
                <tr key={t.id} className="border-b border-zinc-100 group">
                  <td className="font-medium text-zinc-900 p-0">
                    <Link to={href} className={cell}>{t.name}</Link>
                  </td>
                  <td className="text-zinc-600 p-0">
                    <Link to={href} className={cell}>{t.owner.email}</Link>
                  </td>
                  <td className="p-0">
                    <Link to={href} className={cell}>
                      <Badge variant={STATUS_VARIANT[t.status]}>{STATUS_LABEL[t.status]}</Badge>
                    </Link>
                  </td>
                  <td className="text-zinc-600 p-0">
                    <Link to={href} className={cell}>{t._count.conversations}</Link>
                  </td>
                  <td className="text-zinc-500 p-0">
                    <Link to={href} className={cell}>{formatDate(t.createdAt)}</Link>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-2 justify-end">
                      {t.status === 'active' && (
                        <Button size="sm" variant="outline" onClick={() => handleSuspend(t.id)}>Зогсоох</Button>
                      )}
                      {t.status === 'suspended' && (
                        <Button size="sm" variant="outline" onClick={() => handleActivate(t.id)}>Идэвхжүүлэх</Button>
                      )}
                      <Button size="sm" variant="outline" onClick={() => handleResetPassword(t.id, t.owner.email)}>Нууц үг</Button>
                      <Button size="sm" variant="destructive" onClick={() => handleDelete(t.id)}>Устгах</Button>
                    </div>
                  </td>
                </tr>
              )
            })}
            {tenants.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-zinc-400">Тенант байхгүй байна</td>
              </tr>
            )}
          </tbody>
        </table>
        </div>
      </div>
    </div>
  )
}

function Field({ label, value, onChange, type = 'text', required }: {
  label: string; value: string; onChange: (v: string) => void; type?: string; required?: boolean
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-zinc-700 mb-1">{label}</label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required={required}
        className="w-full px-3 py-2 border border-zinc-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
      />
    </div>
  )
}

import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '@/stores/auth.store'
import { Button } from '@/components/ui/button'

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const { login, user, token } = useAuthStore()
  const navigate = useNavigate()

  useEffect(() => {
    if (token && user && !user.forcePasswordChange) {
      navigate(user.role === 'super_admin' ? '/admin' : '/app')
    }
  }, [token, user, navigate])

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await login(email, password)
      // Navigation happens in useEffect above
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Нэвтрэлт амжилтгүй')
    } finally {
      setLoading(false)
    }
  }

  async function handleChangePassword(e: React.FormEvent) {
    e.preventDefault()
    if (newPassword.length < 8) {
      setError('Нууц үг хамгийн багадаа 8 тэмдэгт байх ёстой')
      return
    }
    setLoading(true)
    try {
      const { api } = await import('@/lib/api')
      await api.changePassword(newPassword)
      await useAuthStore.getState().refreshUser()
      navigate(user?.role === 'super_admin' ? '/admin' : '/app')
    } catch {
      setError('Нууц үг солиход алдаа гарлаа')
    } finally {
      setLoading(false)
    }
  }

  if (user?.forcePasswordChange) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-zinc-50">
        <div className="w-full max-w-sm p-8 bg-white rounded-xl shadow-sm border border-zinc-200">
          <h1 className="text-xl font-semibold text-zinc-900 mb-2">Нууц үг солих</h1>
          <p className="text-sm text-zinc-500 mb-6">
            Аюулгүй байдлын үүднээс анхны нэвтрэлтэд нууц үгээ солиорой.
          </p>
          <form onSubmit={handleChangePassword} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-zinc-700 mb-1">Шинэ нууц үг</label>
              <input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="w-full px-3 py-2 border border-zinc-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Хамгийн багадаа 8 тэмдэгт"
                required
              />
            </div>
            {error && <p className="text-sm text-red-600">{error}</p>}
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? 'Хадгалж байна...' : 'Хадгалах'}
            </Button>
          </form>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-zinc-50">
      <div className="w-full max-w-sm p-8 bg-white rounded-xl shadow-sm border border-zinc-200">
        <div className="mb-8 text-center">
          <img
            src="/icon.svg"
            alt="AI Platform"
            className="w-16 h-16 mx-auto mb-4 rounded-2xl shadow-md shadow-indigo-200"
          />
          <h1 className="text-2xl font-bold text-zinc-900">AI Platform</h1>
          <p className="text-xs font-semibold uppercase tracking-widest text-indigo-500 mt-1">
            Bota AI Agent
          </p>
          <p className="text-sm text-zinc-500 mt-3">Нэвтрэх</p>
        </div>
        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-zinc-700 mb-1">И-мэйл</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-3 py-2 border border-zinc-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="admin@example.com"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-zinc-700 mb-1">Нууц үг</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-3 py-2 border border-zinc-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              required
            />
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? 'Нэвтэрч байна...' : 'Нэвтрэх'}
          </Button>
        </form>
      </div>
    </div>
  )
}

import { BrowserRouter, Routes, Route, Navigate, Link, useLocation } from 'react-router-dom'
import { useEffect } from 'react'
import { useAuthStore } from '@/stores/auth.store'
import { connectSocket } from '@/lib/socket'
import Login from '@/pages/Login'
import Inbox from '@/pages/app/Inbox'
import KnowledgeBase from '@/pages/app/KnowledgeBase'
import Settings from '@/pages/app/Settings'
import Usage from '@/pages/app/Usage'
import Tenants from '@/pages/admin/Tenants'
import Onboarding from '@/pages/admin/Onboarding'

function AuthGuard({ children }: { children: React.ReactNode }) {
  const { token, user } = useAuthStore()
  if (!token || !user) return <Navigate to="/login" replace />
  if (user.forcePasswordChange) return <Navigate to="/login" replace />
  return <>{children}</>
}

function SuperAdminGuard({ children }: { children: React.ReactNode }) {
  const { user } = useAuthStore()
  if (user?.role !== 'super_admin') return <Navigate to="/app" replace />
  return <>{children}</>
}

function AppLayout({ children }: { children: React.ReactNode }) {
  const { user, logout } = useAuthStore()
  const location = useLocation()

  const isAdmin = user?.role === 'super_admin'

  const navLinks = isAdmin
    ? [
        { to: '/admin', label: 'Тенантууд' },
        { to: '/admin/inbox', label: 'Inbox' },
        { to: '/admin/usage', label: 'Зардал' },
      ]
    : [
        { to: '/app', label: 'Inbox' },
        { to: '/app/knowledge', label: 'Мэдлэгийн сан' },
        { to: '/app/settings', label: 'Тохиргоо' },
        { to: '/app/usage', label: 'Зардал' },
      ]

  return (
    <div className="min-h-screen flex flex-col bg-zinc-50">
      <nav className="bg-white border-b border-zinc-200 px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-6">
          <span className="font-bold text-zinc-900">AI Platform</span>
          <div className="flex gap-4">
            {navLinks.map((link) => (
              <Link
                key={link.to}
                to={link.to}
                className={`text-sm transition-colors ${location.pathname === link.to ? 'text-blue-600 font-medium' : 'text-zinc-600 hover:text-zinc-900'}`}
              >
                {link.label}
              </Link>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-zinc-400">{user?.email}</span>
          <button onClick={logout} className="text-xs text-zinc-500 hover:text-zinc-900 transition-colors">
            Гарах
          </button>
        </div>
      </nav>
      <main className="flex-1 overflow-hidden">
        {children}
      </main>
    </div>
  )
}

function RootRedirect() {
  const { token, user } = useAuthStore()
  if (!token || !user) return <Navigate to="/login" replace />
  return <Navigate to={user.role === 'super_admin' ? '/admin' : '/app'} replace />
}

export default function App() {
  const { token } = useAuthStore()

  useEffect(() => {
    if (token) connectSocket(token)
  }, [token])

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/" element={<RootRedirect />} />

        {/* Tenant Admin routes */}
        <Route path="/app" element={<AuthGuard><AppLayout><Inbox /></AppLayout></AuthGuard>} />
        <Route path="/app/knowledge" element={<AuthGuard><AppLayout><KnowledgeBase /></AppLayout></AuthGuard>} />
        <Route path="/app/settings" element={<AuthGuard><AppLayout><Settings /></AppLayout></AuthGuard>} />
        <Route path="/app/usage" element={<AuthGuard><AppLayout><Usage /></AppLayout></AuthGuard>} />

        {/* Super Admin routes */}
        <Route path="/admin" element={<AuthGuard><SuperAdminGuard><AppLayout><Tenants /></AppLayout></SuperAdminGuard></AuthGuard>} />
        <Route path="/admin/tenants/:tenantId/onboarding" element={<AuthGuard><SuperAdminGuard><AppLayout><Onboarding /></AppLayout></SuperAdminGuard></AuthGuard>} />
        <Route path="/admin/inbox" element={<AuthGuard><SuperAdminGuard><AppLayout><Inbox /></AppLayout></SuperAdminGuard></AuthGuard>} />
        <Route path="/admin/usage" element={<AuthGuard><SuperAdminGuard><AppLayout><Usage /></AppLayout></SuperAdminGuard></AuthGuard>} />

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}

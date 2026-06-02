import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { AuthUser, api } from '@/lib/api'
import { connectSocket, disconnectSocket } from '@/lib/socket'

interface AuthState {
  token: string | null
  user: AuthUser | null
  login: (email: string, password: string) => Promise<void>
  logout: () => void
  refreshUser: () => Promise<void>
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      token: null,
      user: null,

      login: async (email, password) => {
        const { token, user } = await api.login(email, password)
        localStorage.setItem('token', token)
        set({ token, user })
        connectSocket(token)
      },

      logout: () => {
        localStorage.removeItem('token')
        disconnectSocket()
        set({ token: null, user: null })
      },

      refreshUser: async () => {
        try {
          const user = await api.me()
          set({ user })
        } catch {
          get().logout()
        }
      },
    }),
    {
      name: 'auth-storage',
      partialize: (state) => ({ token: state.token, user: state.user }),
    }
  )
)

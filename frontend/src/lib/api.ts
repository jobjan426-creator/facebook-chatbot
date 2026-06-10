const BASE = '/api'
const AUTH_BASE = '/auth'

function getToken(): string | null {
  return localStorage.getItem('token')
}

async function request<T>(
  url: string,
  options: RequestInit = {}
): Promise<T> {
  const token = getToken()
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  }
  if (token) headers['Authorization'] = `Bearer ${token}`

  const res = await fetch(url, { ...options, headers })

  if (res.status === 401) {
    localStorage.removeItem('token')
    window.location.href = '/login'
    throw new Error('Unauthorized')
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }))
    throw new Error((body as { error: string }).error || res.statusText)
  }

  if (res.status === 204) return undefined as T
  return res.json()
}

export const api = {
  // Auth
  login: (email: string, password: string) =>
    request<{ token: string; user: AuthUser }>(`${AUTH_BASE}/login`, {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    }),

  me: () => request<AuthUser>(`${AUTH_BASE}/me`),

  changePassword: (newPassword: string) =>
    request(`${AUTH_BASE}/change-password`, {
      method: 'POST',
      body: JSON.stringify({ newPassword }),
    }),

  // Conversations
  getConversations: (params?: Record<string, string>) => {
    const qs = params ? '?' + new URLSearchParams(params).toString() : ''
    return request<Conversation[]>(`${BASE}/conversations${qs}`)
  },

  updateConversationStatus: (id: string, status: string, handoffReason?: string) =>
    request<Conversation>(`${BASE}/conversations/${id}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status, handoffReason }),
    }),

  deleteConversation: (id: string) =>
    request(`${BASE}/conversations/${id}`, { method: 'DELETE' }),

  // Messages
  getMessages: (conversationId: string, offset = 0) =>
    request<Message[]>(`${BASE}/messages?conversationId=${conversationId}&offset=${offset}`),

  sendMessage: (conversationId: string, text: string) =>
    request<Message>(`${BASE}/messages`, {
      method: 'POST',
      body: JSON.stringify({ conversationId, text }),
    }),

  // Settings
  getSettings: (tenantId?: string) => {
    const qs = tenantId ? `?tenantId=${tenantId}` : ''
    return request<TenantSettings>(`${BASE}/settings${qs}`)
  },

  updatePersona: (data: Partial<TenantSettings>, tenantId?: string) => {
    const qs = tenantId ? `?tenantId=${tenantId}` : ''
    return request(`${BASE}/settings/persona${qs}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    })
  },

  updateModels: (data: { textModel?: string; visionModel?: string; sttModel?: string }, tenantId?: string) => {
    const qs = tenantId ? `?tenantId=${tenantId}` : ''
    return request(`${BASE}/settings/models${qs}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    })
  },

  getApiKeys: (tenantId?: string) => {
    const qs = tenantId ? `?tenantId=${tenantId}` : ''
    return request<ApiKeys>(`${BASE}/settings/api-keys${qs}`)
  },

  updateApiKeys: (data: Partial<ApiKeys>, tenantId?: string) => {
    const qs = tenantId ? `?tenantId=${tenantId}` : ''
    return request(`${BASE}/settings/api-keys${qs}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    })
  },

  // Knowledge base
  getKnowledgeFiles: (tenantId?: string) => {
    const qs = tenantId ? `?tenantId=${tenantId}` : ''
    return request<KnowledgeFile[]>(`${BASE}/knowledge${qs}`)
  },

  uploadKnowledgeFile: async (file: File, tenantId?: string) => {
    const token = getToken()
    const form = new FormData()
    form.append('file', file)
    const qs = tenantId ? `?tenantId=${tenantId}` : ''
    const r = await fetch(`${BASE}/knowledge/upload${qs}`, {
      method: 'POST',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: form,
    })
    if (!r.ok) {
      const body = await r.json().catch(() => ({ error: r.statusText }))
      throw new Error((body as { error: string }).error || r.statusText)
    }
    return r.json()
  },

  deleteKnowledgeFile: (id: string, tenantId?: string) => {
    const qs = tenantId ? `?tenantId=${tenantId}` : ''
    return request(`${BASE}/knowledge/${id}${qs}`, { method: 'DELETE' })
  },

  // Tenants (super-admin)
  getTenants: () => request<TenantWithOwner[]>(`${BASE}/tenants`),

  createTenant: (data: CreateTenantDto) =>
    request(`${BASE}/tenants`, { method: 'POST', body: JSON.stringify(data) }),

  suspendTenant: (id: string, reason?: string) =>
    request(`${BASE}/tenants/${id}/suspend`, { method: 'POST', body: JSON.stringify({ reason }) }),

  activateTenant: (id: string) =>
    request(`${BASE}/tenants/${id}/activate`, { method: 'POST', body: JSON.stringify({}) }),

  deleteTenant: (id: string) =>
    request(`${BASE}/tenants/${id}`, { method: 'DELETE' }),

  // Usage
  getUsageSummary: (tenantId?: string) => {
    const qs = tenantId ? `?tenantId=${tenantId}` : ''
    return request<UsageSummary>(`${BASE}/usage/summary${qs}`)
  },

  getUsageDaily: (tenantId?: string, days = 30) => {
    const qs = new URLSearchParams({ days: String(days), ...(tenantId ? { tenantId } : {}) })
    return request<DailyUsage[]>(`${BASE}/usage/daily?${qs}`)
  },

  // Channels
  getChannels: (tenantId?: string) => {
    const qs = tenantId ? `?tenantId=${tenantId}` : ''
    return request<ChannelStatus[]>(`${BASE}/channels/status${qs}`)
  },

  disconnectChannel: (id: string) =>
    request(`${BASE}/channels/${id}`, { method: 'DELETE' }),

  resubscribeChannel: (id: string) =>
    request<{ success: boolean; fields: string[] }>(`${BASE}/channels/${id}/resubscribe`, { method: 'POST' }),

  connectFacebookManual: (data: { pageId: string; pageName?: string; accessToken: string }, tenantId?: string) => {
    const qs = tenantId ? `?tenantId=${tenantId}` : ''
    return request(`${BASE}/channels/facebook/manual${qs}`, {
      method: 'POST',
      body: JSON.stringify({ ...data, tenantId }),
    })
  },
}

// Types
export interface AuthUser {
  id: string
  email: string
  role: 'super_admin' | 'tenant_admin'
  tenantId?: string
  forcePasswordChange: boolean
}

export interface Conversation {
  id: string
  tenantId: string
  channelType: 'facebook_page' | 'instagram'
  contactIdentifier: string
  contactName: string | null
  status: 'ai_active' | 'human_active' | 'awaiting_human' | 'resolved'
  assignedOperatorId: string | null
  updatedAt: string
  messages?: Pick<Message, 'content' | 'sentBy' | 'createdAt' | 'mediaType'>[]
}

export interface Message {
  id: string
  conversationId: string
  content: string
  mediaUrl: string | null
  mediaType: string | null
  sentBy: string
  createdAt: string
}

export interface TenantSettings {
  id: string
  name: string
  aiPersona: string
  timezone: string
  industry: string | null
  textModel: string
  visionModel: string
  sttModel: string
  commentAutoReplyEnabled: boolean
  commentAutoReplyText: string
  commentDmOpenerText: string
  status: string
}

export interface ApiKeys {
  openaiKey: string | null
  geminiKey: string | null
  xaiKey: string | null
  updatedAt?: string
}

export interface KnowledgeFile {
  id: string
  fileName: string
  fileSize: number
  mimeType: string
  uploadedAt: string
}

export interface TenantWithOwner {
  id: string
  name: string
  status: string
  createdAt: string
  owner: { id: string; email: string; lastLoginAt: string | null }
  channels: { channelType: string; isActive: boolean }[]
  _count: { conversations: number }
}

export interface CreateTenantDto {
  name: string
  ownerEmail: string
  ownerPassword: string
  timezone?: string
  industry?: string
}

export interface UsageSummary {
  month: string
  totalCostUsd: string
  byCategory: Record<string, { calls: number; cost: number }>
  totalCalls: number
}

export interface DailyUsage {
  date: string
  cost: number
}

export interface ChannelStatus {
  id: string
  channelType: string
  channelName: string | null
  isActive: boolean
  connectedAt: string
}

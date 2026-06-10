import { create } from 'zustand'
import { Conversation, Message, api } from '@/lib/api'
import { getSocket } from '@/lib/socket'

interface ChatState {
  conversations: Conversation[]
  activeConversationId: string | null
  messages: Record<string, Message[]>
  loading: boolean

  fetchConversations: (params?: Record<string, string>) => Promise<void>
  setActiveConversation: (id: string) => Promise<void>
  sendMessage: (text: string) => Promise<void>
  updateConversationStatus: (id: string, status: string) => Promise<void>
  deleteConversation: (id: string) => Promise<void>
  onNewMessage: (data: { conversationId: string; message: Message }) => void
  onStatusChanged: (data: { conversationId: string; status: string }) => void
}

export const useChatStore = create<ChatState>((set, get) => ({
  conversations: [],
  activeConversationId: null,
  messages: {},
  loading: false,

  fetchConversations: async (params) => {
    set({ loading: true })
    try {
      const convs = await api.getConversations(params)
      set({ conversations: convs })
    } finally {
      set({ loading: false })
    }
  },

  setActiveConversation: async (id) => {
    set({ activeConversationId: id })
    if (!get().messages[id]) {
      const msgs = await api.getMessages(id)
      set((s) => ({ messages: { ...s.messages, [id]: msgs } }))
    }
  },

  sendMessage: async (text) => {
    const { activeConversationId } = get()
    if (!activeConversationId) return
    await api.sendMessage(activeConversationId, text)
  },

  deleteConversation: async (id) => {
    await api.deleteConversation(id)
    set((s) => {
      const messages = { ...s.messages }
      delete messages[id]
      return {
        conversations: s.conversations.filter((c) => c.id !== id),
        messages,
        activeConversationId: s.activeConversationId === id ? null : s.activeConversationId,
      }
    })
  },

  updateConversationStatus: async (id, status) => {
    await api.updateConversationStatus(id, status)
    set((s) => ({
      conversations: s.conversations.map((c) =>
        c.id === id ? { ...c, status: status as Conversation['status'] } : c
      ),
    }))
  },

  onNewMessage: ({ conversationId, message }) => {
    set((s) => {
      const existing = s.messages[conversationId] || []
      const updated = { ...s.messages, [conversationId]: [...existing, message] }

      const convs = s.conversations.map((c) =>
        c.id === conversationId
          ? {
              ...c,
              updatedAt: message.createdAt,
              messages: [{ content: message.content, sentBy: message.sentBy, createdAt: message.createdAt, mediaType: message.mediaType }],
            }
          : c
      )

      // If conversation doesn't exist yet, refetch
      if (!convs.find((c) => c.id === conversationId)) {
        api.getConversations().then((freshConvs) => set({ conversations: freshConvs }))
      }

      return { messages: updated, conversations: convs }
    })
  },

  onStatusChanged: ({ conversationId, status }) => {
    set((s) => ({
      conversations: s.conversations.map((c) =>
        c.id === conversationId ? { ...c, status: status as Conversation['status'] } : c
      ),
    }))
  },
}))

// Register socket listeners
export function setupChatSocketListeners(): () => void {
  const socket = getSocket()
  if (!socket) return () => {}

  const { onNewMessage, onStatusChanged } = useChatStore.getState()

  socket.on('new_message', onNewMessage)
  socket.on('conversation_status_changed', onStatusChanged)

  return () => {
    socket.off('new_message', onNewMessage)
    socket.off('conversation_status_changed', onStatusChanged)
  }
}

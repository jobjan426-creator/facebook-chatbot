import { useEffect, useRef, useState } from 'react'
import { useChatStore, setupChatSocketListeners } from '@/stores/chat.store'
import { useAuthStore } from '@/stores/auth.store'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { formatDate } from '@/lib/utils'
import { Conversation } from '@/lib/api'

const STATUS_LABEL: Record<string, string> = {
  ai_active: 'AI',
  human_active: 'Оператор',
  awaiting_human: 'Хүлээж байна',
  resolved: 'Дууссан',
}

const STATUS_VARIANT: Record<string, 'default' | 'success' | 'warning' | 'destructive' | 'secondary'> = {
  ai_active: 'default',
  human_active: 'success',
  awaiting_human: 'warning',
  resolved: 'secondary',
}

export default function Inbox() {
  const { conversations, activeConversationId, messages, loading, fetchConversations, setActiveConversation, sendMessage, updateConversationStatus } = useChatStore()
  const { user } = useAuthStore()
  const [text, setText] = useState('')
  const [filter, setFilter] = useState<string>('')
  const messagesEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    fetchConversations()
    const cleanup = setupChatSocketListeners()
    return cleanup
  }, [])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, activeConversationId])

  const activeConv = conversations.find((c) => c.id === activeConversationId)
  const activeMessages = activeConversationId ? messages[activeConversationId] || [] : []

  const filtered = filter
    ? conversations.filter((c) => c.status === filter)
    : conversations

  async function handleSend(e: React.FormEvent) {
    e.preventDefault()
    if (!text.trim()) return
    await sendMessage(text.trim())
    setText('')
  }

  async function handleTakeover() {
    if (!activeConversationId) return
    await updateConversationStatus(activeConversationId, 'human_active')
  }

  async function handleReturnToAi() {
    if (!activeConversationId) return
    await updateConversationStatus(activeConversationId, 'ai_active')
  }

  async function handleResolve() {
    if (!activeConversationId) return
    await updateConversationStatus(activeConversationId, 'resolved')
  }

  return (
    <div className="flex h-full">
      {/* Sidebar */}
      <div className="w-72 border-r border-zinc-200 flex flex-col bg-white">
        <div className="p-4 border-b border-zinc-200">
          <h2 className="font-semibold text-zinc-900">Inbox</h2>
          <div className="flex gap-1 mt-3 flex-wrap">
            {['', 'ai_active', 'human_active', 'awaiting_human', 'resolved'].map((s) => (
              <button
                key={s}
                onClick={() => setFilter(s)}
                className={`text-xs px-2 py-1 rounded-full border transition-colors ${filter === s ? 'bg-blue-600 text-white border-blue-600' : 'border-zinc-200 text-zinc-600 hover:bg-zinc-50'}`}
              >
                {s === '' ? 'Бүх' : STATUS_LABEL[s]}
              </button>
            ))}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {loading && (
            <div className="p-4 text-sm text-zinc-400 text-center">Ачааллаж байна...</div>
          )}
          {filtered.map((conv) => (
            <ConversationItem
              key={conv.id}
              conv={conv}
              active={conv.id === activeConversationId}
              onClick={() => setActiveConversation(conv.id)}
            />
          ))}
          {!loading && filtered.length === 0 && (
            <div className="p-4 text-sm text-zinc-400 text-center">Яриа байхгүй</div>
          )}
        </div>
      </div>

      {/* Chat panel */}
      <div className="flex-1 flex flex-col bg-zinc-50">
        {activeConv ? (
          <>
            {/* Header */}
            <div className="px-6 py-4 bg-white border-b border-zinc-200 flex items-center justify-between">
              <div>
                <p className="font-semibold text-zinc-900">
                  {activeConv.contactName || activeConv.contactIdentifier}
                </p>
                <p className="text-xs text-zinc-500 capitalize">{activeConv.channelType.replace('_', ' ')}</p>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant={STATUS_VARIANT[activeConv.status]}>
                  {STATUS_LABEL[activeConv.status]}
                </Badge>
                {activeConv.status === 'ai_active' && (
                  <Button size="sm" variant="outline" onClick={handleTakeover}>
                    Гараар авах
                  </Button>
                )}
                {(activeConv.status === 'human_active' || activeConv.status === 'awaiting_human') && (
                  <>
                    <Button size="sm" variant="ghost" onClick={handleReturnToAi}>
                      AI-д буцаах
                    </Button>
                    <Button size="sm" variant="secondary" onClick={handleResolve}>
                      Дуусгах
                    </Button>
                  </>
                )}
              </div>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-6 space-y-4">
              {activeMessages.map((msg) => (
                <MessageBubble key={msg.id} msg={msg} myUserId={user?.id} />
              ))}
              <div ref={messagesEndRef} />
            </div>

            {/* Input */}
            <form onSubmit={handleSend} className="p-4 bg-white border-t border-zinc-200 flex gap-3">
              <input
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder={
                  activeConv.status === 'ai_active'
                    ? 'AI хариулж байна (гараар авахын тулд дэд товч дарна уу)'
                    : 'Хариулт бичих...'
                }
                className="flex-1 px-4 py-2 border border-zinc-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                disabled={activeConv.status === 'ai_active'}
              />
              <Button type="submit" disabled={activeConv.status === 'ai_active' || !text.trim()}>
                Илгээх
              </Button>
            </form>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center text-zinc-400 text-sm">
            Яриа сонгоно уу
          </div>
        )}
      </div>
    </div>
  )
}

function ConversationItem({ conv, active, onClick }: { conv: Conversation; active: boolean; onClick: () => void }) {
  const lastMsg = conv.messages?.[0]
  return (
    <button
      onClick={onClick}
      className={`w-full text-left p-4 border-b border-zinc-100 transition-colors hover:bg-zinc-50 ${active ? 'bg-blue-50 border-l-2 border-l-blue-600' : ''}`}
    >
      <div className="flex items-center justify-between mb-1">
        <span className="text-sm font-medium text-zinc-900 truncate">
          {conv.contactName || conv.contactIdentifier}
        </span>
        <Badge variant={STATUS_VARIANT[conv.status]} className="ml-2 shrink-0 text-[10px]">
          {STATUS_LABEL[conv.status]}
        </Badge>
      </div>
      {lastMsg && (
        <p className="text-xs text-zinc-500 truncate">
          {lastMsg.sentBy === 'ai' ? '🤖 ' : lastMsg.sentBy === 'customer' ? '' : '👤 '}
          {lastMsg.content}
        </p>
      )}
      <p className="text-[10px] text-zinc-400 mt-1">
        {formatDate(conv.updatedAt)}
      </p>
    </button>
  )
}

function MessageBubble({ msg, myUserId }: { msg: { id: string; content: string; sentBy: string; createdAt: string }; myUserId?: string }) {
  const isCustomer = msg.sentBy === 'customer'
  const isAi = msg.sentBy === 'ai'
  const isMe = msg.sentBy === myUserId

  return (
    <div className={`flex ${isCustomer ? 'justify-start' : 'justify-end'}`}>
      <div
        className={`max-w-[70%] px-4 py-2 rounded-2xl text-sm ${
          isCustomer
            ? 'bg-white border border-zinc-200 text-zinc-900'
            : isAi
            ? 'bg-blue-600 text-white'
            : 'bg-zinc-800 text-white'
        }`}
      >
        {!isCustomer && (
          <p className="text-[10px] opacity-70 mb-1">
            {isAi ? '🤖 AI' : '👤 Оператор'}
          </p>
        )}
        <p className="whitespace-pre-wrap">{msg.content}</p>
        <p className="text-[10px] opacity-60 mt-1 text-right">{formatDate(msg.createdAt)}</p>
      </div>
    </div>
  )
}

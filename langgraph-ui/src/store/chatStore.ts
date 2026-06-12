import { create } from 'zustand'
import { chatAPI } from '../api'

export interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
  time: string
}

interface ChatStore {
  messages: ChatMessage[]
  threadId: string
  loading: boolean
  sendMessage: (text: string) => Promise<void>
  newSession: () => void
}

const genId = () => `chat-${Date.now()}`
const nowTime = () =>
  new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })

export const useChatStore = create<ChatStore>((set, get) => ({
  messages: [],
  threadId: genId(),
  loading: false,

  sendMessage: async (text) => {
    const userMsg: ChatMessage = { role: 'user', content: text, time: nowTime() }
    set(s => ({ messages: [...s.messages, userMsg], loading: true }))
    try {
      const res = await chatAPI.sendMemory(get().threadId, text)
      const aiMsg: ChatMessage = {
        role: 'assistant',
        content: res.data.answer,
        time: nowTime(),
      }
      set(s => ({ messages: [...s.messages, aiMsg] }))
    } finally {
      set({ loading: false })
    }
  },

  newSession: () => set({ messages: [], threadId: genId() }),
}))

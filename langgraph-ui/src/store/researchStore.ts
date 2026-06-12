import { create } from 'zustand'
import { researchAPI } from '../api'

type ResearchStatus = 'idle' | 'researching' | 'reviewing' | 'published' | 'rejected'

interface ResearchStore {
  threadId: string
  status: ResearchStatus
  reviewData: any
  report: string
  executionLog: string[]
  loading: boolean
  startResearch: (question: string) => Promise<void>
  approve: () => Promise<void>
  revise: (feedback: string) => Promise<void>
  reject: () => Promise<void>
  pollState: () => Promise<void>
  reset: () => void
}

export const useResearchStore = create<ResearchStore>((set, get) => ({
  threadId: '',
  status: 'idle',
  reviewData: null,
  report: '',
  executionLog: [],
  loading: false,

  startResearch: async (question) => {
    const tid = `r-${Date.now()}`
    set({ threadId: tid, status: 'researching', loading: true, executionLog: [] })
    try {
      const res = await researchAPI.start(question, tid)
      if (res.data.status === 'waiting_for_review') {
        set({ status: 'reviewing', reviewData: res.data.reviewData })
        get().pollState()
      }
    } catch {
      set({ status: 'idle' })
    } finally {
      set({ loading: false })
    }
  },

  approve: async () => {
    set({ loading: true })
    const res = await researchAPI.approve(get().threadId)
    set({ status: 'published', report: res.data.report, loading: false })
  },

  revise: async (feedback) => {
    set({ loading: true })
    const res = await researchAPI.revise(get().threadId, feedback)
    if (res.data.status === 'waiting_for_review') {
      set({ status: 'reviewing', reviewData: res.data.reviewData })
    }
    set({ loading: false })
  },

  reject: async () => {
    await researchAPI.reject(get().threadId)
    set({ status: 'rejected', loading: false })
  },

  pollState: async () => {
    const res = await researchAPI.getState(get().threadId)
    set({ executionLog: res.data.executionLog ?? [] })
  },

  reset: () =>
    set({
      threadId: '',
      status: 'idle',
      reviewData: null,
      report: '',
      executionLog: [],
      loading: false,
    }),
}))

import axios from 'axios'

const http = axios.create({
  baseURL: (import.meta as any).env?.VITE_API_BASE_URL || 'http://localhost:3000/api',
  timeout: 120_000,
})

// ── 文档一：对话记忆 ──────────────────────────────────
export const chatAPI = {
  sendMemory: (threadId: string, message: string) =>
    http.post('/langgraph/memory-chat', { threadId, message }),
  getHistory: (threadId: string) =>
    http.get(`/langgraph/history/${threadId}`),
  sendSimple: (message: string) =>
    http.post('/langgraph/simple-chat', { message }),
  processArticle: (article: string) =>
    http.post('/langgraph/article', { article }),
}

// ── 文档二：ReAct Agent ───────────────────────────────
export const agentAPI = {
  chat: (threadId: string, message: string) =>
    http.post('/langgraph/react-chat', { threadId, message }),
  route: (input: string) =>
    http.post('/langgraph/route', { input }),
  parallel: (task: string) =>
    http.post('/langgraph/parallel', { task }),
}

// ── 文档三：Multi-Agent ───────────────────────────────
export const workflowAPI = {
  supervisor: (input: string) =>
    http.post('/langgraph/supervisor', { input }),
  pipeline: (topic: string) =>
    http.post('/langgraph/pipeline', { topic }),
  codeReview: (code: string, language = 'TypeScript') =>
    http.post('/langgraph/code-review', { code, language }),
}

// ── 文档四：邮件审批 ──────────────────────────────────
export const approvalAPI = {
  start: (request: string, threadId: string) =>
    http.post('/langgraph/email/start', { request, threadId }),
  approve: (threadId: string) =>
    http.post(`/langgraph/email/${threadId}/approve`),
  reject: (threadId: string) =>
    http.post(`/langgraph/email/${threadId}/reject`),
  modify: (threadId: string, feedback: string) =>
    http.post(`/langgraph/email/${threadId}/modify`, { feedback }),
  getState: (threadId: string) =>
    http.get(`/langgraph/email/${threadId}/state`),
}

// ── 工作流编排 ────────────────────────────────────────
export const workflowEditorAPI = {
  /** 保存（新建）工作流 */
  save: (payload: { name: string; description?: string; nodes: unknown[]; edges: unknown[] }) =>
    http.post('/workflow', payload),
  /** 获取所有工作流 */
  list: () => http.get('/workflow'),
  /** 获取单个工作流 */
  get: (id: string) => http.get(`/workflow/${id}`),
  /** 更新工作流 */
  update: (id: string, payload: { name: string; description?: string; nodes: unknown[]; edges: unknown[] }) =>
    http.put(`/workflow/${id}`, payload),
  /** 删除工作流 */
  remove: (id: string) => http.delete(`/workflow/${id}`),
  /** 执行工作流 */
  run: (id: string, input: string) =>
    http.post(`/workflow/${id}/run`, { input }),
  /** 免存直接执行完整工作流 */
  runDirect: (nodes: unknown[], edges: unknown[], input = '') =>
    http.post('/workflow/run-direct', { nodes, edges, input }),
  /** 单节点测试 */
  testNode: (nodeData: Record<string, unknown>, input = '') =>
    http.post('/workflow/test-node', { nodeData, input }),
}

// ── 文档五：技术调研 ──────────────────────────────────
export const researchAPI = {
  start: (question: string, threadId: string) =>
    http.post('/langgraph/research/start', { question, threadId }),
  approve: (threadId: string) =>
    http.post(`/langgraph/research/${threadId}/approve`),
  revise: (threadId: string, feedback: string) =>
    http.post(`/langgraph/research/${threadId}/revise`, { feedback }),
  reject: (threadId: string) =>
    http.post(`/langgraph/research/${threadId}/reject`),
  getState: (threadId: string) =>
    http.get(`/langgraph/research/${threadId}/state`),
}

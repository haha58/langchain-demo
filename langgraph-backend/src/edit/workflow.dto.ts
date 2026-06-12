// ─────────────────────────────── 节点数据 ────────────────────────────────────

export interface WFNodeData {
  nodeType: 'start' | 'end' | 'condition' | 'llm' | 'agent' | 'knowledge' | 'http' | 'code'
  label: string
  desc?: string

  // llm
  model?: string
  temperature?: number
  systemPrompt?: string

  // agent
  goal?: string
  maxIter?: number

  // http
  method?: string
  url?: string
  headers?: Record<string, string>
  body?: string

  // condition
  condition?: string

  // code
  lang?: 'python' | 'javascript'
  code?: string

  // knowledge
  knowledgeBase?: string
  topK?: number
}

export interface WFNode {
  id: string
  type: string          // 'workflow'
  position: { x: number; y: number }
  data: WFNodeData
}

export interface WFEdge {
  id: string
  source: string
  target: string
  sourceHandle?: string // 'default' | 'else'（条件节点）
  style?: Record<string, unknown>
  markerEnd?: unknown
  animated?: boolean
}

// ─────────────────────────────── 工作流实体 ──────────────────────────────────

export interface Workflow {
  id: string
  name: string
  description?: string
  nodes: WFNode[]
  edges: WFEdge[]
  createdAt: string
  updatedAt: string
}

// ─────────────────────────────── 请求 DTO ────────────────────────────────────

export class SaveWorkflowDto {
  name!: string
  description?: string
  nodes!: WFNode[]
  edges!: WFEdge[]
}

export class RunWorkflowDto {
  input!: string
}

export class RunDirectDto {
  nodes!: WFNode[]
  edges!: WFEdge[]
  input?: string
}

export class TestNodeDto {
  /** 节点完整配置（从前端节点 data 字段传入） */
  nodeData!: WFNodeData
  /** 模拟输入，作为节点的上游输出 */
  input?: string
}

// ─────────────────────────────── 响应 DTO ────────────────────────────────────

export interface RunResult {
  workflowId: string
  input: string
  output: string
  logs: string[]
  nodeResults: Record<string, unknown>
  executionTime: string
}

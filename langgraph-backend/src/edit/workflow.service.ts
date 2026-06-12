import { Injectable, NotFoundException } from '@nestjs/common'
import { ChatOllama } from '@langchain/ollama'
import { HumanMessage, SystemMessage } from '@langchain/core/messages'
import { StateGraph, START, END, Annotation } from '@langchain/langgraph'
import { config } from '../config'
import {
  Workflow,
  WFNode,
  WFEdge,
  WFNodeData,
  SaveWorkflowDto,
  RunResult,
} from './workflow.dto'

// ─────────────────────────────── 运行时状态 ──────────────────────────────────

const RunState = Annotation.Root({
  input:       Annotation<string>(),
  output:      Annotation<string>({
    value:   (_, curr) => curr ?? '',
    default: () => '',
  }),
  logs:        Annotation<string[]>({
    value:   (prev, curr) => [...prev, ...curr],
    default: () => [],
  }),
  nodeResults: Annotation<Record<string, unknown>>({
    value:   (prev, curr) => ({ ...prev, ...curr }),
    default: () => ({}),
  }),
  // 条件节点写入 'true'|'false' 字符串，供 addConditionalEdges 路由
  condBranch: Annotation<string>({
    value:   (_, curr) => curr ?? 'false',
    default: () => 'false',
  }),
})

// ─────────────────────────────── Service ─────────────────────────────────────

@Injectable()
export class WorkflowService {
  /** 内存存储，生产可替换为数据库 */
  private readonly store = new Map<string, Workflow>()

  // ── CRUD ──────────────────────────────────────────────────────────────────

  create(dto: SaveWorkflowDto): Workflow {
    const now = new Date().toISOString()
    const workflow: Workflow = {
      id:          crypto.randomUUID(),
      name:        dto.name,
      description: dto.description,
      nodes:       dto.nodes,
      edges:       dto.edges,
      createdAt:   now,
      updatedAt:   now,
    }
    this.store.set(workflow.id, workflow)
    return workflow
  }

  findAll(): Workflow[] {
    return [...this.store.values()].sort(
      (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
    )
  }

  findOne(id: string): Workflow {
    const wf = this.store.get(id)
    if (!wf) throw new NotFoundException(`工作流 ${id} 不存在`)
    return wf
  }

  update(id: string, dto: SaveWorkflowDto): Workflow {
    const existing = this.findOne(id)
    const updated: Workflow = {
      ...existing,
      name:        dto.name,
      description: dto.description,
      nodes:       dto.nodes,
      edges:       dto.edges,
      updatedAt:   new Date().toISOString(),
    }
    this.store.set(id, updated)
    return updated
  }

  remove(id: string): void {
    if (!this.store.has(id)) throw new NotFoundException(`工作流 ${id} 不存在`)
    this.store.delete(id)
  }

  // ── 已保存工作流执行 ──────────────────────────────────────────────────────

  async run(id: string, input: string): Promise<RunResult> {
    const wf = this.findOne(id)
    const t0 = Date.now()
    const result = await this.executeGraph(wf.nodes, wf.edges, input, wf.name)
    return {
      workflowId:    id,
      input,
      output:        result.output || result.input,
      logs:          result.logs as string[],
      nodeResults:   result.nodeResults as Record<string, unknown>,
      executionTime: `${Date.now() - t0}ms`,
    }
  }

  // ── 免存直接执行（传入 nodes + edges）────────────────────────────────────

  async runDirect(nodes: WFNode[], edges: WFEdge[], input = ''): Promise<RunResult> {
    const t0 = Date.now()
    const result = await this.executeGraph(nodes, edges, input, '临时工作流')
    return {
      workflowId:    'direct',
      input,
      output:        result.output || result.input,
      logs:          result.logs as string[],
      nodeResults:   result.nodeResults as Record<string, unknown>,
      executionTime: `${Date.now() - t0}ms`,
    }
  }

  // ── 单节点测试 ────────────────────────────────────────────────────────────

  async testNode(nodeData: WFNodeData, input = ''): Promise<{
    input: string
    output: string
    logs: string[]
    detail: unknown
    executionTime: string
    httpStatus?: number
    httpHeaders?: Record<string, string>
  }> {
    const t0  = Date.now()
    const llm = this.buildLLM()

    const fakeState: typeof RunState.State = {
      input,
      output:     input,
      logs:       [],
      nodeResults: {},
      condBranch: 'false',
    }

    const handler = this.makeHandler(nodeData, llm)
    const patch   = await handler(fakeState)

    // HTTP 节点：额外获取 status + headers
    let httpStatus: number | undefined
    let httpHeaders: Record<string, string> | undefined

    if (nodeData.nodeType === 'http' && nodeData.url) {
      try {
        const method    = (nodeData.method ?? 'GET').toUpperCase()
        const fetchOpts: RequestInit = {
          method,
          headers: { 'Content-Type': 'application/json', ...(nodeData.headers ?? {}) },
        }
        if (method !== 'GET' && nodeData.body) fetchOpts.body = nodeData.body
        const resp  = await fetch(nodeData.url, fetchOpts)
        httpStatus  = resp.status
        httpHeaders = {}
        resp.headers.forEach((v, k) => { httpHeaders![k] = v })
      } catch { /* 已在 makeHandler 中记录 */ }
    }

    const nr     = patch.nodeResults as Record<string, unknown> | undefined
    const detail = nr ? Object.values(nr)[0] : null

    return {
      input,
      output:        (patch.output as string) ?? input,
      logs:          (patch.logs as string[]) ?? [],
      detail,
      executionTime: `${Date.now() - t0}ms`,
      ...(httpStatus  !== undefined ? { httpStatus }  : {}),
      ...(httpHeaders !== undefined ? { httpHeaders } : {}),
    }
  }

  // ─────────────────────────────── 核心执行引擎（私有）────────────────────────

  private async executeGraph(
    nodes:  WFNode[],
    edges:  WFEdge[],
    input:  string,
    name = '工作流',
  ) {
    const adj     = this.buildAdj(edges)
    const nodeMap = new Map<string, WFNode>(nodes.map(n => [n.id, n]))

    const startNode = nodes.find(n => n.data.nodeType === 'start')
    if (!startNode) throw new Error('工作流缺少【开始】节点')

    const llm = this.buildLLM()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const graph: any = new StateGraph(RunState)

    // 注册所有非 start / end 节点
    for (const node of nodes) {
      const nt = node.data.nodeType
      if (nt === 'start' || nt === 'end') continue
      graph.addNode(node.id, this.makeHandler(node.data, llm))
    }

    // 连接 START → 第一个真实节点
    const firstEdge = adj.get(startNode.id)?.[0]
    if (!firstEdge) throw new Error('开始节点没有连接任何后续节点')

    const firstNode = nodeMap.get(firstEdge.target)!
    if (firstNode.data.nodeType === 'end') {
      graph.addNode('__passthrough__', async (state: typeof RunState.State) => ({
        output: state.input,
        logs:   ['✅ 直通节点（start→end）'],
      }))
      graph.addEdge(START, '__passthrough__')
      graph.addEdge('__passthrough__', END)
    } else {
      graph.addEdge(START, firstEdge.target)
      this.connectEdges(graph, adj, nodeMap, firstEdge.target, new Set())
    }

    const compiled = graph.compile()
    console.log(`\n${'─'.repeat(50)}`)
    console.log(`▶ 开始执行工作流：${name}，输入：${input || '（空）'}`)

    return compiled.invoke({
      input,
      logs: [`▶ 开始执行工作流：${name}`],
    })
  }

  // ─────────────────────────────── 私有工具方法 ────────────────────────────────

  private buildLLM() {
    return new ChatOllama({
      model:       config.langGraph.model,
      temperature: config.langGraph.temperature,
      baseUrl:     config.langGraph.baseURL,
      think:       false,
      numPredict:  512,
    })
  }

  private buildAdj(edges: WFEdge[]): Map<string, { target: string; handle: string }[]> {
    const adj = new Map<string, { target: string; handle: string }[]>()
    for (const e of edges) {
      if (!adj.has(e.source)) adj.set(e.source, [])
      adj.get(e.source)!.push({ target: e.target, handle: e.sourceHandle ?? 'default' })
    }
    return adj
  }

  /** 递归将节点间的边加入 LangGraph */
  private connectEdges(
    graph:   any,
    adj:     Map<string, { target: string; handle: string }[]>,
    nodeMap: Map<string, WFNode>,
    currentId: string,
    visited:   Set<string>,
  ) {
    if (visited.has(currentId)) return
    visited.add(currentId)

    const nexts = adj.get(currentId) ?? []
    const node  = nodeMap.get(currentId)!

    if (node.data.nodeType === 'condition' && nexts.length > 0) {
      const defaultNext = nexts.find(n => n.handle === 'default')
      const elseNext    = nexts.find(n => n.handle === 'else')

      const resolveTarget = (next?: { target: string }) => {
        if (!next) return END
        const t = nodeMap.get(next.target)
        return (!t || t.data.nodeType === 'end') ? END : next.target
      }

      // 路由函数返回字符串 'true' | 'false'，与 map key 完全匹配
      graph.addConditionalEdges(
        currentId,
        (state: typeof RunState.State) => state.condBranch,
        {
          true:  resolveTarget(defaultNext),
          false: resolveTarget(elseNext),
        },
      )

      if (defaultNext && nodeMap.get(defaultNext.target)?.data.nodeType !== 'end') {
        this.connectEdges(graph, adj, nodeMap, defaultNext.target, visited)
      }
      if (elseNext && nodeMap.get(elseNext.target)?.data.nodeType !== 'end') {
        this.connectEdges(graph, adj, nodeMap, elseNext.target, visited)
      }
    } else {
      for (const next of nexts) {
        const nextNode = nodeMap.get(next.target)!
        if (nextNode.data.nodeType === 'end') {
          graph.addEdge(currentId, END)
        } else {
          graph.addEdge(currentId, next.target)
          this.connectEdges(graph, adj, nodeMap, next.target, visited)
        }
      }
      if (nexts.length === 0) graph.addEdge(currentId, END)
    }
  }

  /** 根据节点配置返回 LangGraph 节点处理函数 */
  private makeHandler(data: WFNodeData, llm: ChatOllama) {
    return async (state: typeof RunState.State): Promise<Partial<typeof RunState.State>> => {
      const label = data.label || data.nodeType
      console.log(`⚙️  [workflow] 执行节点: ${label} (${data.nodeType})`)

      switch (data.nodeType) {

        // ── LLM 节点 ──────────────────────────────────────────────────────
        case 'llm': {
          const messages: Array<SystemMessage | HumanMessage> = []
          if (data.systemPrompt) messages.push(new SystemMessage(data.systemPrompt))
          messages.push(new HumanMessage(state.output || state.input))

          const res = await llm.invoke(messages)
          const out = res.content as string
          return {
            output:      out,
            logs:        [`✅ [${label}] LLM 响应完成，模型：${data.model ?? config.langGraph.model}`],
            nodeResults: { [label]: { model: data.model, output: out } },
          }
        }

        // ── Agent 节点 ──────────────────────────────────────────────────
        case 'agent': {
          const maxIter = data.maxIter ?? 3
          let context   = state.output || state.input
          let agentLog  = ''

          for (let i = 1; i <= maxIter; i++) {
            const res = await llm.invoke([
              new SystemMessage(`你是一个自主规划的 Agent。目标：${data.goal ?? '完成用户请求'}`),
              new HumanMessage(`当前上下文：${context}\n这是第 ${i}/${maxIter} 次迭代，请推进目标。`),
            ])
            context  = res.content as string
            agentLog += `\n[迭代 ${i}] ${context.slice(0, 80)}...`
          }
          return {
            output:      context,
            logs:        [`✅ [${label}] Agent 完成，共 ${maxIter} 次迭代`],
            nodeResults: { [label]: { goal: data.goal, iterations: maxIter, log: agentLog } },
          }
        }

        // ── 知识库节点 ──────────────────────────────────────────────────
        case 'knowledge': {
          const query    = state.output || state.input
          const mockDocs = [
            `【知识库片段 1】与"${query}"相关的文档内容摘要...`,
            `【知识库片段 2】补充说明内容...`,
          ].slice(0, data.topK ?? 2)
          return {
            output:      `已检索到以下内容：\n${mockDocs.join('\n')}`,
            logs:        [`✅ [${label}] 知识库检索完成，topK=${data.topK ?? 2}`],
            nodeResults: { [label]: { query, docs: mockDocs } },
          }
        }

        // ── HTTP 节点 ───────────────────────────────────────────────────
        case 'http': {
          const method = (data.method ?? 'GET').toUpperCase()
          const url    = data.url ?? ''

          if (!url) {
            return {
              logs:        [`⚠️  [${label}] HTTP 节点未配置 URL，跳过`],
              nodeResults: { [label]: { skipped: true } },
            }
          }

          try {
            const fetchOpts: RequestInit = {
              method,
              headers: { 'Content-Type': 'application/json', ...(data.headers ?? {}) },
            }
            if (method !== 'GET' && data.body) fetchOpts.body = data.body

            const resp   = await fetch(url, fetchOpts)
            const text   = await resp.text()
            let   parsed: unknown = text
            try { parsed = JSON.parse(text) } catch { /* keep text */ }

            // output 统一为字符串（JSON 序列化），供下游节点用 JSON.parse 解析
            const outputStr = typeof parsed === 'string' ? parsed : JSON.stringify(parsed)
            return {
              output:      outputStr,
              logs:        [`✅ [${label}] HTTP ${method} ${url} → ${resp.status}`],
              nodeResults: { [label]: { status: resp.status, body: parsed } },
            }
          } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : String(err)
            return {
              output:      '',
              logs:        [`❌ [${label}] HTTP 请求失败：${msg}`],
              nodeResults: { [label]: { error: msg } },
            }
          }
        }

        // ── 代码节点 ────────────────────────────────────────────────────
        case 'code': {
          const lang = data.lang ?? 'javascript'
          let   out  = ''

          if (lang === 'javascript') {
            try {
              const fn  = new Function('inputs', data.code ?? 'return inputs')
              const ret = fn({ input: state.input, output: state.output })
              out = typeof ret === 'object' ? JSON.stringify(ret, null, 2) : String(ret ?? '')
            } catch (err: unknown) {
              out = `执行错误：${err instanceof Error ? err.message : String(err)}`
            }
          } else {
            out = `[Python 代码已提交，生产环境需接入 Python Sandbox]\n\`\`\`python\n${data.code}\n\`\`\``
          }
          return {
            output:      out,
            logs:        [`✅ [${label}] ${lang} 代码执行完成`],
            nodeResults: { [label]: { lang, output: out } },
          }
        }

        // ── 条件节点 ────────────────────────────────────────────────────
        case 'condition': {
          const expr = data.condition ?? 'false'
          let   condBool = false
          try {
            // output = 上游节点输出的字符串，input = 工作流原始输入
            const fn = new Function('output', 'input', `return !!(${expr})`)
            condBool = fn(state.output, state.input)
          } catch { condBool = false }

          const condBranch = condBool ? 'true' : 'false'
          return {
            condBranch,
            logs:        [`✅ [${label}] 条件判断：${expr} → ${condBranch}`],
            nodeResults: { [label]: { expr, branch: condBranch } },
          }
        }

        default:
          return { logs: [`⚠️  [${label}] 未知节点类型 ${data.nodeType}，跳过`] }
      }
    }
  }
}

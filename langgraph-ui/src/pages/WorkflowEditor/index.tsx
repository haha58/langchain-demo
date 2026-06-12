import { useCallback, useRef, useState } from 'react'
import { workflowEditorAPI } from '../../api'
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  MarkerType,
  useNodesState,
  useEdgesState,
  addEdge,
  Position,
  Handle,
  type Node,
  type Edge,
  type Connection,
  type NodeProps,
  Panel,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import './WorkflowEditor.css'
import {
  Button,
  Input,
  Select,
  Slider,
  Tooltip,
  Badge,
  Tag,
  Divider,
  Spin,
  Drawer,
  message,
} from 'antd'
import {
  PlayCircleOutlined,
  DeleteOutlined,
  ClearOutlined,
  SaveOutlined,
  PlusOutlined,
  RobotOutlined,
  ThunderboltOutlined,
  BranchesOutlined,
  ApiOutlined,
  DatabaseOutlined,
  CodeOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  SendOutlined,
} from '@ant-design/icons'
import './WorkflowEditor.css'

// ─────────────────────────────── 节点类型定义 ────────────────────────────────
const NODE_PALETTE = [
  {
    group: '流程控制',
    items: [
      { type: 'start',     label: '开始',       icon: <CheckCircleOutlined />,  color: '#52c41a', desc: '流程入口' },
      { type: 'end',       label: '结束',       icon: <CloseCircleOutlined />,  color: '#ff4d4f', desc: '流程出口' },
      { type: 'condition', label: '条件分支',   icon: <BranchesOutlined />,     color: '#fa8c16', desc: '根据条件选择路径' },
    ],
  },
  {
    group: 'AI 能力',
    items: [
      { type: 'llm',       label: 'LLM',        icon: <RobotOutlined />,        color: '#1677ff', desc: '调用大语言模型' },
      { type: 'agent',     label: 'Agent',      icon: <ThunderboltOutlined />,  color: '#722ed1', desc: '自主规划并执行任务' },
      { type: 'knowledge', label: '知识库',     icon: <DatabaseOutlined />,     color: '#13c2c2', desc: '检索知识库内容' },
    ],
  },
  {
    group: '工具集成',
    items: [
      { type: 'http',   label: 'HTTP 请求', icon: <ApiOutlined />,   color: '#eb2f96', desc: '调用外部 API' },
      { type: 'code',   label: '代码执行',  icon: <CodeOutlined />,  color: '#595959', desc: '运行 Python/JS 代码' },
    ],
  },
]

const PALETTE_MAP: Record<string, { label: string; color: string; icon: React.ReactNode; desc: string }> =
  Object.fromEntries(
    NODE_PALETTE.flatMap(g => g.items).map(i => [i.type, i as { label: string; color: string; icon: React.ReactNode; desc: string }])
  )

// ─────────────────────────────── 自定义节点渲染 ──────────────────────────────
type WFNodeData = { nodeType: string; label: string; desc?: string; running?: boolean; [key: string]: unknown }

function WorkflowNode({ data: rawData, selected }: NodeProps) {
  const data    = rawData as WFNodeData
  const cfg     = PALETTE_MAP[data.nodeType] ?? { label: '节点', color: '#d9d9d9', icon: null as React.ReactNode }
  const isStart = data.nodeType === 'start'
  const isEnd   = data.nodeType === 'end'
  const isCond  = data.nodeType === 'condition'

  return (
    <div
      className={`wf-node${selected ? ' wf-node--selected' : ''}`}
      style={{ '--node-color': cfg.color } as React.CSSProperties}
    >
      {/* 目标 handle（输入） - 开始节点不需要 */}
      {!isStart && (
        <Handle
          type="target"
          position={Position.Left}
          className="wf-handle wf-handle--target"
        />
      )}

      {/* 节点头部 */}
      <div className="wf-node__header">
        <span className="wf-node__icon">{cfg.icon}</span>
        <span className="wf-node__title">{(data.label as string) || cfg.label}</span>
        {!!data.running && <span className="wf-node__running-dot" />}
      </div>

      {/* 节点描述 */}
      {data.desc && (
        <div className="wf-node__desc">{data.desc as string}</div>
      )}

      {/* 源 handle（输出）- 结束节点不需要 */}
      {!isEnd && (
        <Handle
          type="source"
          position={Position.Right}
          id="default"
          className="wf-handle wf-handle--source"
        />
      )}

      {/* 条件节点有第二个输出 */}
      {isCond && (
        <Handle
          type="source"
          position={Position.Bottom}
          id="else"
          className="wf-handle wf-handle--source wf-handle--bottom"
          style={{ left: '50%', bottom: -6, top: 'auto' }}
        />
      )}
    </div>
  )
}

const nodeTypes = { workflow: WorkflowNode }

// ─────────────────────────────── 初始画布 ────────────────────────────────────
// 节点 ID 从 7 开始（初始画布已占用 1-7）
let nodeId = 7

/**
 * 默认工作流拓扑：
 *
 *   开始 → HTTP请求 → 条件分支 ──[右/true]──→ LLM调用 → 结束A
 *                              └─[底/false]──→ 代码执行 → 结束B
 */
const initNodes: Node[] = [
  // ① 开始
  {
    id: '1',
    type: 'workflow',
    position: { x: 40, y: 220 },
    data: { nodeType: 'start', label: '开始', desc: '流程入口' },
  },
  // ② HTTP 请求
  {
    id: '2',
    type: 'workflow',
    position: { x: 230, y: 220 },
    data: {
      nodeType: 'http',
      label:    'HTTP 请求',
      desc:     '调用 /ping 接口，随机返回 ping 或 pong',
      method:   'GET',
      url:      'http://localhost:3000/api/langgraph/ping',
    },
  },
  // ③ 条件分支
  {
    id: '3',
    type: 'workflow',
    position: { x: 450, y: 220 },
    data: {
      nodeType:  'condition',
      label:     '条件分支',
      // output 是 HTTP 节点返回的 JSON 字符串，如 '{"message":"ping"}'
      // true（右）→ LLM 调用；false（底）→ 代码执行
      condition: 'JSON.parse(output).message === "ping"',
      desc:      'message=ping → LLM；message=pong → 代码执行',
    },
  },
  // ④ LLM 调用（true 分支 → 右侧）
  {
    id: '4',
    type: 'workflow',
    position: { x: 680, y: 80 },
    data: {
      nodeType:     'llm',
      label:        'LLM 调用',
      desc:         '接收 HTTP 响应，交给大模型分析',
      model:        'qwen3.5:0.8b',
      temperature:  0.7,
      // state.output 此时是 HTTP 节点的 JSON 字符串，下面提示词告诉模型如何使用
      systemPrompt: '你是专业的 AI 助手。用户会给你一段接口返回的 JSON 数据，请用中文简洁解释这段数据的含义。',
    },
  },
  // ⑤ 代码执行（false 分支 → 底部）
  {
    id: '5',
    type: 'workflow',
    position: { x: 680, y: 370 },
    data: {
      nodeType: 'code',
      label:    '代码执行',
      desc:     '接收 HTTP 响应，用 JS 代码处理后输出',
      lang:     'javascript',
      // inputs.output 是 HTTP 节点输出的 JSON 字符串
      code:     `const resp = JSON.parse(inputs.output || '{}')\nconst msg  = resp.message || '未知'\nreturn { result: '代码处理结果：接口返回了 "' + msg + '"，已记录。' }`,
    },
  },
  // ⑥ 结束A（LLM 之后）
  {
    id: '6',
    type: 'workflow',
    position: { x: 920, y: 80 },
    data: { nodeType: 'end', label: '结束（LLM）', desc: '输出大模型回答' },
  },
  // ⑦ 结束B（代码执行之后）
  {
    id: '7',
    type: 'workflow',
    position: { x: 920, y: 370 },
    data: { nodeType: 'end', label: '结束（代码）', desc: '输出代码执行结果' },
  },
]

// 边颜色约定：主流程蓝色、true分支绿色、false分支橙色
const BLUE   = '#1677ff'
const GREEN  = '#52c41a'
const ORANGE = '#fa8c16'

const initEdges: Edge[] = [
  // 开始 → HTTP
  {
    id: 'e1-2',
    source: '1', target: '2',
    markerEnd: { type: MarkerType.ArrowClosed, color: BLUE },
    style: { stroke: BLUE, strokeWidth: 2 },
    animated: true,
  },
  // HTTP → 条件分支
  {
    id: 'e2-3',
    source: '2', target: '3',
    markerEnd: { type: MarkerType.ArrowClosed, color: BLUE },
    style: { stroke: BLUE, strokeWidth: 2 },
  },
  // 条件分支 → LLM（右侧 handle = default，条件为 true）
  {
    id: 'e3-4',
    source: '3', target: '4',
    sourceHandle: 'default',
    label: 'true',
    labelStyle: { fill: GREEN, fontWeight: 600, fontSize: 11 },
    labelBgStyle: { fill: '#f6ffed' },
    markerEnd: { type: MarkerType.ArrowClosed, color: GREEN },
    style: { stroke: GREEN, strokeWidth: 2 },
  },
  // 条件分支 → 代码执行（底部 handle = else，条件为 false）
  {
    id: 'e3-5',
    source: '3', target: '5',
    sourceHandle: 'else',
    label: 'false',
    labelStyle: { fill: ORANGE, fontWeight: 600, fontSize: 11 },
    labelBgStyle: { fill: '#fff7e6' },
    markerEnd: { type: MarkerType.ArrowClosed, color: ORANGE },
    style: { stroke: ORANGE, strokeWidth: 2 },
  },
  // LLM → 结束A
  {
    id: 'e4-6',
    source: '4', target: '6',
    markerEnd: { type: MarkerType.ArrowClosed, color: GREEN },
    style: { stroke: GREEN, strokeWidth: 2 },
  },
  // 代码执行 → 结束B
  {
    id: 'e5-7',
    source: '5', target: '7',
    markerEnd: { type: MarkerType.ArrowClosed, color: ORANGE },
    style: { stroke: ORANGE, strokeWidth: 2 },
  },
]

// ─────────────────────────────── HTTP 节点测试面板 ───────────────────────────
type TestResult = {
  httpStatus?: number
  output: string
  logs: string[]
  executionTime: string
  httpHeaders?: Record<string, string>
}

function HttpNodeConfig({
  d,
  set,
}: {
  d: Record<string, unknown>
  set: (key: string, val: unknown) => void
}) {
  const [testInput, setTestInput]   = useState('')
  const [testing, setTesting]       = useState(false)
  const [result, setResult]         = useState<TestResult | null>(null)

  const method  = (d.method as string) || 'GET'
  const showBody = ['POST', 'PUT', 'PATCH'].includes(method)

  const handleTest = async () => {
    if (!d.url) { message.warning('请先填写 URL'); return }
    setTesting(true)
    setResult(null)
    try {
      let parsedHeaders: Record<string, string> | undefined
      if (d.headersJson) {
        try { parsedHeaders = JSON.parse(d.headersJson as string) }
        catch { message.error('Headers JSON 格式错误'); setTesting(false); return }
      }
      const nodeData = {
        nodeType: 'http',
        label:    (d.label as string) || 'HTTP 请求',
        method,
        url:      d.url as string,
        headers:  parsedHeaders,
        body:     d.body as string | undefined,
      }
      const res = await workflowEditorAPI.testNode(nodeData as Record<string, unknown>, testInput)
      setResult(res.data as TestResult)
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      message.error(`请求失败：${msg}`)
    } finally {
      setTesting(false)
    }
  }

  const statusColor = (s?: number) => {
    if (!s) return '#999'
    if (s < 300) return '#52c41a'
    if (s < 400) return '#fa8c16'
    return '#ff4d4f'
  }

  return (
    <>
      <Divider style={{ margin: '10px 0', fontSize: 12 }}>HTTP 配置</Divider>

      <div className="wf-field">
        <label>Method</label>
        <Select
          value={method}
          onChange={v => set('method', v)}
          size="small"
          style={{ width: '100%' }}
          options={['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].map(m => ({ label: m, value: m }))}
        />
      </div>

      <div className="wf-field">
        <label>URL</label>
        <Input
          value={d.url as string}
          onChange={e => set('url', e.target.value)}
          placeholder="https://api.example.com/endpoint"
          size="small"
        />
      </div>

      <div className="wf-field">
        <label>Headers <span style={{ color: '#bbb', fontWeight: 400 }}>(JSON)</span></label>
        <Input.TextArea
          value={d.headersJson as string}
          onChange={e => set('headersJson', e.target.value)}
          placeholder={'{\n  "Authorization": "Bearer token"\n}'}
          rows={3}
          size="small"
          style={{ fontFamily: 'monospace', fontSize: 11 }}
        />
      </div>

      {showBody && (
        <div className="wf-field">
          <label>Request Body <span style={{ color: '#bbb', fontWeight: 400 }}>(JSON / text)</span></label>
          <Input.TextArea
            value={d.body as string}
            onChange={e => set('body', e.target.value)}
            placeholder={'{\n  "key": "value"\n}'}
            rows={4}
            size="small"
            style={{ fontFamily: 'monospace', fontSize: 11 }}
          />
        </div>
      )}

      {/* 测试区 */}
      <Divider style={{ margin: '10px 0', fontSize: 12 }}>节点测试</Divider>

      <div className="wf-field">
        <label>模拟输入（传给节点的上游输出）</label>
        <Input.TextArea
          value={testInput}
          onChange={e => setTestInput(e.target.value)}
          placeholder="可留空，直接发送 HTTP 请求"
          rows={2}
          size="small"
        />
      </div>

      <Button
        type="primary"
        size="small"
        icon={<SendOutlined />}
        loading={testing}
        onClick={handleTest}
        block
        style={{ marginBottom: 10 }}
      >
        发送测试请求
      </Button>

      {testing && (
        <div style={{ textAlign: 'center', padding: '12px 0' }}>
          <Spin size="small" /> <span style={{ color: '#999', fontSize: 12, marginLeft: 6 }}>请求中…</span>
        </div>
      )}

      {result && !testing && (
        <div className="wf-http-result">
          {/* 状态行 */}
          <div className="wf-http-result__status">
            <span style={{ color: statusColor(result.httpStatus), fontWeight: 700 }}>
              {result.httpStatus ?? '—'}
            </span>
            <span style={{ color: '#999', fontSize: 11, marginLeft: 6 }}>{result.executionTime}</span>
          </div>

          {/* 响应体 */}
          <div className="wf-http-result__label">Response Body</div>
          <pre className="wf-http-result__body">{result.output}</pre>

          {/* 响应 Headers */}
          {result.httpHeaders && Object.keys(result.httpHeaders).length > 0 && (
            <>
              <div className="wf-http-result__label">Response Headers</div>
              <pre className="wf-http-result__body">
                {JSON.stringify(result.httpHeaders, null, 2)}
              </pre>
            </>
          )}

          {/* 日志 */}
          {result.logs?.length > 0 && (
            <>
              <div className="wf-http-result__label">日志</div>
              {result.logs.map((l, i) => (
                <div key={i} style={{ fontSize: 11, color: '#888', lineHeight: 1.6 }}>{l}</div>
              ))}
            </>
          )}
        </div>
      )}
    </>
  )
}

// ─────────────────────────────── 属性面板 ────────────────────────────────────
function ConfigPanel({
  node,
  onChange,
}: {
  node: Node | null
  onChange: (id: string, data: Record<string, unknown>) => void
}) {
  if (!node) {
    return (
      <div className="wf-config wf-config--empty">
        <RobotOutlined style={{ fontSize: 32, color: '#d9d9d9' }} />
        <p style={{ color: '#bbb', marginTop: 8, fontSize: 13 }}>点击节点查看属性</p>
      </div>
    )
  }

  const cfg = PALETTE_MAP[node.data.nodeType as string]
  const d   = node.data as Record<string, unknown>

  const set = (key: string, val: unknown) =>
    onChange(node.id, { ...d, [key]: val })

  return (
    <div className="wf-config">
      <div className="wf-config__header" style={{ borderColor: cfg?.color }}>
        <span style={{ color: cfg?.color, marginRight: 6 }}>{cfg?.icon}</span>
        <strong>{(d.label as string) || cfg?.label}</strong>
        <Tag style={{ marginLeft: 'auto' }} color={cfg?.color}>{node.data.nodeType as string}</Tag>
      </div>

      <div className="wf-config__body">
        <div className="wf-field">
          <label>节点名称</label>
          <Input
            value={d.label as string}
            onChange={e => set('label', e.target.value)}
            placeholder="请输入节点名称"
            size="small"
          />
        </div>

        <div className="wf-field">
          <label>节点描述</label>
          <Input.TextArea
            value={d.desc as string}
            onChange={e => set('desc', e.target.value)}
            placeholder="描述此节点的作用"
            rows={2}
            size="small"
          />
        </div>

        {/* LLM 节点特有配置 */}
        {node.data.nodeType === 'llm' && (
          <>
            <Divider style={{ margin: '10px 0', fontSize: 12 }}>模型配置</Divider>
            <div className="wf-field">
              <label>模型</label>
              <Select
                value={(d.model as string) || 'gpt-4o'}
                onChange={v => set('model', v)}
                size="small"
                style={{ width: '100%' }}
                options={[
                  { label: 'GPT-4o',            value: 'gpt-4o' },
                  { label: 'GPT-4o-mini',        value: 'gpt-4o-mini' },
                  { label: 'Claude Sonnet 4',    value: 'claude-sonnet-4' },
                  { label: 'DeepSeek-V3',        value: 'deepseek-v3' },
                  { label: 'Qwen-Max',           value: 'qwen-max' },
                ]}
              />
            </div>
            <div className="wf-field">
              <label>Temperature <span style={{ color: '#bbb' }}>{(d.temperature as number) ?? 0.7}</span></label>
              <Slider
                min={0} max={2} step={0.1}
                value={(d.temperature as number) ?? 0.7}
                onChange={v => set('temperature', v)}
                style={{ margin: '4px 0' }}
              />
            </div>
            <div className="wf-field">
              <label>系统提示词</label>
              <Input.TextArea
                value={d.systemPrompt as string}
                onChange={e => set('systemPrompt', e.target.value)}
                placeholder="你是一个有帮助的 AI 助手..."
                rows={4}
                size="small"
                style={{ fontFamily: 'monospace', fontSize: 12 }}
              />
            </div>
          </>
        )}

        {/* Agent 节点特有配置 */}
        {node.data.nodeType === 'agent' && (
          <>
            <Divider style={{ margin: '10px 0', fontSize: 12 }}>Agent 配置</Divider>
            <div className="wf-field">
              <label>Agent 目标</label>
              <Input.TextArea
                value={d.goal as string}
                onChange={e => set('goal', e.target.value)}
                placeholder="描述 Agent 需要完成的目标..."
                rows={3}
                size="small"
              />
            </div>
            <div className="wf-field">
              <label>最大迭代次数</label>
              <Slider
                min={1} max={20} step={1}
                value={(d.maxIter as number) ?? 5}
                onChange={v => set('maxIter', v)}
              />
            </div>
          </>
        )}

        {/* HTTP 节点特有配置 + 测试面板 */}
        {node.data.nodeType === 'http' && (
          <HttpNodeConfig d={d} set={set} />
        )}

        {/* 条件节点 */}
        {node.data.nodeType === 'condition' && (
          <>
            <Divider style={{ margin: '10px 0', fontSize: 12 }}>条件配置</Divider>
            <div className="wf-field">
              <label>条件表达式</label>
              <Input
                value={d.condition as string}
                onChange={e => set('condition', e.target.value)}
                placeholder='例如：output.score > 0.8'
                size="small"
                style={{ fontFamily: 'monospace' }}
              />
            </div>
            <div style={{ fontSize: 12, color: '#bbb', marginTop: 4 }}>
              右侧输出 → 条件为真 &nbsp;|&nbsp; 底部输出 → 条件为假
            </div>
          </>
        )}

        {/* 代码节点 */}
        {node.data.nodeType === 'code' && (
          <>
            <Divider style={{ margin: '10px 0', fontSize: 12 }}>代码配置</Divider>
            <div className="wf-field">
              <label>语言</label>
              <Select
                value={(d.lang as string) || 'python'}
                onChange={v => set('lang', v)}
                size="small"
                style={{ width: '100%' }}
                options={[
                  { label: 'Python', value: 'python' },
                  { label: 'JavaScript', value: 'javascript' },
                ]}
              />
            </div>
            <div className="wf-field">
              <label>代码</label>
              <Input.TextArea
                value={d.code as string}
                onChange={e => set('code', e.target.value)}
                placeholder={'def main(inputs):\n    return {"output": inputs}'}
                rows={6}
                size="small"
                style={{ fontFamily: 'monospace', fontSize: 12 }}
              />
            </div>
          </>
        )}
      </div>
    </div>
  )
}

// ─────────────────────────────── 主页面 ──────────────────────────────────────
export default function WorkflowEditorPage() {
  const reactFlowWrapper = useRef<HTMLDivElement>(null)
  const [reactFlowInstance, setReactFlowInstance] = useState<any>(null)
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>(initNodes)
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>(initEdges)
  const [selectedNode, setSelectedNode] = useState<Node | null>(null)
  const [msgApi, ctxHolder] = message.useMessage()

  // ── 运行结果状态 ──────────────────────────────────────────────────────────
  const [running,     setRunning]     = useState(false)
  const [runResult,   setRunResult]   = useState<null | {
    output: string
    logs: string[]
    nodeResults: Record<string, unknown>
    executionTime: string
  }>(null)
  const [drawerOpen,  setDrawerOpen]  = useState(false)

  // ── 连线 ──────────────────────────────────────────────────────────────────
  const onConnect = useCallback(
    (connection: Connection) =>
      setEdges(eds =>
        addEdge(
          {
            ...connection,
            markerEnd: { type: MarkerType.ArrowClosed, color: '#1677ff' },
            style: { stroke: '#1677ff', strokeWidth: 2 },
            animated: false,
          } as Edge,
          eds
        )
      ),
    [setEdges]
  )

  // ── 节点选中 ──────────────────────────────────────────────────────────────
  const onNodeClick = useCallback((_: React.MouseEvent, node: Node) => {
    setSelectedNode(node)
  }, [])

  const onPaneClick = useCallback(() => {
    setSelectedNode(null)
  }, [])

  // ── 从侧边栏拖入画布 ──────────────────────────────────────────────────────
  const onDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
  }, [])

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      const nodeType = e.dataTransfer.getData('application/wf-node-type')
      if (!nodeType || !reactFlowInstance) return

      // screenToFlowPosition 直接接收屏幕坐标，不需要减去容器偏移
      const position = reactFlowInstance.screenToFlowPosition({
        x: e.clientX,
        y: e.clientY,
      })

      const cfg = PALETTE_MAP[nodeType]
      const id  = `${++nodeId}`
      const newNode: Node = {
        id,
        type: 'workflow',
        position,
        data: { nodeType, label: cfg?.label ?? nodeType, desc: '' },
      }
      setNodes(nds => [...nds, newNode])
      setSelectedNode(newNode)
    },
    [reactFlowInstance]
  )

  // ── 属性更新 ──────────────────────────────────────────────────────────────
  const onNodeDataChange = useCallback(
    (id: string, data: Record<string, unknown>) => {
      setNodes(nds =>
        nds.map(n => (n.id === id ? { ...n, data } : n))
      )
      setSelectedNode(prev => (prev?.id === id ? { ...prev, data } : prev))
    },
    [setNodes]
  )

  // ── 删除选中节点 ──────────────────────────────────────────────────────────
  const deleteSelected = () => {
    if (!selectedNode) return
    setNodes(nds => nds.filter(n => n.id !== selectedNode.id))
    setEdges(eds =>
      eds.filter(e => e.source !== selectedNode.id && e.target !== selectedNode.id)
    )
    setSelectedNode(null)
  }

  // ── 清空画布 ──────────────────────────────────────────────────────────────
  const clearCanvas = () => {
    setNodes([])
    setEdges([])
    setSelectedNode(null)
    nodeId = 0
  }

  // ── 保存 ─────────────────────────────────────────────────────────────────
  const saveFlow = () => {
    const flow = { nodes, edges }
    console.log('保存的工作流：', flow)
    msgApi.success('工作流已保存（控制台查看 JSON）')
  }

  // ── 运行演示（真实调用后端）──────────────────────────────────────────────
  const runDemo = async () => {
    if (running) return
    setRunning(true)
    setRunResult(null)

    // 所有功能节点亮起 running 动画
    setNodes(nds => nds.map(nd => ({
      ...nd,
      data: { ...nd.data, running: nd.data.nodeType !== 'start' && nd.data.nodeType !== 'end' },
    })))

    try {
      const res = await workflowEditorAPI.runDirect(nodes as unknown[], edges as unknown[], '')
      const data = res.data as {
        output: string
        logs: string[]
        nodeResults: Record<string, unknown>
        executionTime: string
      }
      setRunResult(data)
      setDrawerOpen(true)
      msgApi.success(`流程执行完成（${data.executionTime}）`)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      msgApi.error(`执行失败：${msg}`)
    } finally {
      setRunning(false)
      // 熄灭 running 动画
      setNodes(nds => nds.map(nd => ({ ...nd, data: { ...nd.data, running: false } })))
    }
  }

  return (
    <div className="wf-root">
      {ctxHolder}

      {/* ── 左侧节点库 ── */}
      <aside className="wf-palette">
        <div className="wf-palette__title">节点库</div>
        {NODE_PALETTE.map(group => (
          <div key={group.group} className="wf-palette__group">
            <div className="wf-palette__group-label">{group.group}</div>
            {group.items.map(item => (
              <Tooltip key={item.type} title={item.desc} placement="right">
                <div
                  className="wf-palette__item"
                  draggable
                  onDragStart={e => {
                    e.dataTransfer.setData('application/wf-node-type', item.type)
                    e.dataTransfer.effectAllowed = 'move'
                  }}
                  style={{ '--item-color': item.color } as React.CSSProperties}
                >
                  <span className="wf-palette__item-icon">{item.icon}</span>
                  <span className="wf-palette__item-label">{item.label}</span>
                  <PlusOutlined className="wf-palette__item-plus" />
                </div>
              </Tooltip>
            ))}
          </div>
        ))}
      </aside>

      {/* ── 中央画布 ── */}
      <div className="wf-canvas" ref={reactFlowWrapper}>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onInit={setReactFlowInstance}
          onDrop={onDrop}
          onDragOver={onDragOver}
          onNodeClick={onNodeClick}
          onPaneClick={onPaneClick}
          nodeTypes={nodeTypes}
          fitView
          fitViewOptions={{ padding: 0.25 }}
          proOptions={{ hideAttribution: true }}
          deleteKeyCode="Delete"
          connectionLineStyle={{ stroke: '#1677ff', strokeWidth: 2 }}
          defaultEdgeOptions={{
            markerEnd: { type: MarkerType.ArrowClosed, color: '#1677ff' },
            style: { stroke: '#1677ff', strokeWidth: 2 },
          }}
        >
          <Background color="#e8e8e8" gap={20} />
          <Controls />
          <MiniMap
            nodeColor={n => {
              const t = n.data?.nodeType as string
              return PALETTE_MAP[t]?.color ?? '#d9d9d9'
            }}
            maskColor="rgba(240,240,240,0.6)"
          />

          {/* 工具栏 */}
          <Panel position="top-left" className="wf-toolbar">
            <Badge dot={!!selectedNode} color="red">
              <Button
                size="small"
                danger
                icon={<DeleteOutlined />}
                disabled={!selectedNode}
                onClick={deleteSelected}
              >
                删除节点
              </Button>
            </Badge>
            <Button size="small" icon={<ClearOutlined />} onClick={clearCanvas}>
              清空画布
            </Button>
            <Button size="small" icon={<SaveOutlined />} onClick={saveFlow}>
              保存
            </Button>
            <Button
              size="small"
              type="primary"
              icon={<PlayCircleOutlined />}
              loading={running}
              onClick={runDemo}
            >
              {running ? '执行中…' : '运行演示'}
            </Button>
          </Panel>

          {/* 提示 */}
          <Panel position="top-right" style={{ fontSize: 12, color: '#bbb' }}>
            从左侧拖入节点 · 拖拽连线 · Delete 键删除
          </Panel>
        </ReactFlow>
      </div>

      {/* ── 右侧属性面板 ── */}
      <aside className={`wf-sidebar${selectedNode ? ' wf-sidebar--open' : ''}`}>
        <div className="wf-sidebar__header">节点属性</div>
        <ConfigPanel node={selectedNode} onChange={onNodeDataChange} />
      </aside>

      {/* ── 执行结果 Drawer ── */}
      <Drawer
        title="工作流执行结果"
        placement="bottom"
        height={420}
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        extra={
          <span style={{ fontSize: 12, color: '#999' }}>
            耗时：{runResult?.executionTime}
          </span>
        }
      >
        {runResult && (
          <div className="wf-result">
            {/* 最终输出 */}
            <div className="wf-result__section">
              <div className="wf-result__label">最终输出</div>
              <pre className="wf-result__pre">{runResult.output || '（无输出）'}</pre>
            </div>

            {/* 节点执行详情 */}
            {Object.keys(runResult.nodeResults).length > 0 && (
              <div className="wf-result__section">
                <div className="wf-result__label">节点执行详情</div>
                <pre className="wf-result__pre">
                  {JSON.stringify(runResult.nodeResults, null, 2)}
                </pre>
              </div>
            )}

            {/* 执行日志 */}
            {runResult.logs.length > 0 && (
              <div className="wf-result__section">
                <div className="wf-result__label">执行日志</div>
                <div className="wf-result__logs">
                  {runResult.logs.map((log, i) => (
                    <div key={i} className="wf-result__log-line">{log}</div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </Drawer>
    </div>
  )
}

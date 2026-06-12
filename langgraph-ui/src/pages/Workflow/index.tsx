import { useState } from 'react'
import { Tabs, Input, Button, Card, Tag, List, Space } from 'antd'
import { PlayCircleOutlined, LoadingOutlined } from '@ant-design/icons'
import WorkflowGraph, { GraphNode, GraphEdge } from '../../components/WorkflowGraph'
import { workflowAPI } from '../../api'

// ── Supervisor 图结构 ─────────────────────────────────
const SUPERVISOR_NODES: GraphNode[] = [
  { id: 'start',      label: 'START',      type: 'start', x: 0,   y: 100 },
  { id: 'supervisor', label: 'Supervisor',               x: 200, y: 100 },
  { id: 'researcher', label: 'Researcher',               x: 440, y: 20  },
  { id: 'analyst',    label: 'Analyst',                  x: 440, y: 100 },
  { id: 'writer',     label: 'Writer',                   x: 440, y: 180 },
  { id: 'end',        label: 'END',        type: 'end',  x: 650, y: 100 },
]
const SUPERVISOR_EDGES: GraphEdge[] = [
  { source: 'start',      target: 'supervisor' },
  { source: 'supervisor', target: 'researcher', label: 'researcher' },
  { source: 'supervisor', target: 'analyst',    label: 'analyst' },
  { source: 'supervisor', target: 'writer',     label: 'writer' },
  { source: 'supervisor', target: 'end',        label: 'FINISH' },
  { source: 'researcher', target: 'supervisor', animated: true },
  { source: 'analyst',    target: 'supervisor', animated: true },
  { source: 'writer',     target: 'supervisor', animated: true },
]

// ── 代码审查并行图 ────────────────────────────────────
const CODE_REVIEW_NODES: GraphNode[] = [
  { id: 'start',    label: 'START',    type: 'start', x: 0,   y: 100 },
  { id: 'dispatch', label: 'Dispatch',               x: 180, y: 100 },
  { id: 'security', label: '安全审查',               x: 380, y: 20  },
  { id: 'perf',     label: '性能审查',               x: 380, y: 100 },
  { id: 'style',    label: '规范审查',               x: 380, y: 180 },
  { id: 'report',   label: '生成报告',               x: 580, y: 100 },
  { id: 'end',      label: 'END',      type: 'end',  x: 760, y: 100 },
]
const CODE_REVIEW_EDGES: GraphEdge[] = [
  { source: 'start',    target: 'dispatch' },
  { source: 'dispatch', target: 'security', animated: true, label: 'Send' },
  { source: 'dispatch', target: 'perf',     animated: true, label: 'Send' },
  { source: 'dispatch', target: 'style',    animated: true, label: 'Send' },
  { source: 'security', target: 'report' },
  { source: 'perf',     target: 'report' },
  { source: 'style',    target: 'report' },
  { source: 'report',   target: 'end' },
]

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

export default function WorkflowPage() {
  const [tab,     setTab]     = useState('supervisor')
  const [input,   setInput]   = useState('')
  const [code,    setCode]    = useState('')
  const [running, setRunning] = useState('')
  const [result,  setResult]  = useState<any>(null)
  const [loading, setLoading] = useState(false)

  const animateNodes = async (ids: string[], delay = 700) => {
    for (const id of ids) {
      setRunning(id)
      await sleep(delay)
    }
    setRunning('')
  }

  const runSupervisor = async () => {
    if (!input.trim() || loading) return
    setLoading(true)
    setResult(null)
    animateNodes(
      ['start','supervisor','researcher','supervisor','analyst','supervisor','writer','supervisor','end'],
      800
    )
    try {
      const res = await workflowAPI.supervisor(input)
      setResult(res.data)
    } finally {
      setLoading(false)
    }
  }

  const runCodeReview = async () => {
    if (!code.trim() || loading) return
    setLoading(true)
    setResult(null)
    animateNodes(['start','dispatch','security','perf','style','report','end'], 500)
    try {
      const res = await workflowAPI.codeReview(code)
      setResult(res.data)
    } finally {
      setLoading(false)
    }
  }

  const isCodeReview = tab === 'codereview'
  const graphNodes   = isCodeReview ? CODE_REVIEW_NODES : SUPERVISOR_NODES
  const graphEdges   = isCodeReview ? CODE_REVIEW_EDGES : SUPERVISOR_EDGES

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden' }}>
      {/* 左侧：工作流图 */}
      <div
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          borderRight: '1px solid #f0f0f0',
        }}
      >
        <div
          style={{
            padding: '12px 16px',
            borderBottom: '1px solid #f0f0f0',
            background: '#fafafa',
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            flexShrink: 0,
          }}
        >
          <span style={{ fontWeight: 600, fontSize: 14 }}>工作流图</span>
          {running && (
            <Tag color="processing" icon={<LoadingOutlined spin />}>
              当前节点：{running}
            </Tag>
          )}
        </div>
        <div style={{ flex: 1 }}>
          <WorkflowGraph nodes={graphNodes} edges={graphEdges} running={running} />
        </div>
      </div>

      {/* 右侧：控制面板 */}
      <div style={{ width: 380, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <Tabs
          activeKey={tab}
          onChange={setTab}
          style={{ padding: '0 16px' }}
          items={[
            { key: 'supervisor', label: 'Supervisor 模式' },
            { key: 'codereview', label: '代码审查' },
          ]}
        />

        <div style={{ flex: 1, overflowY: 'auto', padding: '0 16px 16px' }}>
          {!isCodeReview ? (
            <Space direction="vertical" style={{ width: '100%' }} size={12}>
              <Input.TextArea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="输入任务，如：分析国内低代码平台市场现状，给出产品定位建议"
                rows={5}
              />
              <Button
                type="primary"
                block
                loading={loading}
                icon={<PlayCircleOutlined />}
                onClick={runSupervisor}
              >
                运行 Supervisor Agent
              </Button>
            </Space>
          ) : (
            <Space direction="vertical" style={{ width: '100%' }} size={12}>
              <Input.TextArea
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder={`粘贴待审查的代码，例如：\nasync function getUser(id) {\n  const sql = \`SELECT * FROM users WHERE id = \${id}\`\n  return db.query(sql)\n}`}
                rows={9}
                style={{ fontFamily: 'monospace', fontSize: 12 }}
              />
              <Button
                type="primary"
                block
                loading={loading}
                icon={<PlayCircleOutlined />}
                onClick={runCodeReview}
              >
                运行代码审查
              </Button>
            </Space>
          )}

          {result && (
            <Card size="small" style={{ marginTop: 16 }} title="执行结果">
              {!isCodeReview && result.completedAgents && (
                <div style={{ marginBottom: 10 }}>
                  <span style={{ fontSize: 12, color: '#999' }}>调用顺序：</span>
                  {(result.completedAgents as string[]).map((a) => (
                    <Tag key={a} color="blue" style={{ margin: '2px 4px 2px 0' }}>
                      {a}
                    </Tag>
                  ))}
                  <div
                    style={{
                      marginTop: 8,
                      fontSize: 13,
                      whiteSpace: 'pre-wrap',
                      color: '#333',
                      lineHeight: 1.6,
                      maxHeight: 200,
                      overflowY: 'auto',
                    }}
                  >
                    {result.finalReport}
                  </div>
                </div>
              )}
              {isCodeReview && result.reviewResults && (
                <List
                  size="small"
                  dataSource={result.reviewResults as any[]}
                  renderItem={(item) => (
                    <List.Item>
                      <Space>
                        <Tag
                          color={
                            item.score < 5
                              ? 'error'
                              : item.score < 7
                              ? 'warning'
                              : 'success'
                          }
                        >
                          {item.aspect}
                        </Tag>
                        <span style={{ fontSize: 13 }}>{item.score}/10</span>
                      </Space>
                    </List.Item>
                  )}
                />
              )}
              {result.totalTime && (
                <div style={{ marginTop: 8, fontSize: 12, color: '#bbb' }}>
                  耗时：{result.totalTime}
                </div>
              )}
            </Card>
          )}
        </div>
      </div>
    </div>
  )
}

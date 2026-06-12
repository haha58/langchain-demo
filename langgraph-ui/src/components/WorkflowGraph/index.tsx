import { useEffect, useCallback } from 'react'
import {
  ReactFlow,
  Background,
  Controls,
  MarkerType,
  useNodesState,
  useEdgesState,
  addEdge,
  Position,
  Handle,
  type Node,
  type Edge,
  type Connection,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import './WorkflowGraph.css'

const STATUS_COLORS = {
  idle:    { bg: '#f5f5f5', border: '#d9d9d9', text: '#595959' },
  running: { bg: '#e6f4ff', border: '#1677ff', text: '#1677ff' },
  done:    { bg: '#f6ffed', border: '#52c41a', text: '#389e0d' },
  error:   { bg: '#fff2f0', border: '#ff4d4f', text: '#cf1322' },
  paused:  { bg: '#fffbe6', border: '#faad14', text: '#d48806' },
}

type NodeStatus = keyof typeof STATUS_COLORS

export interface GraphNode {
  id: string
  label: string
  type?: 'start' | 'end' | 'default' | 'decision'
  status?: NodeStatus
  x?: number
  y?: number
}

export interface GraphEdge {
  source: string
  target: string
  label?: string
  animated?: boolean
}

interface WorkflowGraphProps {
  nodes: GraphNode[]
  edges: GraphEdge[]
  running?: string
}

function CustomNode({ data }: { data: any }) {
  const colors = STATUS_COLORS[data.status as NodeStatus] || STATUS_COLORS.idle

  return (
    <>
      <Handle
        type="target"
        position={Position.Left}
        style={{
          width: 10,
          height: 10,
          background: colors.border,
          border: '2px solid #fff',
          boxShadow: '0 0 0 1px ' + colors.border,
        }}
      />
      <div
        style={{
          padding: '10px 18px',
          background: colors.bg,
          border: `2px solid ${colors.border}`,
          borderRadius: data.type === 'decision' ? 4 : 8,
          minWidth: 120,
          textAlign: 'center',
          fontSize: 13,
          fontWeight: data.status === 'running' ? 600 : 400,
          color: colors.text,
          boxShadow:
            data.status === 'running'
              ? `0 0 0 3px ${colors.border}30, 0 2px 8px rgba(0,0,0,0.1)`
              : '0 1px 4px rgba(0,0,0,0.08)',
          transition: 'all 0.3s ease',
          position: 'relative',
        }}
      >
        {data.status === 'running' && <span className="running-indicator" />}
        {data.label}
      </div>
      <Handle
        type="source"
        position={Position.Right}
        style={{
          width: 10,
          height: 10,
          background: colors.border,
          border: '2px solid #fff',
          boxShadow: '0 0 0 1px ' + colors.border,
        }}
      />
    </>
  )
}

const nodeTypes = { custom: CustomNode }

export default function WorkflowGraph({
  nodes: rawNodes,
  edges: rawEdges,
  running,
}: WorkflowGraphProps) {
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([])
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([])

  // 图结构变化时重建节点和边
  useEffect(() => {
    const xNodes: Node[] = rawNodes.map((n, i) => ({
      id: n.id,
      type: 'custom',
      position: {
        x: n.x ?? i * 200,
        y: n.y ?? 100,
      },
      data: {
        label: n.label,
        type: n.type ?? 'default',
        status: n.status ?? 'idle',
      },
      sourcePosition: Position.Right,
      targetPosition: Position.Left,
    }))

    const xEdges: Edge[] = rawEdges.map((e, i) => ({
      id: `e${i}`,
      source: e.source,
      target: e.target,
      label: e.label,
      animated: e.animated ?? false,
      markerEnd: { type: MarkerType.ArrowClosed, color: '#1677ff' },
      style: { stroke: '#1677ff', strokeWidth: 1.5 },
      labelStyle: { fontSize: 11, fill: '#595959' },
      labelBgStyle: { fill: '#fff', fillOpacity: 0.85 },
    }))

    setNodes(xNodes)
    setEdges(xEdges)
  }, [rawNodes, rawEdges])

  // running 节点变化时只更新节点状态，不重建边（保留用户手动连的线）
  useEffect(() => {
    setNodes((nds: Node[]) =>
      nds.map((n: Node) => ({
        ...n,
        data: {
          ...(n.data as Record<string, unknown>),
          status: running === n.id ? 'running' : 'idle',
        },
      }))
    )
  }, [running])

  const onConnect = useCallback(
    (connection: Connection) =>
      setEdges((eds: Edge[]) =>
        addEdge(
          {
            ...connection,
            markerEnd: { type: MarkerType.ArrowClosed, color: '#1677ff' },
            style: { stroke: '#1677ff', strokeWidth: 1.5 },
            animated: false,
          } as Edge,
          eds
        )
      ),
    [setEdges]
  )

  return (
    <div style={{ width: '100%', height: '100%' }}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{ padding: 0.3 }}
        proOptions={{ hideAttribution: true }}
      >
        <Background color="#ebebeb" gap={20} />
        <Controls />
      </ReactFlow>
    </div>
  )
}

// 导入React Hooks
import { useEffect, useCallback } from 'react'
// 导入ReactFlow库的核心组件和类型
import {
  ReactFlow,              // ReactFlow主组件
  Background,             // 背景网格组件
  Controls,               // 控制面板组件（缩放、平移等）
  MarkerType,             // 箭头标记类型枚举
  useNodesState,          // 节点状态管理Hook
  useEdgesState,          // 边状态管理Hook
  addEdge,                // 添加边的工具函数
  Position,               // 节点连接点位置枚举
  Handle,                 // 节点连接点组件
  type Node,              // 节点类型
  type Edge,              // 边类型
  type Connection,        // 连接类型
} from '@xyflow/react'
// 导入ReactFlow默认样式
import '@xyflow/react/dist/style.css'
// 导入自定义样式
import './WorkflowGraph.css'

// 定义不同状态的节点颜色配置
const STATUS_COLORS = {
  idle:    { bg: '#f5f5f5', border: '#d9d9d9', text: '#595959' },  // 空闲状态：灰色
  running: { bg: '#e6f4ff', border: '#1677ff', text: '#1677ff' },  // 运行状态：蓝色
  done:    { bg: '#f6ffed', border: '#52c41a', text: '#389e0d' },  // 完成状态：绿色
  error:   { bg: '#fff2f0', border: '#ff4d4f', text: '#cf1322' },  // 错误状态：红色
  paused:  { bg: '#fffbe6', border: '#faad14', text: '#d48806' },  // 暂停状态：橙色
}

// 定义节点状态类型，必须是STATUS_COLORS的键之一
type NodeStatus = keyof typeof STATUS_COLORS

// 导出节点接口定义（业务层使用的节点数据结构）
export interface GraphNode {
  id: string                                    // 节点唯一标识
  label: string                                 // 节点显示的标签文本
  type?: 'start' | 'end' | 'default' | 'decision'  // 节点类型：开始、结束、默认、决策
  status?: NodeStatus                           // 节点状态
  x?: number                                    // 节点X坐标（可选）
  y?: number                                    // 节点Y坐标（可选）
}

// 导出边接口定义（业务层使用的边数据结构）
export interface GraphEdge {
  source: string                                // 源节点ID
  target: string                                // 目标节点ID
  label?: string                                // 边上的标签文本（可选）
  animated?: boolean                            // 是否显示流动动画（可选）
}

// 组件Props接口定义
interface WorkflowGraphProps {
  nodes: GraphNode[]                            // 节点数组
  edges: GraphEdge[]                            // 边数组
  running?: string                              // 当前正在运行的节点ID（可选）
}

// 自定义节点组件
function CustomNode({ data }: { data: any }) {
  // 根据节点状态获取对应的颜色配置，默认使用idle状态颜色
  const colors = STATUS_COLORS[data.status as NodeStatus] || STATUS_COLORS.idle

  return (
    <>
      {/* 左侧输入连接点（Handle）- 用于接收来自其他节点的连接 */}
      <Handle
        type="target"                            // 连接点类型：目标（输入）
        position={Position.Left}                 // 位置：节点左侧
        style={{
          width: 10,                             // 连接点宽度
          height: 10,                            // 连接点高度
          background: colors.border,             // 连接点背景色
          border: '2px solid #fff',              // 连接点边框
          boxShadow: '0 0 0 1px ' + colors.border, // 连接点外阴影
        }}
      />
      {/* 节点主体内容 */}
      <div
        style={{
          padding: '10px 18px',                  // 内边距
          background: colors.bg,                 // 背景色
          border: `2px solid ${colors.border}`,  // 边框
          borderRadius: data.type === 'decision' ? 4 : 8, // 决策节点圆角4px，其他8px
          minWidth: 120,                         // 最小宽度
          textAlign: 'center',                   // 文本居中
          fontSize: 13,                          // 字体大小
          fontWeight: data.status === 'running' ? 600 : 400, // 运行时字体加粗
          color: colors.text,                    // 文字颜色
          boxShadow:                             // 阴影效果
            data.status === 'running'
              ? `0 0 0 3px ${colors.border}30, 0 2px 8px rgba(0,0,0,0.1)` // 运行时：外发光+阴影
              : '0 1px 4px rgba(0,0,0,0.08)',   // 非运行时：轻微阴影
          transition: 'all 0.3s ease',           // 过渡动画
          position: 'relative',                  // 相对定位
        }}
      >
        {/* 运行状态指示器 - 仅在节点运行时显示 */}
        {data.status === 'running' && <span className="running-indicator" />}
        {/* 节点标签文本 */}
        {data.label}
      </div>
      {/* 右侧输出连接点（Handle）- 用于连接到其他节点 */}
      <Handle
        type="source"                            // 连接点类型：源（输出）
        position={Position.Right}                // 位置：节点右侧
        style={{
          width: 10,                             // 连接点宽度
          height: 10,                            // 连接点高度
          background: colors.border,             // 连接点背景色
          border: '2px solid #fff',              // 连接点边框
          boxShadow: '0 0 0 1px ' + colors.border, // 连接点外阴影
        }}
      />
    </>
  )
}

// 注册自定义节点类型，键名为'custom'，值为CustomNode组件
const nodeTypes = { custom: CustomNode }

// WorkflowGraph主组件 - 工作流图可视化组件
export default function WorkflowGraph({
  nodes: rawNodes,                               // 原始节点数据（业务层）
  edges: rawEdges,                               // 原始边数据（业务层）
  running,                                       // 当前运行的节点ID
}: WorkflowGraphProps) {
  // 使用ReactFlow的Hook管理节点状态
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([])
  // 使用ReactFlow的Hook管理边状态
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([])

  // Effect 1: 当图结构（节点或边）变化时，重建所有节点和边
  useEffect(() => {
    // 将业务层GraphNode[]转换为ReactFlow所需的Node[]类型
    const xNodes: Node[] = rawNodes.map((n, i) => ({
      id: n.id,                                  // 节点ID
      type: 'custom',                            // 使用自定义节点类型
      position: {                                // 节点位置
        x: n.x ?? i * 200,                       // X坐标：如果未指定则按索引排列（间距200px）
        y: n.y ?? 100,                           // Y坐标：如果未指定则默认为100
      },
      data: {                                    // 节点数据
        label: n.label,                          // 标签
        type: n.type ?? 'default',               // 类型：默认为'default'
        status: n.status ?? 'idle',              // 状态：默认为'idle'
      },
      sourcePosition: Position.Right,            // 源连接点位置：右侧
      targetPosition: Position.Left,             // 目标连接点位置：左侧
    }))

    // 将业务层GraphEdge[]转换为ReactFlow所需的Edge[]类型
    const xEdges: Edge[] = rawEdges.map((e, i) => ({
      id: `e${i}`,                               // 边ID：使用索引生成
      source: e.source,                          // 源节点ID
      target: e.target,                          // 目标节点ID
      label: e.label,                            // 边标签
      animated: e.animated ?? false,             // 是否动画：默认为false
      markerEnd: { type: MarkerType.ArrowClosed, color: '#1677ff' }, // 末端箭头：闭合箭头，蓝色
      style: { stroke: '#1677ff', strokeWidth: 1.5 }, // 边样式：蓝色，宽度1.5px
      labelStyle: { fontSize: 11, fill: '#595959' }, // 标签文字样式：11px深灰色
      labelBgStyle: { fill: '#fff', fillOpacity: 0.85 }, // 标签背景样式：白色，85%不透明度
    }))

    // 更新节点和边状态
    setNodes(xNodes)
    setEdges(xEdges)
  }, [rawNodes, rawEdges]) // 依赖项：当原始节点或边变化时触发

  // Effect 2: 当running节点变化时，只更新节点状态，不重建边（保留用户手动连接的线）
  useEffect(() => {
    setNodes((nds: Node[]) =>
      nds.map((n: Node) => ({
        ...n,                                    // 保留节点其他属性
        data: {                                  // 更新data字段
          ...(n.data as Record<string, unknown>), // 保留原有data
          status: running === n.id ? 'running' : 'idle', // 更新状态：当前运行节点为'running'，其他为'idle'
        },
      }))
    )
  }, [running]) // 依赖项：当running值变化时触发

  // 处理节点连接事件的回调函数
  const onConnect = useCallback(
    (connection: Connection) =>
      setEdges((eds: Edge[]) =>
        addEdge(                                  // 添加新边
          {
            ...connection,                        // 保留连接信息
            markerEnd: { type: MarkerType.ArrowClosed, color: '#1677ff' }, // 设置箭头样式
            style: { stroke: '#1677ff', strokeWidth: 1.5 }, // 设置边样式
            animated: false,                      // 手动连接的边不显示动画
          } as Edge,
          eds                                     // 现有边数组
        )
      ),
    [setEdges] // 依赖项：setEdges函数
  )

  // 渲染ReactFlow组件
  return (
    <div style={{ width: '100%', height: '100%' }}> {/* 容器：占满父元素 */}
      <ReactFlow
        nodes={nodes}                             // 节点数组
        edges={edges}                             // 边数组
        onNodesChange={onNodesChange}             // 节点变化事件处理
        onEdgesChange={onEdgesChange}             // 边变化事件处理
        onConnect={onConnect}                     // 连接事件处理
        nodeTypes={nodeTypes}                     // 自定义节点类型
        fitView                                   // 自动适配视图以显示所有节点
        fitViewOptions={{ padding: 0.3 }}         // 适配视图选项：留白30%
        proOptions={{ hideAttribution: true }}    // 隐藏ReactFlow版权标识
      >
        {/* 背景网格：浅灰色，间距20px */}
        <Background color="#ebebeb" gap={20} />
        {/* 控制面板：提供缩放、平移等控制功能 */}
        <Controls />
      </ReactFlow>
    </div>
  )
}
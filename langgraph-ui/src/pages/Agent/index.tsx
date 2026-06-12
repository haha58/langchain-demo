import { useState, useRef, useEffect } from 'react'
import { Input, Button, Tag, Divider, Empty, Spin } from 'antd'
import { SendOutlined, RobotOutlined, ToolOutlined } from '@ant-design/icons'
import { agentAPI } from '../../api'

interface AgentMessage {
  role: 'user' | 'agent'
  content: string
  time: string
}

const nowTime = () =>
  new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })

export default function AgentPage() {
  const [messages, setMessages] = useState<AgentMessage[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [threadId] = useState(`agent-${Date.now()}`)
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const handleSend = async () => {
    if (!input.trim() || loading) return
    const text = input
    setInput('')
    setMessages((prev) => [...prev, { role: 'user', content: text, time: nowTime() }])
    setLoading(true)
    try {
      const res = await agentAPI.chat(threadId, text)
      setMessages((prev) => [
        ...prev,
        { role: 'agent', content: res.data.answer, time: nowTime() },
      ])
    } finally {
      setLoading(false)
    }
  }

  const suggestions = [
    '北京和上海今天哪个城市更热？',
    '(15 + 27) × 3 + 100 等于多少？',
    '武汉今天天气怎么样，适合出门吗？',
  ]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: '#fff' }}>
      <div
        style={{
          padding: '12px 20px',
          borderBottom: '1px solid #f0f0f0',
          background: '#fafafa',
          flexShrink: 0,
        }}
      >
        <span style={{ fontSize: 13, color: '#595959' }}>
          可用工具：
          <Tag icon={<ToolOutlined />} color="blue" style={{ margin: '0 4px' }}>
            calculator
          </Tag>
          <Tag icon={<ToolOutlined />} color="green">
            get_weather
          </Tag>
          <span style={{ color: '#bbb', marginLeft: 8 }}>Agent 自动决定是否调工具</span>
        </span>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: 20 }}>
        {messages.length === 0 && (
          <div>
            <Empty
              description="发消息给 Agent，它会自动决定是否调用工具"
              style={{ marginBottom: 24 }}
            />
            <Divider plain style={{ color: '#bbb' }}>
              快速试试
            </Divider>
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: 8,
                maxWidth: 400,
                margin: '0 auto',
              }}
            >
              {suggestions.map((s) => (
                <Button
                  key={s}
                  onClick={() => setInput(s)}
                  style={{
                    textAlign: 'left',
                    height: 'auto',
                    padding: '8px 14px',
                    whiteSpace: 'pre-wrap',
                  }}
                >
                  {s}
                </Button>
              ))}
            </div>
          </div>
        )}

        {messages.map((msg, i) => (
          <div
            key={i}
            style={{
              display: 'flex',
              justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start',
              marginBottom: 12,
            }}
          >
            <div
              style={{
                maxWidth: '68%',
                padding: '10px 14px',
                borderRadius:
                  msg.role === 'user' ? '10px 2px 10px 10px' : '2px 10px 10px 10px',
                background: msg.role === 'user' ? '#1677ff' : '#f5f5f5',
                border: msg.role === 'user' ? 'none' : '1px solid #ebebeb',
                color: msg.role === 'user' ? '#fff' : '#1a1a1a',
                fontSize: 14,
                lineHeight: 1.65,
              }}
            >
              {msg.role === 'agent' && (
                <div style={{ marginBottom: 4 }}>
                  <RobotOutlined style={{ color: '#1677ff', marginRight: 4 }} />
                  <span style={{ fontSize: 11, color: '#1677ff', fontWeight: 600 }}>Agent</span>
                </div>
              )}
              <div style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{msg.content}</div>
              <div style={{ fontSize: 11, opacity: 0.55, marginTop: 4, textAlign: 'right' }}>
                {msg.time}
              </div>
            </div>
          </div>
        ))}

        {loading && (
          <div style={{ display: 'flex', marginBottom: 12 }}>
            <div
              style={{
                padding: '10px 14px',
                background: '#f5f5f5',
                borderRadius: '2px 10px 10px 10px',
                border: '1px solid #ebebeb',
              }}
            >
              <Spin size="small" />
              <span style={{ marginLeft: 8, color: '#999', fontSize: 13 }}>
                Agent 思考中...
              </span>
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      <div
        style={{
          display: 'flex',
          alignItems: 'flex-end',
          padding: '12px 20px',
          borderTop: '1px solid #f0f0f0',
          background: '#fafafa',
          flexShrink: 0,
        }}
      >
        <Input.TextArea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onPressEnter={(e) => {
            if (!e.shiftKey) {
              e.preventDefault()
              handleSend()
            }
          }}
          placeholder="输入问题，Agent 会自动决定是否调工具..."
          autoSize={{ minRows: 2, maxRows: 4 }}
          disabled={loading}
          style={{ flex: 1 }}
        />
        <Button
          type="primary"
          icon={<SendOutlined />}
          onClick={handleSend}
          loading={loading}
          disabled={!input.trim()}
          style={{ marginLeft: 10, alignSelf: 'flex-end' }}
        />
      </div>
    </div>
  )
}

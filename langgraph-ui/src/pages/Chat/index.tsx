import { useState, useRef, useEffect } from 'react'
import { Input, Button, Tag, Empty, Spin, Tooltip } from 'antd'
import { SendOutlined, PlusOutlined, HistoryOutlined } from '@ant-design/icons'
import { useChatStore } from '../../store/chatStore'
import styles from './Chat.module.css'

export default function ChatPage() {
  const [input, setInput] = useState('')
  const { messages, loading, threadId, sendMessage, newSession } = useChatStore()
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const handleSend = async () => {
    if (!input.trim() || loading) return
    const text = input
    setInput('')
    await sendMessage(text)
  }

  return (
    <div className={styles.container}>
      <div className={styles.topbar}>
        <div className={styles.sessionInfo}>
          <HistoryOutlined style={{ color: '#999', marginRight: 6 }} />
          <span style={{ color: '#999', fontSize: 12 }}>当前会话：</span>
          <Tag color="blue" style={{ margin: 0 }}>{threadId}</Tag>
        </div>
        <Tooltip title="开启新会话，历史不再共享">
          <Button size="small" icon={<PlusOutlined />} onClick={newSession}>
            新会话
          </Button>
        </Tooltip>
      </div>

      <div className={styles.messageArea}>
        {messages.length === 0 && (
          <Empty
            description="发送消息开始对话，相同会话 ID 可保留上下文记忆"
            style={{ marginTop: 80, color: '#bbb' }}
          />
        )}
        {messages.map((msg, i) => (
          <div
            key={i}
            className={`${styles.row} ${msg.role === 'user' ? styles.userRow : styles.aiRow}`}
          >
            <div
              className={`${styles.bubble} ${
                msg.role === 'user' ? styles.userBubble : styles.aiBubble
              }`}
            >
              <div className={styles.content}>{msg.content}</div>
              <div className={styles.time}>{msg.time}</div>
            </div>
          </div>
        ))}
        {loading && (
          <div className={`${styles.row} ${styles.aiRow}`}>
            <div className={`${styles.bubble} ${styles.aiBubble}`}>
              <Spin size="small" />
              <span style={{ marginLeft: 8, color: '#999' }}>思考中...</span>
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      <div className={styles.inputArea}>
        <Input.TextArea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onPressEnter={(e) => {
            if (!e.shiftKey) {
              e.preventDefault()
              handleSend()
            }
          }}
          placeholder="输入消息，Enter 发送，Shift+Enter 换行"
          autoSize={{ minRows: 2, maxRows: 5 }}
          disabled={loading}
          style={{ flex: 1 }}
        />
        <Button
          type="primary"
          icon={<SendOutlined />}
          onClick={handleSend}
          loading={loading}
          disabled={!input.trim()}
          style={{ marginLeft: 10, height: 'auto', alignSelf: 'flex-end' }}
        >
          发送
        </Button>
      </div>
    </div>
  )
}

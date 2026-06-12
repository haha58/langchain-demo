import { useState } from 'react'
import { Steps, Input, Button, Card, Tag, Space, Alert, Modal } from 'antd'
import {
  MailOutlined,
  CheckOutlined,
  CloseOutlined,
  EditOutlined,
  LoadingOutlined,
  SendOutlined,
} from '@ant-design/icons'
import { approvalAPI } from '../../api'

type Status = 'idle' | 'generating' | 'reviewing' | 'sent' | 'cancelled'

interface Draft {
  subject: string
  recipient: string
  body: string
}

export default function ApprovalPage() {
  const [request,    setRequest]    = useState('')
  const [threadId,   setThreadId]   = useState('')
  const [status,     setStatus]     = useState<Status>('idle')
  const [draft,      setDraft]      = useState<Draft | null>(null)
  const [feedback,   setFeedback]   = useState('')
  const [modifyOpen, setModifyOpen] = useState(false)
  const [finalMsg,   setFinalMsg]   = useState('')
  const [loading,    setLoading]    = useState(false)

  const stepIndex = ({ idle: 0, generating: 0, reviewing: 1, sent: 2, cancelled: 2 } as any)[status] ?? 0

  const handleStart = async () => {
    const tid = `email-${Date.now()}`
    setThreadId(tid)
    setStatus('generating')
    setLoading(true)
    try {
      const res = await approvalAPI.start(request, tid)
      if (res.data.status === 'waiting_for_approval') {
        setDraft(res.data.reviewData.draft)
        setStatus('reviewing')
      }
    } finally {
      setLoading(false)
    }
  }

  const handleApprove = async () => {
    setLoading(true)
    try {
      const res = await approvalAPI.approve(threadId)
      setFinalMsg(res.data.finalStatus)
      setStatus('sent')
    } finally {
      setLoading(false)
    }
  }

  const handleReject = async () => {
    await approvalAPI.reject(threadId)
    setFinalMsg('邮件已拒绝发送')
    setStatus('cancelled')
  }

  const handleModify = async () => {
    setModifyOpen(false)
    setLoading(true)
    try {
      const res = await approvalAPI.modify(threadId, feedback)
      if (res.data.status === 'waiting_for_approval') {
        setDraft(res.data.reviewData.draft)
        setStatus('reviewing')
        setFeedback('')
      }
    } finally {
      setLoading(false)
    }
  }

  const handleReset = () => {
    setStatus('idle')
    setDraft(null)
    setRequest('')
    setFinalMsg('')
    setFeedback('')
  }

  return (
    <div style={{ padding: '28px 32px', maxWidth: 740, margin: '0 auto' }}>
      <Steps
        current={stepIndex}
        style={{ marginBottom: 32 }}
        items={[
          {
            title: '起草邮件',
            icon: status === 'generating' ? <LoadingOutlined /> : <MailOutlined />,
          },
          { title: '人工审批' },
          { title: status === 'sent' ? '已发送' : status === 'cancelled' ? '已取消' : '完成' },
        ]}
      />

      {status === 'idle' && (
        <Card title="填写邮件需求">
          <Input.TextArea
            value={request}
            onChange={(e) => setRequest(e.target.value)}
            placeholder="描述邮件内容，如：给产品经理李明发邮件，告知本周前端进度：登录模块已完成，下周开始首页开发"
            rows={4}
            style={{ marginBottom: 16 }}
          />
          <Button
            type="primary"
            icon={<SendOutlined />}
            onClick={handleStart}
            disabled={!request.trim()}
            loading={loading}
          >
            生成邮件草稿
          </Button>
        </Card>
      )}

      {status === 'generating' && (
        <Card>
          <div style={{ textAlign: 'center', padding: '40px 0', color: '#1677ff' }}>
            <LoadingOutlined style={{ fontSize: 36 }} />
            <div style={{ marginTop: 16, fontWeight: 500 }}>AI 正在起草邮件...</div>
          </div>
        </Card>
      )}

      {status === 'reviewing' && draft && (
        <Card
          title={
            <Space>
              <MailOutlined />
              <span>邮件草稿</span>
              <Tag color="orange">待审批</Tag>
            </Space>
          }
          extra={
            <Space>
              <Button danger size="small" icon={<CloseOutlined />} onClick={handleReject}>
                拒绝
              </Button>
              <Button size="small" icon={<EditOutlined />} onClick={() => setModifyOpen(true)}>
                修改
              </Button>
              <Button
                type="primary"
                size="small"
                icon={<CheckOutlined />}
                onClick={handleApprove}
                loading={loading}
              >
                批准发送
              </Button>
            </Space>
          }
        >
          <div style={{ marginBottom: 8 }}>
            <Tag>收件人</Tag>
            <strong>{draft.recipient}</strong>
          </div>
          <div style={{ marginBottom: 14 }}>
            <Tag>主题</Tag>
            <strong>{draft.subject}</strong>
          </div>
          <div
            style={{
              padding: 16,
              background: '#fafafa',
              borderRadius: 8,
              border: '1px solid #f0f0f0',
              whiteSpace: 'pre-wrap',
              fontSize: 14,
              lineHeight: 1.8,
            }}
          >
            {draft.body}
          </div>
        </Card>
      )}

      {(status === 'sent' || status === 'cancelled') && (
        <Alert
          type={status === 'sent' ? 'success' : 'warning'}
          message={finalMsg}
          showIcon
          style={{ marginTop: 8 }}
          action={
            <Button size="small" onClick={handleReset}>
              重新发起
            </Button>
          }
        />
      )}

      <Modal
        title="填写修改意见"
        open={modifyOpen}
        onOk={handleModify}
        onCancel={() => setModifyOpen(false)}
        okText="提交"
        cancelText="取消"
      >
        <Input.TextArea
          value={feedback}
          onChange={(e) => setFeedback(e.target.value)}
          placeholder="说明需要修改的地方，如：语气太正式，加上下季度计划..."
          rows={4}
        />
      </Modal>
    </div>
  )
}

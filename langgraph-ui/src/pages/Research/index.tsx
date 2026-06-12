import { useState } from 'react'
import { Steps, Input, Button, Card, Tag, Space, Alert, Modal, Timeline } from 'antd'
import {
  SearchOutlined,
  CheckOutlined,
  EditOutlined,
  CloseOutlined,
  LoadingOutlined,
  FileTextOutlined,
} from '@ant-design/icons'
import { useResearchStore } from '../../store/researchStore'

export default function ResearchPage() {
  const [question,   setQuestion]   = useState('')
  const [reviseOpen, setReviseOpen] = useState(false)
  const [feedback,   setFeedback]   = useState('')

  const {
    status,
    reviewData,
    report,
    executionLog,
    loading,
    startResearch,
    approve,
    revise,
    reject,
    reset,
  } = useResearchStore()

  const stepIndex =
    ({ idle: 0, researching: 1, reviewing: 2, published: 3, rejected: 3 } as any)[status] ?? 0

  const handleRevise = async () => {
    setReviseOpen(false)
    await revise(feedback)
    setFeedback('')
  }

  return (
    <div style={{ padding: '28px 32px', maxWidth: 860, margin: '0 auto' }}>
      <Steps
        current={stepIndex}
        style={{ marginBottom: 28 }}
        items={[
          { title: '提问' },
          {
            title: '并行调研',
            icon: status === 'researching' ? <LoadingOutlined /> : undefined,
          },
          {
            title: '人工审核',
            icon: status === 'reviewing' ? <CheckOutlined /> : undefined,
          },
          {
            title:
              status === 'published' ? '已发布' : status === 'rejected' ? '已拒绝' : '完成',
          },
        ]}
      />

      {status === 'idle' && (
        <Card title="输入技术选型问题">
          <Input.TextArea
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder="如：NestJS 项目里做实时通信，用 WebSocket + Redis 还是 SSE + 消息队列？"
            rows={3}
            style={{ marginBottom: 16 }}
          />
          <Button
            type="primary"
            icon={<SearchOutlined />}
            onClick={() => startResearch(question)}
            disabled={!question.trim()}
            loading={loading}
          >
            开始调研
          </Button>
        </Card>
      )}

      {status === 'researching' && (
        <Card>
          <div style={{ textAlign: 'center', padding: '32px 0', color: '#1677ff' }}>
            <LoadingOutlined style={{ fontSize: 36 }} />
            <div style={{ marginTop: 16, fontWeight: 500 }}>多个 Agent 并行调研中...</div>
            <div style={{ marginTop: 8, color: '#bbb', fontSize: 13 }}>通常需要 20-40 秒</div>
          </div>
          {executionLog.length > 0 && (
            <Timeline
              style={{ marginTop: 20, padding: '0 24px' }}
              items={executionLog.map((log) => ({ children: log }))}
            />
          )}
        </Card>
      )}

      {status === 'reviewing' && reviewData && (
        <Card
          title={
            <Space>
              <FileTextOutlined />
              <span>调研报告</span>
              <Tag color="orange">
                待审核（第 {(reviewData.meta?.revisionCount ?? 0) + 1} 版）
              </Tag>
            </Space>
          }
          extra={
            <Space>
              <Button danger size="small" icon={<CloseOutlined />} onClick={reject}>
                拒绝
              </Button>
              <Button size="small" icon={<EditOutlined />} onClick={() => setReviseOpen(true)}>
                要求修改
              </Button>
              <Button
                type="primary"
                size="small"
                icon={<CheckOutlined />}
                onClick={approve}
                loading={loading}
              >
                批准发布
              </Button>
            </Space>
          }
        >
          <div
            style={{
              maxHeight: '55vh',
              overflowY: 'auto',
              padding: 16,
              background: '#fafafa',
              borderRadius: 8,
              border: '1px solid #f0f0f0',
            }}
          >
            <pre style={{ whiteSpace: 'pre-wrap', fontSize: 14, lineHeight: 1.8, margin: 0 }}>
              {reviewData.report}
            </pre>
          </div>
        </Card>
      )}

      {status === 'published' && (
        <Card
          title="✅ 报告已发布"
          extra={
            <Button size="small" onClick={reset}>
              重新调研
            </Button>
          }
        >
          <div
            style={{
              maxHeight: '60vh',
              overflowY: 'auto',
              padding: 16,
              background: '#fafafa',
              borderRadius: 8,
            }}
          >
            <pre style={{ whiteSpace: 'pre-wrap', fontSize: 14, lineHeight: 1.8, margin: 0 }}>
              {report}
            </pre>
          </div>
        </Card>
      )}

      {status === 'rejected' && (
        <Alert
          type="warning"
          message="调研报告已拒绝"
          showIcon
          action={
            <Button size="small" onClick={reset}>
              重新开始
            </Button>
          }
        />
      )}

      <Modal
        title="填写修改意见"
        open={reviseOpen}
        onOk={handleRevise}
        onCancel={() => setReviseOpen(false)}
        okText="提交"
        cancelText="取消"
      >
        <Input.TextArea
          value={feedback}
          onChange={(e) => setFeedback(e.target.value)}
          placeholder="说明报告需要改进的地方..."
          rows={4}
        />
      </Modal>
    </div>
  )
}

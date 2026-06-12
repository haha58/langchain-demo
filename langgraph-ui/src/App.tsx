import { BrowserRouter, Routes, Route, NavLink, Navigate } from 'react-router-dom'
import { Layout } from 'antd'
import {
  MessageOutlined,
  RobotOutlined,
  ApartmentOutlined,
  MailOutlined,
  SearchOutlined,
  NodeExpandOutlined,
} from '@ant-design/icons'
import ChatPage           from './pages/Chat'
import AgentPage          from './pages/Agent'
import WorkflowPage       from './pages/Workflow'
import ApprovalPage       from './pages/Approval'
import ResearchPage       from './pages/Research'
import WorkflowEditorPage from './pages/WorkflowEditor'
import './App.css'

const { Sider, Content } = Layout

const navItems = [
  { path: '/chat',            icon: <MessageOutlined />,   label: '对话记忆',   desc: '文档一' },
  { path: '/agent',           icon: <RobotOutlined />,     label: 'Agent 调试', desc: '文档二' },
  { path: '/workflow',        icon: <ApartmentOutlined />, label: '工作流图',   desc: '文档三' },
  { path: '/workflow-editor', icon: <NodeExpandOutlined />,label: '工作流编排', desc: '文档六' },
  { path: '/approval',        icon: <MailOutlined />,      label: '邮件审批',   desc: '文档四' },
  { path: '/research',        icon: <SearchOutlined />,    label: '技术调研',   desc: '文档五' },
]

export default function App() {
  return (
    <BrowserRouter>
      <Layout style={{ minHeight: '100vh' }}>
        <Sider width={200} theme="light" style={{ borderRight: '1px solid #f0f0f0' }}>
          <div style={{
            padding:       '16px 20px',
            fontWeight:    700,
            fontSize:      15,
            borderBottom:  '1px solid #f0f0f0',
            color:         '#1677ff',
            letterSpacing: 0.3,
          }}>
            LangGraph-Agent
          </div>
          <nav style={{ padding: '8px 0' }}>
            {navItems.map(item => (
              <NavLink
                key={item.path}
                to={item.path}
                style={({ isActive }) => ({
                  display:        'flex',
                  alignItems:     'center',
                  gap:            10,
                  padding:        '10px 20px',
                  color:          isActive ? '#1677ff' : '#595959',
                  background:     isActive ? '#e6f4ff' : 'transparent',
                  textDecoration: 'none',
                  borderRight:    isActive ? '3px solid #1677ff' : 'none',
                  fontWeight:     isActive ? 600 : 400,
                  fontSize:       14,
                  transition:     'all 0.15s',
                })}
              >
                {item.icon}
                <span style={{ flex: 1 }}>{item.label}</span>
                <span style={{ fontSize: 10, color: '#bbb' }}>{item.desc}</span>
              </NavLink>
            ))}
          </nav>
        </Sider>
        <Content style={{ overflow: 'hidden' }}>
          <Routes>
            <Route path="/"         element={<Navigate to="/chat" replace />} />
            <Route path="/chat"     element={<ChatPage />} />
            <Route path="/agent"    element={<AgentPage />} />
            <Route path="/workflow"        element={<WorkflowPage />} />
            <Route path="/workflow-editor" element={<WorkflowEditorPage />} />
            <Route path="/approval"        element={<ApprovalPage />} />
            <Route path="/research" element={<ResearchPage />} />
          </Routes>
        </Content>
      </Layout>
    </BrowserRouter>
  )
}

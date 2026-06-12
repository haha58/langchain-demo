# LangGraph NestJS 后端

LangGraph + NestJS 实战后端，对应 LangGraph 实操手册文档 1-5。

## 技术栈

- **NestJS 11** — 后端框架
- **@langchain/langgraph 1.2.x** — AI 工作流编排
- **Ollama** — 本地大模型服务（qwen3.5:0.8b）
- **Docker** — 容器化部署
- **GitHub Actions** — CI/CD 自动化
- **Vercel** — 云端部署

---

## 快速启动

### 方式一：本地直接运行（推荐开发时用）

**前提**：本机已安装并启动 Ollama

```bash
# 1. 安装 Ollama（如未安装）
# macOS
brew install ollama

# 2. 启动 Ollama 服务（macOS 安装 App 后自动启动，Linux 需手动）
ollama serve

# 3. 拉取模型
ollama pull qwen3.5:0.8b

# 4. 克隆项目，安装依赖
git clone https://github.com/你的用户名/langgraph-nest.git
cd langgraph-nest
npm install

# 5. 配置环境变量
cp .env.example .env
# .env 默认配置已适配本地 Ollama，通常不需要修改

# 6. 启动开发服务器
npm run start:dev
```

访问 `http://localhost:3000/api/health` 验证是否正常。

---

### 方式二：Docker Compose 一键启动（含 Ollama）

```bash
# 首次启动（自动拉取 qwen3.5:0.8b，约 600MB，需要等待）
docker compose up -d

# 查看日志
docker compose logs -f app

# 停止
docker compose down
```

> **首次启动说明**：`ollama-init` 服务会自动拉取模型，`app` 服务会等待 Ollama 健康检查通过后再启动。整个过程约 2-5 分钟（取决于网速）。

---

### 方式三：仅启动 Ollama（NestJS 热重载开发）

```bash
# 只启动 Ollama 容器，NestJS 在本机用热重载启动
docker compose -f docker-compose.dev.yml up -d

# 然后在另一个终端
npm run start:dev
```

---

## 环境变量说明

复制 `.env.example` 为 `.env` 并按需修改：

| 变量名 | 说明 | 默认值 |
|--------|------|--------|
| `PORT` | 服务端口 | `3000` |
| `LANGGRAPH_MODEL` | 使用的 LLM 模型 | `qwen3.5:0.8b` |
| `OLLAMA_BASE_URL` | Ollama/云端 API 地址 | `http://localhost:11434/v1` |
| `OLLAMA_API_KEY` | API Key（本地 Ollama 填 `ollama`）| `ollama` |
| `ALLOWED_ORIGINS` | 允许跨域的前端地址 | `http://localhost:5173` |

### 切换到云端 API（生产环境）

只需修改 `.env`，代码不用动：

```bash
# 使用 DeepSeek
LANGGRAPH_MODEL=deepseek-chat
OLLAMA_BASE_URL=https://api.deepseek.com/v1
OLLAMA_API_KEY=sk-xxxxxxxxxxxxxxxx
```

---

## API 接口清单

### 文档一：基础对话

| Method | 路径 | Body | 说明 |
|--------|------|------|------|
| POST | `/api/langgraph/simple-chat` | `{ message }` | 无记忆问答 |
| POST | `/api/langgraph/memory-chat` | `{ threadId, message }` | 有记忆多轮对话 |
| GET  | `/api/langgraph/history/:threadId` | — | 查看对话历史 |
| POST | `/api/langgraph/article` | `{ article }` | 文章摘要流水线 |

### 文档二：条件路由 + ReAct Agent

| Method | 路径 | Body | 说明 |
|--------|------|------|------|
| POST | `/api/langgraph/react-chat` | `{ threadId, message }` | ReAct Agent（工具调用）|
| POST | `/api/langgraph/route` | `{ input }` | 分类路由 |
| POST | `/api/langgraph/parallel` | `{ task }` | 并行分支任务 |

### 文档三：Multi-Agent

| Method | 路径 | Body | 说明 |
|--------|------|------|------|
| POST | `/api/langgraph/supervisor` | `{ input }` | Supervisor 监督模式 |
| POST | `/api/langgraph/pipeline` | `{ topic }` | 内容创作流水线 |
| POST | `/api/langgraph/code-review` | `{ code, language? }` | 并行代码审查 |

### 文档四：Human-in-the-loop

| Method | 路径 | Body | 说明 |
|--------|------|------|------|
| POST | `/api/langgraph/email/start` | `{ request, threadId }` | 启动邮件审批 |
| POST | `/api/langgraph/email/:threadId/approve` | — | 批准发送 |
| POST | `/api/langgraph/email/:threadId/reject` | — | 拒绝 |
| POST | `/api/langgraph/email/:threadId/modify` | `{ feedback }` | 要求修改 |
| GET  | `/api/langgraph/email/:threadId/state` | — | 查看当前状态 |

### 文档五：综合项目（技术调研助手）

| Method | 路径 | Body | 说明 |
|--------|------|------|------|
| POST | `/api/langgraph/research/start` | `{ question, threadId }` | 启动调研 |
| POST | `/api/langgraph/research/:threadId/approve` | — | 批准发布 |
| POST | `/api/langgraph/research/:threadId/revise` | `{ feedback }` | 要求修改 |
| POST | `/api/langgraph/research/:threadId/reject` | — | 拒绝 |
| GET  | `/api/langgraph/research/:threadId/state` | — | 查看执行状态 |

---

## 部署到 Vercel

### 1. 在 Vercel 创建项目

```bash
# 安装 Vercel CLI
npm i -g vercel

# 登录并初始化项目（第一次）
vercel login
vercel link
```

### 2. 设置 GitHub Secrets

在 GitHub 仓库 → Settings → Secrets → Actions 添加：

| Secret 名称 | 获取方式 |
|------------|---------|
| `VERCEL_TOKEN` | Vercel 控制台 → Settings → Tokens |
| `VERCEL_ORG_ID` | 执行 `vercel link` 后查看 `.vercel/project.json` |
| `VERCEL_PROJECT_ID` | 同上 |

### 3. 在 Vercel 设置环境变量

Vercel 控制台 → 你的项目 → Settings → Environment Variables 添加：

```
LANGGRAPH_MODEL    = deepseek-chat
OLLAMA_BASE_URL    = https://api.deepseek.com/v1
OLLAMA_API_KEY     = sk-你的DeepSeek密钥
ALLOWED_ORIGINS    = https://你的前端域名.vercel.app
```

> **注意**：Vercel Serverless 函数无法运行 Ollama（本地进程），生产环境必须使用云端 API（DeepSeek / OpenAI 等）。

### 4. 推送代码触发自动部署

```bash
git add .
git commit -m "feat: 初始化项目"
git push origin main
# GitHub Actions 自动触发 → 构建 → 部署到 Vercel
```

---

## 项目结构

```
langgraph-nest/
├── src/
│   ├── main.ts                          # 应用入口 + Ollama 健康检查
│   ├── app.module.ts                    # 根模块
│   ├── app.controller.ts                # /api/health 接口
│   ├── config.ts                        # 统一配置（模型、CORS 等）
│   └── langgraph/
│       ├── langgraph.module.ts          # LangGraph 模块
│       ├── langgraph.controller.ts      # 所有接口路由
│       ├── langgraph.service.ts         # 文档一：简单问答 + 记忆对话
│       ├── article.service.ts           # 文档一：文章摘要流水线
│       ├── react-agent.service.ts       # 文档二：ReAct Agent
│       ├── routing.service.ts           # 文档二：分类路由
│       ├── parallel.service.ts          # 文档二：并行分支
│       ├── supervisor.service.ts        # 文档三：Supervisor 模式
│       ├── pipeline.service.ts          # 文档三：内容创作流水线
│       ├── code-review.service.ts       # 文档三：并行代码审查
│       ├── email-approval.service.ts    # 文档四：邮件审批
│       └── tech-research/
│           ├── tech-research.module.ts
│           ├── tech-research.controller.ts
│           └── tech-research.service.ts # 文档五：技术调研助手
├── .github/
│   └── workflows/
│       └── deploy.yml                   # GitHub Actions CI/CD
├── Dockerfile                           # 生产镜像（多阶段构建）
├── docker-compose.yml                   # 生产环境（含 Ollama）
├── docker-compose.dev.yml               # 开发环境（仅 Ollama）
├── vercel.json                          # Vercel 部署配置
├── .env.example                         # 环境变量模板
├── .gitignore
├── nest-cli.json
├── tsconfig.json
└── package.json
```

---

## 常见问题

**Q：启动报 `Cannot connect to Ollama`**
A：确认 Ollama 已启动（`ollama serve`），或 `docker compose up ollama` 单独启动。

**Q：模型响应慢**
A：`qwen3.5:0.8b` 首次调用需要加载模型（5-15秒），之后会快很多。内存不足时换更小的模型或使用云端 API。

**Q：工具调用不稳定**
A：升级 Ollama 到 ≥ 0.17.5。如仍不稳定，在 `.env` 改 `LANGGRAPH_MODEL=qwen3:4b`。

**Q：Vercel 部署后接口报错**
A：Vercel Serverless 有执行时间限制（60秒），LLM 调用可能超时。建议生产环境换响应更快的云端 API。

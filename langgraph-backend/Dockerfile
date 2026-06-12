# ── 阶段一：构建 ──────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app

# 先复制 package.json，利用 Docker 层缓存加速依赖安装
COPY package*.json ./
RUN npm ci --only=production=false

# 复制源码并编译
COPY . .
RUN npm run build

# ── 阶段二：运行 ──────────────────────────────────────
FROM node:20-alpine AS runner

WORKDIR /app

# 只安装生产依赖
COPY package*.json ./
RUN npm ci --only=production && npm cache clean --force

# 从构建阶段复制编译产物
COPY --from=builder /app/dist ./dist

# 非 root 用户运行（安全最佳实践）
RUN addgroup -g 1001 -S nodejs && \
    adduser  -S nestjs -u 1001
USER nestjs

EXPOSE 3000

# 健康检查
HEALTHCHECK --interval=30s --timeout=10s --start-period=15s --retries=3 \
  CMD wget -qO- http://localhost:3000/api/health || exit 1

CMD ["node", "dist/main"]

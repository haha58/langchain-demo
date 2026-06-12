import 'reflect-metadata'
import { NestFactory } from '@nestjs/core'
import { AppModule }   from './app.module'
import { config }      from './config'

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    logger: ['log', 'warn', 'error'],
  })

  // ── 全局路由前缀 ──────────────────────────────────
  app.setGlobalPrefix('api')

  // ── CORS：允许前端跨域访问 ────────────────────────
  app.enableCors({
    origin:  config.cors.origins,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  })

  // ── 启动服务 ──────────────────────────────────────
  await app.listen(config.app.port)

  const baseUrl = `http://localhost:${config.app.port}/api`
  console.log(`\n${'─'.repeat(55)}`)
  console.log(`🚀 LangGraph 服务已启动`)
  console.log(`   环境:   ${config.app.nodeEnv}`)
  console.log(`   地址:   ${baseUrl}`)
  console.log(`   模型:   ${config.langGraph.model}`)
  console.log(`   BaseURL: ${config.langGraph.baseURL}`)
  console.log(`${'─'.repeat(55)}`)

  // ── Ollama 连通性检查（仅本地开发时）────────────────
  if (config.langGraph.baseURL.includes('localhost')) {
    await checkOllamaHealth()
  }
}

async function checkOllamaHealth() {
  try {
    const ollamaBase = config.langGraph.baseURL.replace('/v1', '')
    const res = await fetch(`${ollamaBase}/api/tags`, { signal: AbortSignal.timeout(3000) })
    if (res.ok) {
      const data: any = await res.json()
      const models: string[] = (data.models || []).map((m: any) => m.name)
      const targetModel = config.langGraph.model
      const installed   = models.some(m => m.startsWith(targetModel.split(':')[0]))

      console.log(`\n✅ Ollama 连接正常`)
      console.log(`   已安装模型: ${models.length > 0 ? models.join(', ') : '（无）'}`)

      if (!installed) {
        console.warn(`\n⚠️  未找到模型 ${targetModel}，请执行：`)
        console.warn(`   ollama pull ${targetModel}`)
      } else {
        console.log(`   目标模型 ${targetModel} ✓`)
      }
    }
  } catch {
    console.warn(`\n⚠️  Ollama 连接失败（${config.langGraph.baseURL.replace('/v1', '')}）`)
    console.warn(`   请确认 Ollama 已启动：ollama serve`)
    console.warn(`   或在 .env 中修改 OLLAMA_BASE_URL 指向正确地址`)
  }
  console.log('')
}

bootstrap()

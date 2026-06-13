import { Controller, Post, Get, Body, Param, Res } from '@nestjs/common'
import type { Response } from 'express'
import { LanggraphService }     from './langgraph.service'
import { ArticleService }       from './article.service'
import { ReactAgentService }    from './react-agent.service'
import { RoutingService }       from './routing.service'
import { ParallelService }      from './parallel.service'
import { SupervisorService }    from './supervisor.service'
import { PipelineService }      from './pipeline.service'
import { CodeReviewService }    from './code-review.service'
import { EmailApprovalService } from './email-approval.service'

@Controller('langgraph')
export class LanggraphController {
  constructor(
    private readonly svc:           LanggraphService,
    private readonly articleSvc:    ArticleService,
    private readonly reactSvc:      ReactAgentService,
    private readonly routingSvc:    RoutingService,
    private readonly parallelSvc:   ParallelService,
    private readonly supervisorSvc: SupervisorService,
    private readonly pipelineSvc:   PipelineService,
    private readonly codeReviewSvc: CodeReviewService,
    private readonly emailSvc:      EmailApprovalService,
  ) {}

  // ── 工具接口 ───────────────────────────────────────
  /** 随机返回 ping / pong，供工作流条件分支演示 */
  @Get('ping')
  ping() {
    return { message: Math.random() < 0.5 ? 'ping' : 'pong' }
  }

  // ── 文档一 ─────────────────────────────────────────
  @Post('simple-chat')
  simpleChat(@Body() body: { message: string }) {
    return this.svc.simpleChat(body.message).then(answer => ({ answer }))
  }

  @Post('memory-chat')
  memoryChat(@Body() body: { threadId: string; message: string }) {
    return this.svc.memoryChat(body.threadId, body.message).then(answer => ({ answer }))
  }

  @Get('history/:threadId')
  getHistory(@Param('threadId') threadId: string) {
    return this.svc.getHistory(threadId)
  }

  @Post('article')
  processArticle(@Body() body: { article: string }) {
    return this.articleSvc.process(body.article)
  }

  // ── 文档二 ─────────────────────────────────────────
  @Post('react-chat')
  reactChat(@Body() body: { threadId: string; message: string }) {
    return this.reactSvc.chat(body.threadId, body.message).then(answer => ({ answer }))
  }

  @Post('route')
  route(@Body() body: { input: string }) {
    return this.routingSvc.handle(body.input)
  }

  @Post('parallel')
  parallel(@Body() body: { task: string }) {
    return this.parallelSvc.run(body.task)
  }

  // ── 文档三 ─────────────────────────────────────────
  @Post('supervisor')
  supervisor(@Body() body: { input: string }) {
    return this.supervisorSvc.run(body.input)
  }

  @Post('pipeline')
  pipeline(@Body() body: { topic: string }) {
    return this.pipelineSvc.createContent(body.topic)
  }

  @Post('code-review')
  codeReview(@Body() body: { code: string; language?: string }) {
    return this.codeReviewSvc.review(body.code, body.language)
  }

  @Post('code-review/stream')
  async codeReviewStream(
    @Body() body: { code: string; language?: string },
    @Res() res: Response,
  ) {
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8')
    res.setHeader('Cache-Control', 'no-cache, no-transform')
    res.setHeader('Connection', 'keep-alive')
    res.flushHeaders?.()

    const send = (event: unknown) => {
      res.write(`data: ${JSON.stringify(event)}\n\n`)
    }

    try {
      await this.codeReviewSvc.reviewStream(body.code, body.language, send)
    } catch (error) {
      send({
        type: 'error',
        message: error instanceof Error ? error.message : '代码审查失败',
        timestamp: Date.now(),
      })
    } finally {
      res.end()
    }
  }

  // ── 文档四 ─────────────────────────────────────────
  @Post('email/start')
  emailStart(@Body() body: { request: string; threadId: string }) {
    return this.emailSvc.start(body.request, body.threadId)
  }

  @Post('email/:threadId/approve')
  emailApprove(@Param('threadId') threadId: string) {
    return this.emailSvc.approve(threadId)
  }

  @Post('email/:threadId/reject')
  emailReject(@Param('threadId') threadId: string) {
    return this.emailSvc.reject(threadId)
  }

  @Post('email/:threadId/modify')
  emailModify(
    @Param('threadId') threadId: string,
    @Body() body: { feedback: string },
  ) {
    return this.emailSvc.requestModify(threadId, body.feedback)
  }

  @Get('email/:threadId/state')
  emailState(@Param('threadId') threadId: string) {
    return this.emailSvc.getState(threadId)
  }
}

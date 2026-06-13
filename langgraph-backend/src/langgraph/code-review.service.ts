import { Injectable, OnModuleInit } from '@nestjs/common'
import { ChatOllama } from '@langchain/ollama'
import { StateGraph, START, END, Annotation, Send, Command } from '@langchain/langgraph'
import { HumanMessage } from '@langchain/core/messages'
import { config } from '../config'

type ReviewResult = {
  aspect: string
  issues: string[]
  score: number
}

type ReviewTask = {
  nodeId: 'security' | 'perf' | 'style'
  aspect: string
  prompt: string
}

type CodeReviewResponse = {
  language: string
  reviewResults: ReviewResult[]
  report: string
  totalTime: string
}

type StreamEventWithoutTimestamp = {
  [K in CodeReviewStreamEvent['type']]: Omit<Extract<CodeReviewStreamEvent, { type: K }>, 'timestamp'>
}[CodeReviewStreamEvent['type']]

export type CodeReviewStreamEvent =
  | { type: 'node_start'; nodeId: string; label?: string; timestamp: number }
  | { type: 'node_end'; nodeId: string; result?: ReviewResult; report?: string; timestamp: number }
  | { type: 'dispatch'; nodeId: 'dispatch'; tasks: { nodeId: string; aspect: string }[]; timestamp: number }
  | { type: 'result'; result: CodeReviewResponse; timestamp: number }
  | { type: 'error'; message: string; timestamp: number }

const ReviewState = Annotation.Root({
  code: Annotation<string>(),
  language: Annotation<string>(),
  reviewResults: Annotation<ReviewResult[]>({
    reducer: (prev, curr) => [...prev, ...curr],
    default: () => [],
  }),
  report: Annotation<string>(),
})

const SingleReviewState = Annotation.Root({
  code: Annotation<string>(),
  language: Annotation<string>(),
  nodeId: Annotation<string>(),
  aspect: Annotation<string>(),
  prompt: Annotation<string>(),
})

@Injectable()
export class CodeReviewService implements OnModuleInit {
  private graph: any
  private llm!: ChatOllama

  private readonly reviewTasks: ReviewTask[] = [
    {
      nodeId: 'security',
      aspect: '安全审查',
      prompt:
        '检查代码安全问题，包括 SQL 注入、XSS、敏感信息泄露、权限绕过等。只输出 JSON：{"issues":["问题描述"],"score":7}',
    },
    {
      nodeId: 'perf',
      aspect: '性能审查',
      prompt:
        '检查代码性能问题，包括算法复杂度、N+1 查询、内存泄漏、重复计算等。只输出 JSON：{"issues":["问题描述"],"score":7}',
    },
    {
      nodeId: 'style',
      aspect: '代码规范',
      prompt:
        '检查代码规范问题，包括命名、注释、DRY 原则、错误处理、可维护性等。只输出 JSON：{"issues":["问题描述"],"score":7}',
    },
  ]

  onModuleInit() {
    this.llm = this.buildLLM()

    const dispatch = (state: typeof ReviewState.State) => {
      console.log(`\n[dispatch] 并行启动 ${this.reviewTasks.length} 个审查 Agent`)
      this.reviewTasks.forEach((task) => console.log(`   -> reviewAgent(${task.aspect})`))

      return new Command({
        goto: this.reviewTasks.map(
          (task) =>
            new Send('reviewAgent', {
              code: state.code,
              language: state.language,
              nodeId: task.nodeId,
              aspect: task.aspect,
              prompt: task.prompt,
            })
        ),
      })
    }

    const reviewAgent = async (state: typeof SingleReviewState.State) => {
      const result = await this.runReviewTask({
        code: state.code,
        language: state.language,
        aspect: state.aspect,
        prompt: state.prompt,
      })
      return { reviewResults: [result] }
    }

    const generateReport = async (state: typeof ReviewState.State) => ({
      report: await this.generateReport(state.reviewResults),
    })

    this.graph = new StateGraph(ReviewState)
      .addNode('dispatch', dispatch, { ends: ['reviewAgent'] })
      .addNode('reviewAgent', reviewAgent, { ends: ['generateReport'] })
      .addNode('generateReport', generateReport)
      .addEdge(START, 'dispatch')
      .addEdge('reviewAgent', 'generateReport')
      .addEdge('generateReport', END)
      .compile()

    console.log('CodeReviewService initialized')
  }

  async review(code: string, language = 'TypeScript'): Promise<CodeReviewResponse> {
    const t0 = Date.now()
    console.log(`\n[code-review] language=${language}, codeLength=${code.length}`)

    const result = await this.graph.invoke({ code, language })
    const elapsed = Date.now() - t0

    console.log(`[code-review] done in ${elapsed}ms\n`)
    return {
      language,
      reviewResults: result.reviewResults,
      report: result.report,
      totalTime: `${elapsed}ms`,
    }
  }

  async reviewStream(
    code: string,
    language = 'TypeScript',
    emit: (event: CodeReviewStreamEvent) => void
  ): Promise<void> {
    const t0 = Date.now()
    const send = (event: StreamEventWithoutTimestamp) =>
      emit({ ...event, timestamp: Date.now() } as CodeReviewStreamEvent)

    try {
      console.log(`\n[code-review:stream] language=${language}, codeLength=${code.length}`)

      send({ type: 'node_start', nodeId: 'start', label: 'START' })
      send({ type: 'node_end', nodeId: 'start' })
      send({ type: 'node_start', nodeId: 'dispatch', label: 'Dispatch' })
      send({
        type: 'dispatch',
        nodeId: 'dispatch',
        tasks: this.reviewTasks.map(({ nodeId, aspect }) => ({ nodeId, aspect })),
      })
      send({ type: 'node_end', nodeId: 'dispatch' })

      const reviewResults = await Promise.all(
        this.reviewTasks.map(async (task) => {
          send({ type: 'node_start', nodeId: task.nodeId, label: task.aspect })
          const result = await this.runReviewTask({
            code,
            language,
            aspect: task.aspect,
            prompt: task.prompt,
          })
          send({ type: 'node_end', nodeId: task.nodeId, result })
          return result
        })
      )

      send({ type: 'node_start', nodeId: 'report', label: '生成报告' })
      const report = await this.generateReport(reviewResults)
      send({ type: 'node_end', nodeId: 'report', report })

      const elapsed = Date.now() - t0
      const result: CodeReviewResponse = {
        language,
        reviewResults,
        report,
        totalTime: `${elapsed}ms`,
      }

      send({ type: 'node_start', nodeId: 'end', label: 'END' })
      send({ type: 'result', result })
      send({ type: 'node_end', nodeId: 'end' })
      console.log(`[code-review:stream] done in ${elapsed}ms\n`)
    } catch (error) {
      throw error
    }
  }

  private buildLLM() {
    return new ChatOllama({
      model: config.langGraph.model,
      temperature: config.langGraph.temperature,
      baseUrl: config.langGraph.baseURL,
      think: false,
      numPredict: 512,
    })
  }

  private async runReviewTask(params: {
    code: string
    language: string
    aspect: string
    prompt: string
  }): Promise<ReviewResult> {
    console.log(`[reviewAgent] start ${params.aspect}`)
    const res = await this.llm.invoke([
      new HumanMessage(`${params.prompt}\n\n${params.language} 代码：\n\`\`\`\n${params.code}\n\`\`\``),
    ])

    const parsed = this.parseReviewJson(res.content as string)
    console.log(`[reviewAgent] done ${params.aspect}, score=${parsed.score}/10, issues=${parsed.issues.length}`)

    return {
      aspect: params.aspect,
      ...parsed,
    }
  }

  private async generateReport(reviewResults: ReviewResult[]): Promise<string> {
    const avgScore = Math.round(
      reviewResults.reduce((sum, result) => sum + result.score, 0) / reviewResults.length
    )

    const detail = reviewResults
      .map(
        (result) =>
          `【${result.aspect}】评分：${result.score}/10\n问题：\n${result.issues
            .map((issue) => `  - ${issue}`)
            .join('\n')}`
      )
      .join('\n\n')

    console.log(`[generateReport] merge ${reviewResults.length} results, avgScore=${avgScore}/10`)
    const res = await this.llm.invoke([
      new HumanMessage(
        `根据以下代码审查结果生成综合报告，包括综合评分、主要问题和改进建议：\n\n${detail}`
      ),
    ])

    return `综合评分：${avgScore}/10\n\n${res.content}`
  }

  private parseReviewJson(content: string): { issues: string[]; score: number } {
    try {
      const json = content.replace(/```json\n?|\n?```/g, '').trim()
      const parsed = JSON.parse(json)
      return {
        issues: Array.isArray(parsed.issues) ? parsed.issues : ['未返回明确问题列表'],
        score: Number.isFinite(Number(parsed.score)) ? Number(parsed.score) : 5,
      }
    } catch {
      return { issues: ['结果解析失败'], score: 5 }
    }
  }
}

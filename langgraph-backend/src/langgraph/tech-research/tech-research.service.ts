import { Injectable, OnModuleInit } from '@nestjs/common'
import { ChatOpenAI } from '@langchain/openai'
import { ChatOllama } from '@langchain/ollama';
import {
    StateGraph, START, END, Annotation,
    MemorySaver, Send, Command, interrupt,
} from '@langchain/langgraph'
import { HumanMessage } from '@langchain/core/messages'
import { config } from '../../config'

// ── 主图 State ─────────────────────────────────────────
const TechResearchState = Annotation.Root({
    question: Annotation<string>(),
    researchResults: Annotation<{
        dimension: string
        findings: string
        pros: string[]
        cons: string[]
    }[]>({
        reducer: (prev, curr) => [...prev, ...curr],
        default: () => [],
    }),
    analysis: Annotation<string>(),
    techOptions: Annotation<{ name: string; score: number; bestFor: string }[]>({
        reducer: (prev, curr) => [...prev, ...curr],
        default: () => [],
    }),
    report: Annotation<string>(),
    humanFeedback: Annotation<string>(),
    reviewStatus: Annotation<'pending' | 'approved' | 'rejected' | 'need_revision'>(),
    revisionCount: Annotation<number>({
        reducer: (prev, curr) => prev + curr,
        default: () => 0,
    }),
    executionLog: Annotation<string[]>({
        reducer: (prev, curr) => [...prev, ...curr],
        default: () => [],
    }),
})

// ── 子任务 State ───────────────────────────────────────
const SingleResearchState = Annotation.Root({
    question: Annotation<string>(),
    dimension: Annotation<string>(),
    focusPoints: Annotation<string[]>(),
})

// ── 兜底维度（LLM 解析失败时使用）────────────────────
const FALLBACK_DIMENSIONS = [
    { dimension: '技术能力与性能', focusPoints: ['功能完整性', '并发性能', '延迟表现'] },
    { dimension: '开发体验', focusPoints: ['上手难度', '调试便利性', '社区文档'] },
    { dimension: '运维与可靠性', focusPoints: ['部署复杂度', '故障处理', '监控支持'] },
]

@Injectable()
export class TechResearchService implements OnModuleInit {
    private graph: any
    private llm!: ChatOllama

    onModuleInit() {
        // 创建 chatOllama 实例
        this.llm = new ChatOllama({
            model: config.langGraph.model, // Ollama 模型名称
            temperature: config.langGraph.temperature, // 生成文本的随机程度
            baseUrl: config.langGraph.baseURL, // Ollama 服务器地址
            think: false, // 是否开启思考模式，开启后模型会先返回一个思考中的消息，等生成完成后再返回最终回答
            numPredict: 512, // 生成文本的最大 token 数量，512 是一个比较合理的值，可以根据需要调整
        });
        this.graph = this.buildGraph()
        console.log('✅ AI 技术调研助手初始化完成')
    }

    // ── 工具函数：安全解析 LLM 返回的 JSON ───────────────
    // 专门处理 LLM 返回格式不稳定的问题
    private safeParseArray<T>(
        raw: string,
        fallback: T[],
    ): T[] {
        try {
            // 去掉 markdown 代码块标记
            const clean = raw.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim()

            // 找到第一个 [ 的位置，截取数组部分
            const startIdx = clean.indexOf('[')
            const endIdx = clean.lastIndexOf(']')
            if (startIdx === -1 || endIdx === -1) throw new Error('no array found')

            const jsonStr = clean.slice(startIdx, endIdx + 1)
            const parsed = JSON.parse(jsonStr)

            // ✅ 关键：确保结果是数组
            if (!Array.isArray(parsed)) {
                console.warn('[safeParseArray] 解析结果不是数组，使用兜底数据')
                return fallback
            }
            if (parsed.length === 0) {
                console.warn('[safeParseArray] 解析结果是空数组，使用兜底数据')
                return fallback
            }
            return parsed as T[]
        } catch (e) {
            console.warn(`[safeParseArray] 解析失败: ${(e as Error).message}，使用兜底数据`)
            return fallback
        }
    }

    private safeParseObject<T>(raw: string, fallback: T): T {
        try {
            const clean = raw.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim()
            const startIdx = clean.indexOf('{')
            const endIdx = clean.lastIndexOf('}')
            if (startIdx === -1 || endIdx === -1) throw new Error('no object found')
            const parsed = JSON.parse(clean.slice(startIdx, endIdx + 1))
            if (typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('not an object')
            return parsed as T
        } catch (e) {
            console.warn(`[safeParseObject] 解析失败: ${(e as Error).message}，使用兜底数据`)
            return fallback
        }
    }

    private buildGraph() {

        // ── 节点一：解析问题，拆分调研维度 ──────────────────
        const parseTask = async (state: typeof TechResearchState.State) => {
            console.log(`\n📋 [parseTask] 开始拆分调研维度`)
            const res = await this.llm.invoke([
                new HumanMessage(
                    `你是技术分析师。把以下技术选型问题拆分成 3 个独立的调研维度。
问题：${state.question}

严格按照以下 JSON 数组格式输出，不要输出任何其他内容，不要加说明文字：
[
  {"dimension":"维度名称","focusPoints":["关注点1","关注点2"]},
  {"dimension":"维度名称","focusPoints":["关注点1","关注点2"]},
  {"dimension":"维度名称","focusPoints":["关注点1","关注点2"]}
]`
                ),
            ])

            const rawContent = res.content as string
            console.log(`   LLM 原始输出: ${rawContent.slice(0, 200)}`)

            // ✅ 使用安全解析，确保结果一定是数组
            const dimensions = this.safeParseArray<{ dimension: string; focusPoints: string[] }>(
                rawContent,
                FALLBACK_DIMENSIONS,
            )

            const list = dimensions.slice(0, 4)
            console.log(`   成功拆分为 ${list.length} 个维度:`)
            list.forEach(d => console.log(`   → ${d.dimension}`))

            return new Command({
                goto: list.map(d =>
                    new Send('researchAgent', {
                        question: state.question,
                        dimension: d.dimension,
                        focusPoints: Array.isArray(d.focusPoints) ? d.focusPoints : ['待调研'],
                    })
                ),
            })
        }

        // ── 节点二：单维度调研（多实例并行执行）──────────────
        const researchAgent = async (state: typeof SingleResearchState.State) => {
            console.log(`\n⚡ [researchAgent] 调研维度: "${state.dimension}"`)
            const res = await this.llm.invoke([
                new HumanMessage(
                    `你是技术专家。针对以下技术选型维度，给出客观分析。
原始问题：${state.question}
当前调研维度：${state.dimension}
重点关注：${state.focusPoints.join('、')}

严格按照以下 JSON 格式输出，不要输出任何其他内容：
{"findings":"主要发现，2-3句话","pros":["优势1","优势2"],"cons":["劣势1","劣势2"]}`
                ),
            ])

            const fallback = { findings: `${state.dimension}分析完成`, pros: ['待补充'], cons: ['待补充'] }
            const result = this.safeParseObject<{ findings: string; pros: string[]; cons: string[] }>(
                res.content as string,
                fallback,
            )

            // 确保 pros/cons 是数组
            if (!Array.isArray(result.pros)) result.pros = ['待补充']
            if (!Array.isArray(result.cons)) result.cons = ['待补充']
            if (!result.findings) result.findings = fallback.findings

            console.log(`   完成: ${state.dimension}`)
            return {
                researchResults: [{ dimension: state.dimension, ...result }],
                executionLog: [`✅ 完成调研：${state.dimension}`],
            }
        }

        // ── 节点三：综合分析 ──────────────────────────────
        const analyzeResults = async (state: typeof TechResearchState.State) => {
            console.log(`\n🔍 [analyzeResults] 综合分析 ${state.researchResults.length} 个维度`)
            const text = state.researchResults
                .map(r => `【${r.dimension}】\n发现：${r.findings}\n优势：${r.pros.join('、')}\n劣势：${r.cons.join('、')}`)
                .join('\n\n')

            const res = await this.llm.invoke([
                new HumanMessage(
                    `根据以下多维度调研结果，给出综合技术分析和选型建议。
原始问题：${state.question}
各维度调研结果：
${text}

严格按照以下 JSON 格式输出，不要输出任何其他内容：
{"analysis":"综合结论，2-3句话","techOptions":[{"name":"技术方案名","score":8,"bestFor":"最适合的场景"},{"name":"技术方案名","score":7,"bestFor":"最适合的场景"}]}`
                ),
            ])

            const fallback = { analysis: '综合分析完成，建议结合实际场景选型', techOptions: [] }
            const result = this.safeParseObject<{ analysis: string; techOptions: any[] }>(
                res.content as string,
                fallback,
            )

            if (!Array.isArray(result.techOptions)) result.techOptions = []

            return {
                analysis: result.analysis || fallback.analysis,
                techOptions: result.techOptions,
                executionLog: ['✅ 综合分析完成'],
            }
        }

        // ── 节点四：生成报告 ──────────────────────────────
        const generateReport = async (state: typeof TechResearchState.State) => {
            const versionNote = state.humanFeedback
                ? `\n\n重要：请根据以下修改意见重新生成报告：${state.humanFeedback}`
                : ''

            const optionsText = state.techOptions.length > 0
                ? state.techOptions.map(t => `- **${t.name}**（评分 ${t.score}/10）：${t.bestFor}`).join('\n')
                : '- 暂无明确推荐，建议结合团队实际情况决策'

            console.log(`\n📝 [generateReport] 生成第 ${state.revisionCount + 1} 版报告`)

            const res = await this.llm.invoke([
                new HumanMessage(
                    `你是技术文档专家。根据以下调研结果生成一份技术选型报告。${versionNote}

原始问题：${state.question}
综合分析：${state.analysis}
技术选项对比：
${optionsText}

要求：
- 使用 Markdown 格式
- 400-600 字
- 包含：背景说明、各维度分析摘要、技术方案对比表格、最终推荐及理由
- 语言专业，结论明确`
                ),
            ])

            return {
                report: res.content as string,
                revisionCount: state.humanFeedback ? 1 : 0,
                executionLog: [`✅ 报告生成（第 ${state.revisionCount + 1} 版）`],
            }
        }

        // ── 节点五：人工审核（interrupt 暂停）─────────────
        const humanReview = async (state: typeof TechResearchState.State) => {
            console.log(`\n⏸️  [humanReview] 等待人工审核（第 ${state.revisionCount + 1} 版）`)

            const decision = interrupt({
                type: 'report_review',
                message: `请审核技术选型报告（第 ${state.revisionCount + 1} 版）`,
                report: state.report,
                meta: {
                    question: state.question,
                    dimensionsCount: state.researchResults.length,
                    optionsCount: state.techOptions.length,
                },
                actions: {
                    approve: '批准发布',
                    revision: '需要修改（请附修改意见）',
                    reject: '拒绝',
                },
            })

            if (typeof decision === 'string') {
                console.log(`   人工决定: ${decision}`)
                return { reviewStatus: decision as any }
            }
            if ((decision as any)?.action === 'revision') {
                const feedback = (decision as any).feedback as string
                console.log(`   人工决定: 需要修改，意见: ${feedback}`)
                return { reviewStatus: 'need_revision' as const, humanFeedback: feedback }
            }
            console.log(`   人工决定: rejected`)
            return { reviewStatus: 'rejected' as const }
        }

        const routeAfterReview = (state: typeof TechResearchState.State) => {
            if (state.reviewStatus === 'approved') return END
            if (state.reviewStatus === 'need_revision') return 'generateReport'
            return END
        }

        return new StateGraph(TechResearchState)
            .addNode('parseTask', parseTask, { ends: ['researchAgent'] })
            .addNode('researchAgent', researchAgent, { ends: ['analyzeResults'] })
            .addNode('analyzeResults', analyzeResults)
            .addNode('generateReport', generateReport)
            .addNode('humanReview', humanReview)
            .addEdge(START, 'parseTask')
            .addEdge('researchAgent', 'analyzeResults')
            .addEdge('analyzeResults', 'generateReport')
            .addEdge('generateReport', 'humanReview')
            .addConditionalEdges('humanReview', routeAfterReview, {
                generateReport: 'generateReport',
                [END]: END,
            })
            .compile({ checkpointer: new MemorySaver() })
    }

    // ── 对外方法 ──────────────────────────────────────

    async startResearch(question: string, threadId: string) {
        const t0 = Date.now()
        console.log(`\n${'═'.repeat(50)}`)
        console.log(`📨 [research/start] "${question}"`)
        console.log(`   threadId: ${threadId}`)

        const result = await this.graph.invoke(
            { question },
            { configurable: { thread_id: threadId }, recursionLimit: 50 }
        )

        if (result.__interrupt__) {
            console.log(`\n⏸️  图已暂停，等待人工审核`)
            return {
                status: 'waiting_for_review',
                threadId,
                reviewData: result.__interrupt__[0].value,
                executionTime: `${Date.now() - t0}ms`,
            }
        }
        return { status: 'completed', threadId, executionTime: `${Date.now() - t0}ms` }
    }

    async approve(threadId: string) {
        console.log(`\n✅ [research/approve] threadId: ${threadId}`)
        await this.graph.invoke(
            new Command({ resume: 'approved' }),
            { configurable: { thread_id: threadId } }
        )
        const state = await this.graph.getState({ configurable: { thread_id: threadId } })
        return {
            status: 'published',
            report: state.values.report,
            executionLog: state.values.executionLog,
        }
    }

    async revise(threadId: string, feedback: string) {
        console.log(`\n✏️  [research/revise] threadId: ${threadId}`)
        console.log(`   修改意见: "${feedback}"`)
        const result = await this.graph.invoke(
            new Command({ resume: { action: 'revision', feedback } }),
            { configurable: { thread_id: threadId } }
        )
        if (result.__interrupt__) {
            return {
                status: 'waiting_for_review',
                message: '报告已修改，请重新审核',
                reviewData: result.__interrupt__[0].value,
            }
        }
        return { status: 'completed' }
    }

    async reject(threadId: string) {
        console.log(`\n❌ [research/reject] threadId: ${threadId}`)
        await this.graph.invoke(
            new Command({ resume: 'rejected' }),
            { configurable: { thread_id: threadId } }
        )
        return { status: 'rejected', message: '调研报告已拒绝' }
    }

    async getState(threadId: string) {
        const state = await this.graph.getState({ configurable: { thread_id: threadId } })
        return {
            executionLog: state.values.executionLog,
            reviewStatus: state.values.reviewStatus,
            revisionCount: state.values.revisionCount,
            nextNodes: state.next,
        }
    }
}
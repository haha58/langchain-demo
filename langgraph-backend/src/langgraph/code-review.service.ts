import { Injectable, OnModuleInit } from '@nestjs/common'
import { ChatOpenAI } from '@langchain/openai'
import {ChatOllama} from '@langchain/ollama';
import {
    StateGraph, START, END, Annotation, Send, Command,
} from '@langchain/langgraph'
import { HumanMessage } from '@langchain/core/messages'
import { config } from '../config'

const ReviewState = Annotation.Root({
    code: Annotation<string>(),
    language: Annotation<string>(),
    reviewResults: Annotation<{ aspect: string; issues: string[]; score: number }[]>({
        reducer: (prev, curr) => [...prev, ...curr],
        default: () => [],
    }),
    report: Annotation<string>(),
})

const SingleReviewState = Annotation.Root({
    code: Annotation<string>(),
    language: Annotation<string>(),
    aspect: Annotation<string>(),
    prompt: Annotation<string>(),
})

@Injectable()
export class CodeReviewService implements OnModuleInit {
    private graph: any

    onModuleInit() {
        // const llm = new ChatOpenAI({
        //     model: config.langGraph.model,
        //     apiKey: config.langGraph.apiKey,
        //     configuration: { baseURL: config.langGraph.baseURL },
        //     temperature: 0,
        // })
        // 创建 chatOllama 实例
        const llm = new ChatOllama({
            model: config.langGraph.model, // Ollama 模型名称
            temperature: config.langGraph.temperature, // 生成文本的随机程度
            baseUrl: config.langGraph.baseURL, // Ollama 服务器地址
            think: false, // 是否开启思考模式，开启后模型会先返回一个思考中的消息，等生成完成后再返回最终回答
            numPredict: 512, // 生成文本的最大 token 数量，512 是一个比较合理的值，可以根据需要调整
        }); 

        // ── 分发节点：用 Command({ goto }) 包裹 Send 数组 ──
        const dispatch = (state: typeof ReviewState.State) => {
            const tasks = [
                {
                    aspect: '安全性',
                    prompt: `检查代码安全问题（SQL 注入、XSS、敏感信息泄露等）。
输出 JSON（不要其他内容）：{"issues":["问题描述"],"score":7}`,
                },
                {
                    aspect: '性能',
                    prompt: `检查代码性能问题（算法复杂度、N+1 查询、内存泄漏等）。
输出 JSON（不要其他内容）：{"issues":["问题描述"],"score":7}`,
                },
                {
                    aspect: '代码规范',
                    prompt: `检查代码规范（命名、注释、DRY 原则、错误处理等）。
输出 JSON（不要其他内容）：{"issues":["问题描述"],"score":7}`,
                },
            ]

            console.log(`\n📋 [dispatch] 并行启动 ${tasks.length} 个审查 Agent`)
            tasks.forEach(t => console.log(`   → reviewAgent(${t.aspect})`))

            // ✅ LangGraph 1.2.x：Send 数组必须包在 Command({ goto }) 里
            return new Command({
                goto: tasks.map(t =>
                    new Send('reviewAgent', {
                        code: state.code,
                        language: state.language,
                        aspect: t.aspect,
                        prompt: t.prompt,
                    })
                ),
            })
        }

        // ── 审查节点：多个实例并行运行 ──────────────────────
        const reviewAgent = async (state: typeof SingleReviewState.State) => {
            console.log(`\n⚡ [reviewAgent] 开始审查维度: ${state.aspect}`)
            const res = await llm.invoke([
                new HumanMessage(
                    `${state.prompt}\n\n${state.language} 代码：\n\`\`\`\n${state.code}\n\`\`\``
                ),
            ])

            let parsed: { issues: string[]; score: number }
            try {
                const json = (res.content as string).replace(/```json\n?|\n?```/g, '').trim()
                parsed = JSON.parse(json)
            } catch {
                parsed = { issues: ['结果解析失败'], score: 5 }
            }

            console.log(`   完成: ${state.aspect} 评分 ${parsed.score}/10，发现 ${parsed.issues.length} 个问题`)
            return {
                reviewResults: [{ aspect: state.aspect, ...parsed }],
            }
        }

        // ── 汇总节点 ──────────────────────────────────────
        const generateReport = async (state: typeof ReviewState.State) => {
            const avgScore = Math.round(
                state.reviewResults.reduce((s, r) => s + r.score, 0) / state.reviewResults.length
            )
            console.log(`\n📊 [generateReport] 汇总 ${state.reviewResults.length} 个维度，综合评分 ${avgScore}/10`)

            const detail = state.reviewResults
                .map(r => `【${r.aspect}】评分：${r.score}/10\n问题：\n${r.issues.map(i => `  - ${i}`).join('\n')}`)
                .join('\n\n')

            const res = await llm.invoke([
                new HumanMessage(
                    `根据以下代码审查结果生成综合报告（综合评分、主要问题、改进建议）：\n\n${detail}`
                ),
            ])
            return { report: `综合评分：${avgScore}/10\n\n${res.content}` }
        }

        this.graph = new StateGraph(ReviewState)
            .addNode('dispatch', dispatch, { ends: ['reviewAgent'] })
            .addNode('reviewAgent', reviewAgent, { ends: ['generateReport'] })
            .addNode('generateReport', generateReport)
            .addEdge(START, 'dispatch')
            .addEdge('reviewAgent', 'generateReport')
            .addEdge('generateReport', END)
            .compile()

        console.log('✅ 代码审查 Multi-Agent 初始化完成')
    }

    async review(code: string, language = 'TypeScript') {
        const t0 = Date.now()
        console.log(`\n${'═'.repeat(50)}`)
        console.log(`📨 [code-review] 语言: ${language}，代码长度: ${code.length} 字符`)

        const result = await this.graph.invoke({ code, language })

        const elapsed = Date.now() - t0
        console.log(`\n✅ [完成] 耗时 ${elapsed}ms`)
        console.log(`${'═'.repeat(50)}\n`)

        return {
            language,
            reviewResults: result.reviewResults,
            report: result.report,
            totalTime: `${elapsed}ms`,
        }
    }
}
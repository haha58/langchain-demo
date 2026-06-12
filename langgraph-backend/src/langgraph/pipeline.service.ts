
import { Injectable, OnModuleInit } from '@nestjs/common'
import { ChatOpenAI } from '@langchain/openai'
import { ChatOllama } from '@langchain/ollama';
import { StateGraph, START, END, Annotation } from '@langchain/langgraph'
import { HumanMessage } from '@langchain/core/messages'
import { config } from '../config'

const PipelineState = Annotation.Root({
    topic: Annotation<string>(),
    research: Annotation<string>(),
    outline: Annotation<string>(),
    draft: Annotation<string>(),
    finalArticle: Annotation<string>(),
    progress: Annotation<string[]>({
        reducer: (prev, curr) => [...prev, ...curr],
        default: () => [],
    }),
})

@Injectable()
export class PipelineService implements OnModuleInit {
    private graph: any

    onModuleInit() {
        // const llm = new ChatOpenAI({
        //     model: config.langGraph.model,
        //     apiKey: config.langGraph.apiKey,
        //     configuration: { baseURL: config.langGraph.baseURL },
        //     temperature: 0.7,
        // })
        const llm = new ChatOllama({
            model: config.langGraph.model, // Ollama 模型名称
            temperature: config.langGraph.temperature, // 生成文本的随机程度
            baseUrl: config.langGraph.baseURL, // Ollama 服务器地址
            think: false, // 是否开启思考模式，开启后模型会先返回一个思考中的消息，等生成完成后再返回最终回答
            numPredict: 512, // 生成文本的最大 token 数量，512 是一个比较合理的值，可以根据需要调整
        });

        const researchAgent = async (state: typeof PipelineState.State) => {
            console.log(`\n📚 [researchAgent] 收集素材，主题: "${state.topic}"`)
            const res = await llm.invoke([
                new HumanMessage(`你是研究员，为主题"${state.topic}"收集素材：
                1. 背景介绍（2-3 句）
                2. 核心要点（3-5 个）
                3. 典型案例（1-2 个）
                每条不超过 50 字。`),
            ])
            return { research: res.content as string, progress: ['✅ 素材收集完成'] }
        }

        const outlineAgent = async (state: typeof PipelineState.State) => {
            console.log(`\n📋 [outlineAgent] 生成大纲`)
            const res = await llm.invoke([
                new HumanMessage(`你是内容策划，根据素材为"${state.topic}"生成大纲：
                素材：${state.research}
                格式：# 章节 / - 子项，共 3-5 章`),
            ])
            return { outline: res.content as string, progress: ['✅ 大纲生成完成'] }
        }

        const writingAgent = async (state: typeof PipelineState.State) => {
            console.log(`\n✍️  [writingAgent] 写作初稿`)
            const res = await llm.invoke([
                new HumanMessage(`你是撰稿人，根据大纲写文章（400-600 字）：
                主题：${state.topic}
                大纲：${state.outline}
                参考素材：${state.research}`),
            ])
            return { draft: res.content as string, progress: ['✅ 初稿写作完成'] }
        }

        const reviewAgent = async (state: typeof PipelineState.State) => {
            console.log(`\n🔍 [reviewAgent] 审校优化`)
            const res = await llm.invoke([
                new HumanMessage(`你是编辑，优化以下文章，直接输出优化后全文：\n${state.draft}`),
            ])
            return { finalArticle: res.content as string, progress: ['✅ 审校优化完成'] }
        }

        this.graph = new StateGraph(PipelineState)
            // 节点名用 xxxAgent，State 字段名用 xxx，两者不冲突
            .addNode('researchAgent', researchAgent)
            .addNode('outlineAgent', outlineAgent)
            .addNode('writingAgent', writingAgent)
            .addNode('reviewAgent', reviewAgent)
            .addEdge(START, 'researchAgent')
            .addEdge('researchAgent', 'outlineAgent')
            .addEdge('outlineAgent', 'writingAgent')
            .addEdge('writingAgent', 'reviewAgent')
            .addEdge('reviewAgent', END)
            .compile()

        console.log('✅ 内容创作流水线初始化完成')
    }

    async createContent(topic: string) {
        const t0 = Date.now()
        console.log(`\n${'═'.repeat(50)}`)
        console.log(`📨 [pipeline] 主题: "${topic}"`)
        const result = await this.graph.invoke({ topic })
        return {
            topic,
            progress: result.progress,
            finalArticle: result.finalArticle,
            totalTime: `${Date.now() - t0}ms`,
        }
    }
}
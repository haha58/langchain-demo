// src/langgraph/parallel.service.ts

import { Injectable, OnModuleInit } from '@nestjs/common'
import { ChatOpenAI } from '@langchain/openai';
import { ChatOllama } from '@langchain/ollama';
import { StateGraph, START, END, Annotation, Send, Command } from '@langchain/langgraph'
import { HumanMessage } from '@langchain/core/messages'
import { config } from '../config'

// 主图 State：收集所有子任务结果
const ParallelState = Annotation.Root({
    task: Annotation<string>(),
    results: Annotation<{ task: string; result: string }[]>({
        reducer: (prev, curr) => [...prev, ...curr],
        default: () => [],
    }),
    finalReport: Annotation<string>(),
})

// 子任务 State：Send 传给子节点的初始数据
const SubState = Annotation.Root({
    task: Annotation<string>(),
})

@Injectable()
export class ParallelService implements OnModuleInit {
    private graph: any

    onModuleInit() {
        // const llm = new ChatOpenAI({
        //     model: config.langGraph.model,
        //     apiKey: config.langGraph.apiKey,
        //     configuration: { baseURL: config.langGraph.baseURL },
        //     temperature: 0.5,
        // })
        // 创建 chatOllama 实例
        const llm = new ChatOllama({
            model: config.langGraph.model, // Ollama 模型名称
            temperature: config.langGraph.temperature, // 生成文本的随机程度
            baseUrl: config.langGraph.baseURL, // Ollama 服务器地址
            think: false, // 是否开启思考模式，开启后模型会先返回一个思考中的消息，等生成完成后再返回最终回答
            numPredict: 512, // 生成文本的最大 token 数量，512 是一个比较合理的值，可以根据需要调整
        });

        // 拆分节点：LangGraph 1.2.x 要求用 Command({ goto: [...] }) 包裹 Send 数组
        const splitTask = async (state: typeof ParallelState.State) => {
            const res = await llm.invoke([
                new HumanMessage(
                    `把以下任务拆成 3 个独立子任务，每个子任务单独一行，不要编号：\n\n${state.task}`
                ),
            ])
            const subTasks = (res.content as string)
                .split('\n')
                .map((t: string) => t.trim())
                .filter(Boolean)
                .slice(0, 3)

            console.log(`\n📋 [splitTask] 拆分为 ${subTasks.length} 个子任务:`)
            subTasks.forEach((t, i) => console.log(`   [${i + 1}] ${t}`))

            // ✅ LangGraph 1.2.x 修复：Send 数组必须包在 Command({ goto }) 里
            return new Command({
                goto: subTasks.map((task: string) => new Send('processSubTask', { task })),
            })
        }

        // 子任务节点：多个实例并行运行
        const processSubTask = async (state: typeof SubState.State) => {
            console.log(`\n⚡ [processSubTask] 执行子任务: "${state.task}"`)
            const res = await llm.invoke([
                new HumanMessage(`完成以下任务，100 字以内：\n${state.task}`),
            ])
            console.log(`   完成: "${(res.content as string).slice(0, 50)}..."`)
            return { results: [{ task: state.task, result: res.content as string }] }
        }

        // 汇总节点
        const mergeResults = async (state: typeof ParallelState.State) => {
            console.log(`\n📊 [mergeResults] 汇总 ${state.results.length} 个子任务结果`)
            const text = state.results
                .map((r, i) => `子任务 ${i + 1}：${r.task}\n结果：${r.result}`)
                .join('\n\n')
            const res = await llm.invoke([
                new HumanMessage(`根据以下子任务结果，生成 200 字综合报告：\n\n${text}`),
            ])
            return { finalReport: res.content as string }
        }

        this.graph = new StateGraph(ParallelState)
            .addNode('splitTask', splitTask, { ends: ['processSubTask'] })
            .addNode('processSubTask', processSubTask, { ends: ['mergeResults'] })
            .addNode('mergeResults', mergeResults)
            .addEdge(START, 'splitTask')
            .addEdge('processSubTask', 'mergeResults')
            .addEdge('mergeResults', END)
            .compile()

        console.log('✅ 并行任务工作流初始化完成')
    }

    async run(task: string) {
        const t0 = Date.now()
        console.log(`\n${'═'.repeat(50)}`)
        console.log(`📨 [parallel] 任务: "${task}"`)

        const result = await this.graph.invoke({ task })

        const elapsed = Date.now() - t0
        console.log(`\n✅ [完成] 耗时 ${elapsed}ms`)
        console.log(`${'═'.repeat(50)}\n`)

        return {
            subTasks: result.results.map((r: any) => r.task),
            results: result.results,
            finalReport: result.finalReport,
            totalTime: `${elapsed}ms`,
        }
    }
}

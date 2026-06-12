// src/langgraph/routing.service.ts

import { Injectable, OnModuleInit } from '@nestjs/common'
import { ChatOpenAI } from '@langchain/openai'
import { ChatOllama } from '@langchain/ollama';
import { StateGraph, START, END, Annotation } from '@langchain/langgraph'
import { HumanMessage } from '@langchain/core/messages'
import { config } from '../config'

const RoutingState = Annotation.Root({
    userInput: Annotation<string>(),
    category: Annotation<string>(),   // classify 写入，路由函数读取
    response: Annotation<string>(),   // 各处理节点写入
})

@Injectable()
export class RoutingService implements OnModuleInit {
    private graph: any

    onModuleInit() {
        // const llm = new ChatOpenAI({
        //   model:         config.langGraph.model,
        //   apiKey:        config.langGraph.apiKey,
        //   configuration: { baseURL: config.langGraph.baseURL },
        //   temperature:   0,
        // })
        // 创建 chatOllama 实例
        const llm = new ChatOllama({
            model: config.langGraph.model, // Ollama 模型名称
            temperature: 0 || config.langGraph.temperature, // 生成文本的随机程度
            baseUrl: config.langGraph.baseURL, // Ollama 服务器地址
            think: false, // 是否开启思考模式，开启后模型会先返回一个思考中的消息，等生成完成后再返回最终回答
            numPredict: 512, // 生成文本的最大 token 数量，512 是一个比较合理的值，可以根据需要调整
        });

        const classify = async (state: typeof RoutingState.State) => {
            const res = await llm.invoke([
                new HumanMessage(`把用户问题分类，只输出类别名，不要其他内容：
            - technical（技术/编程类）
            - pricing（价格/费用类）
            - general（其他）

            用户问题：${state.userInput}`),
            ])
            const cat = (res.content as string).trim().toLowerCase()
            const valid = ['technical', 'pricing', 'general']
            // 如果 LLM 返回了无效值，兜底用 general
            return { category: valid.includes(cat) ? cat : 'general' }
        }

        // 路由函数：直接返回 state.category，条件边以此决定走哪个节点
        const routeByCategory = (state: typeof RoutingState.State) => state.category

        // 用工厂函数创建不同角色的处理节点，避免重复代码
        const makeHandler = (systemPrompt: string) =>
            async (state: typeof RoutingState.State) => {
                const res = await llm.invoke([
                    new HumanMessage(`${systemPrompt}\n\n用户问题：${state.userInput}`),
                ])
                return { response: res.content as string }
            }

        this.graph = new StateGraph(RoutingState)
            .addNode('classify', classify)
            .addNode('technical', makeHandler('你是技术专家，给出专业的技术解答。'))
            .addNode('pricing', makeHandler('你是商务专员，友好回答，具体价格引导联系 dawei@example.com。'))
            .addNode('general', makeHandler('你是客服，友好回答用户问题。'))
            .addEdge(START, 'classify')
            .addConditionalEdges('classify', routeByCategory, {
                technical: 'technical',
                pricing: 'pricing',
                general: 'general',
            })
            .addEdge('technical', END)
            .addEdge('pricing', END)
            .addEdge('general', END)
            .compile()
    }

    async handle(userInput: string) {
        const result = await this.graph.invoke({ userInput })
        return {
            input: userInput,
            category: result.category,
            response: result.response,
        }
    }
}
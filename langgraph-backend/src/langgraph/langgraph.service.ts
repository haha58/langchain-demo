import { Injectable, OnModuleInit } from '@nestjs/common'
import { ChatOpenAI } from '@langchain/openai'
import { ChatOllama } from '@langchain/ollama';
import {
  StateGraph, START, END, MessagesAnnotation, MemorySaver,
} from '@langchain/langgraph'
import { HumanMessage, SystemMessage } from '@langchain/core/messages'
import { config } from '../config'

@Injectable()
export class LanggraphService implements OnModuleInit {
  private simpleGraph: any
  private memoryGraph: any

  onModuleInit() {
    // const llm = new ChatOpenAI({
    //   model:         config.langGraph.model,
    //   apiKey:        config.langGraph.apiKey,
    //   configuration: { baseURL: config.langGraph.baseURL },
    //   temperature:   config.langGraph.temperature,
    // })
    // 创建 chatOllama 实例
    const llm = new ChatOllama({
      model: config.langGraph.model, // Ollama 模型名称
      temperature: config.langGraph.temperature, // 生成文本的随机程度
      baseUrl: config.langGraph.baseURL, // Ollama 服务器地址
      think: false, // 是否开启思考模式，开启后模型会先返回一个思考中的消息，等生成完成后再返回最终回答
      numPredict: 512, // 生成文本的最大 token 数量，512 是一个比较合理的值，可以根据需要调整
    });

    // 工作流一：无记忆
    const callModel = async (state: typeof MessagesAnnotation.State) => {
      const response = await llm.invoke(state.messages)
      return { messages: [response] }
    }

    this.simpleGraph = new StateGraph(MessagesAnnotation)
      .addNode('callModel', callModel)
      .addEdge(START, 'callModel')
      .addEdge('callModel', END)
      .compile()

    // 工作流二：有记忆
    const callModelWithMemory = async (state: typeof MessagesAnnotation.State) => {
      const messages = [
        new SystemMessage('你是专业的 AI 助手，请记住对话上下文。'),
        ...state.messages,
      ]
      const response = await llm.invoke(messages)
      return { messages: [response] }
    }

    this.memoryGraph = new StateGraph(MessagesAnnotation)
      .addNode('callModel', callModelWithMemory)
      .addEdge(START, 'callModel')
      .addEdge('callModel', END)
      .compile({ checkpointer: new MemorySaver() })

    console.log(`✅ LanggraphService 初始化完成，模型：${config.langGraph.model}`)
  }

  async simpleChat(message: string): Promise<string> {
    const result = await this.simpleGraph.invoke({
      messages: [
        new SystemMessage('你是专业的 AI 助手，回答简洁清晰。'),
        new HumanMessage(message),
      ],
    })
    return result.messages.at(-1).content as string
  }

  async memoryChat(threadId: string, message: string): Promise<string> {
    const result = await this.memoryGraph.invoke(
      { messages: [new HumanMessage(message)] },
      { configurable: { thread_id: threadId } },
    )
    return result.messages.at(-1).content as string
  }

  async getHistory(threadId: string) {
    const state = await this.memoryGraph.getState({
      configurable: { thread_id: threadId },
    })
    return (state.values.messages ?? []).map((m: any, i: number) => ({
      index: i,
      role: m._getType?.() === 'human' ? 'user' : 'assistant',
      content: m.content,
    }))
  }
}

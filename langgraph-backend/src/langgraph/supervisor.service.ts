import { Injectable, OnModuleInit } from '@nestjs/common'
import { ChatOpenAI } from '@langchain/openai'
import {ChatOllama} from '@langchain/ollama';
import {
  StateGraph, START, END, MessagesAnnotation, Annotation,
} from '@langchain/langgraph'
import { HumanMessage, SystemMessage, AIMessage } from '@langchain/core/messages'
import { config } from '../config'

const SupervisorState = Annotation.Root({
  messages:        MessagesAnnotation.spec.messages,
  nextAgent:       Annotation<string>(),
  completedAgents: Annotation<string[]>({
    reducer: (prev, curr) => [...prev, ...curr],
    default: () => [],
  }),
})

@Injectable()
export class SupervisorService implements OnModuleInit {
  private graph: any

  onModuleInit() {
    // const llm = new ChatOpenAI({
    //   model:         config.langGraph.model,
    //   apiKey:        config.langGraph.apiKey,
    //   configuration: { baseURL: config.langGraph.baseURL },
    //   temperature:   0,
    // });
    // 创建 chatOllama 实例
    const llm = new ChatOllama({
        model: config.langGraph.model, // Ollama 模型名称
        temperature: config.langGraph.temperature, // 生成文本的随机程度
        baseUrl: config.langGraph.baseURL, // Ollama 服务器地址
        think: false, // 是否开启思考模式，开启后模型会先返回一个思考中的消息，等生成完成后再返回最终回答
        numPredict: 512, // 生成文本的最大 token 数量，512 是一个比较合理的值，可以根据需要调整
    }); 

    const supervisor = async (state: typeof SupervisorState.State) => {
      const done = state.completedAgents.length
        ? `已完成：${state.completedAgents.join('、')}`
        : '尚未调用任何 Agent'
      const res = await llm.invoke([
        new SystemMessage(`你是任务协调者，管理以下专业 Agent：
        - researcher：收集信息、搜索资料
        - analyst：数据分析、逻辑推理
        - writer：撰写报告、优化表达

        规则：
        1. 根据任务需求选择合适的 Agent
        2. ${done}
        3. 所有必要工作完成后输出 FINISH
        4. 只输出下一个 Agent 名称或 FINISH，不要其他内容

        可选值：researcher | analyst | writer | FINISH`),
        ...state.messages,
      ])
      const next     = (res.content as string).trim()
      const valid    = ['researcher', 'analyst', 'writer', 'FINISH']
      const safeNext = valid.includes(next) ? next : 'FINISH'
      return {
        nextAgent: safeNext,
        messages:  [new AIMessage(`[Supervisor] 下一步 → ${safeNext}`)],
      }
    }

    const createWorker = (name: string, prompt: string) =>
      async (state: typeof SupervisorState.State) => {
        const userMsg = state.messages.find((m: any) => m._getType?.() === 'human')
        const context = state.messages.slice(-4).map((m: any) => m.content).join('\n')
        const res = await llm.invoke([
          new SystemMessage(prompt),
          new HumanMessage(`任务：${userMsg?.content ?? ''}\n\n当前上下文：\n${context}`),
        ])
        return {
          messages:        [new AIMessage(`[${name}] ${res.content}`)],
          completedAgents: [name],
        }
      }

    this.graph = new StateGraph(SupervisorState)
      .addNode('supervisor', supervisor)
      .addNode('researcher', createWorker('researcher', '你是研究员，擅长收集整理信息。'))
      .addNode('analyst',    createWorker('analyst',    '你是分析师，擅长数据分析和推理。'))
      .addNode('writer',     createWorker('writer',     '你是写作专家，擅长生成清晰报告。'))
      .addEdge(START, 'supervisor')
      .addConditionalEdges('supervisor',
        (s) => s.nextAgent === 'FINISH' ? END : s.nextAgent,
        { researcher: 'researcher', analyst: 'analyst', writer: 'writer', [END]: END }
      )
      .addEdge('researcher', 'supervisor')
      .addEdge('analyst',    'supervisor')
      .addEdge('writer',     'supervisor')
      .compile()
  }

  async run(userInput: string) {
    const result  = await this.graph.invoke(
      { messages: [new HumanMessage(userInput)] },
      { recursionLimit: 30 }
    )
    const msgs     = result.messages as AIMessage[]
    const agentLog = msgs
      .filter((m: any) => typeof m.content === 'string' && m.content.startsWith('['))
      .map((m: any) => m.content as string)
    const writers     = agentLog.filter(l => l.startsWith('[writer]'))
    const finalReport = writers.length
      ? writers.at(-1)!.replace('[writer] ', '')
      : agentLog.at(-1) ?? '无输出'
    return { agentLog, completedAgents: result.completedAgents, finalReport }
  }
}

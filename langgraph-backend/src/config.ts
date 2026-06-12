/**
 * 统一配置文件
 *
 * 本地开发：设置 OLLAMA_BASE_URL=http://localhost:11434/v1，模型用 qwen3:8b
 * 生产环境：切换为云端 API（DeepSeek / OpenAI 等），只需改 .env，代码不动
 */
export const config = {
  app: {
    port:    parseInt(process.env.PORT || '3000', 10),
    nodeEnv: process.env.NODE_ENV || 'development',
  },

  langGraph: {
    // 模型名称
    // 本地：qwen3:8b | qwen3:4b
    // 云端：deepseek-chat | gpt-4o-mini 等
    model: 'qwen3:8b',
    //  model: process.env.LANGGRAPH_MODEL || 'qwen3:8b',
    // API BaseURL
    // 本地 Ollama：http://localhost:11434/v1
    // DeepSeek：   https://api.deepseek.com/v1
    // OpenAI：     https://api.openai.com/v1
    baseURL: 'http://localhost:11434',
    // baseURL: 'http://localhost:11434/v1',
    // baseURL: process.env.OLLAMA_BASE_URL || 'http://localhost:11434/v1',

    // API Key
    // Ollama 不校验 key，填占位符 'ollama' 即可
    // 云端 API 填真实 key
    apiKey: 'ollama',
    // apiKey: process.env.OLLAMA_API_KEY || 'ollama',
    // 温度（0=确定性输出，1=创意输出）
    temperature: 0.7,
  },

  cors: {
    // 允许的前端地址，多个用逗号分隔
    origins: (process.env.ALLOWED_ORIGINS || 'http://localhost:5173,http://localhost:5174,http://localhost:5175').split(','),
  },
}

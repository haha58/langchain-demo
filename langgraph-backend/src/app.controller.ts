import { Controller, Get } from '@nestjs/common'
import { config }          from './config'

@Controller()
export class AppController {
  /** 健康检查 - Docker / Vercel / 运维监控用 */
  @Get('health')
  health() {
    return {
      status:    'ok',
      timestamp: new Date().toISOString(),
      model:     config.langGraph.model,
      baseURL:   config.langGraph.baseURL,
      env:       config.app.nodeEnv,
    }
  }
}

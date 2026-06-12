import { Module }            from '@nestjs/common'
import { ConfigModule }       from '@nestjs/config'
import { AppController }      from './app.controller'
import { LanggraphModule }    from './langgraph/langgraph.module'
import { TechResearchModule } from './langgraph/tech-research/tech-research.module'
import { WorkflowModule }     from './edit/workflow.module'

@Module({
  imports: [
    // 加载 .env 文件（开发环境）
    ConfigModule.forRoot({ isGlobal: true }),
    LanggraphModule,
    TechResearchModule,
    WorkflowModule,
  ],
  controllers: [AppController],
})
export class AppModule {}

import { Controller, Post, Get, Body, Param } from '@nestjs/common'
import { TechResearchService } from './tech-research.service'

@Controller('langgraph/research')
export class TechResearchController {
  constructor(private readonly svc: TechResearchService) {}

  @Post('start')
  start(@Body() body: { question: string; threadId: string }) {
    return this.svc.startResearch(body.question, body.threadId)
  }

  @Post(':threadId/approve')
  approve(@Param('threadId') threadId: string) {
    return this.svc.approve(threadId)
  }

  @Post(':threadId/revise')
  revise(
    @Param('threadId') threadId: string,
    @Body() body: { feedback: string },
  ) {
    return this.svc.revise(threadId, body.feedback)
  }

  @Post(':threadId/reject')
  reject(@Param('threadId') threadId: string) {
    return this.svc.reject(threadId)
  }

  @Get(':threadId/state')
  getState(@Param('threadId') threadId: string) {
    return this.svc.getState(threadId)
  }
}

import { Module } from '@nestjs/common'
import { TechResearchController } from './tech-research.controller'
import { TechResearchService }    from './tech-research.service'

@Module({
  controllers: [TechResearchController],
  providers:   [TechResearchService],
  exports:     [TechResearchService],
})
export class TechResearchModule {}

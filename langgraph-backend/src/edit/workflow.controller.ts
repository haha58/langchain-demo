import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  HttpCode,
  HttpStatus,
} from '@nestjs/common'
import { WorkflowService } from './workflow.service'
import { SaveWorkflowDto, RunWorkflowDto, RunDirectDto, TestNodeDto } from './workflow.dto'

/**
 * 工作流编排 REST 接口
 *
 * POST   /workflow          → 保存（新建）工作流
 * GET    /workflow          → 获取所有工作流列表
 * GET    /workflow/:id      → 获取单个工作流详情
 * PUT    /workflow/:id      → 更新工作流（覆盖节点/边）
 * DELETE /workflow/:id      → 删除工作流
 * POST   /workflow/:id/run  → 执行工作流
 */
@Controller('workflow')
export class WorkflowController {
  constructor(private readonly svc: WorkflowService) {}

  // ── 新建 ──────────────────────────────────────────────────────────────────
  @Post()
  create(@Body() dto: SaveWorkflowDto) {
    return this.svc.create(dto)
  }

  // ── 列表 ──────────────────────────────────────────────────────────────────
  @Get()
  findAll() {
    return this.svc.findAll()
  }

  // ── 详情 ──────────────────────────────────────────────────────────────────
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.svc.findOne(id)
  }

  // ── 更新 ──────────────────────────────────────────────────────────────────
  @Put(':id')
  update(@Param('id') id: string, @Body() dto: SaveWorkflowDto) {
    return this.svc.update(id, dto)
  }

  // ── 删除 ──────────────────────────────────────────────────────────────────
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id') id: string) {
    this.svc.remove(id)
  }

  // ── 执行 ──────────────────────────────────────────────────────────────────
  @Post(':id/run')
  run(@Param('id') id: string, @Body() dto: RunWorkflowDto) {
    return this.svc.run(id, dto.input ?? '')
  }

  // ── 免存直接执行（传入完整 nodes + edges）────────────────────────────────
  @Post('run-direct')
  runDirect(@Body() dto: RunDirectDto) {
    return this.svc.runDirect(dto.nodes, dto.edges, dto.input ?? '')
  }

  // ── 单节点测试（不依赖已保存的工作流） ────────────────────────────────────
  @Post('test-node')
  testNode(@Body() dto: TestNodeDto) {
    return this.svc.testNode(dto.nodeData, dto.input ?? '')
  }
}

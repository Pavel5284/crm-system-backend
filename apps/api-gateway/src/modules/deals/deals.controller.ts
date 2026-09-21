import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import * as shared from '@app/shared';
import { DealsService } from './deals.service';
import { ChangeDealStageDto } from './dto/change-deal-stage.dto';
import { CreateDealDto } from './dto/create-deal.dto';
import { ImportDealDto } from './dto/import-deal.dto';
import { UpdateDealDto } from './dto/update-deal.dto';
import { UpdateMainCommentDto } from './dto/update-main-comment.dto';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

@ApiTags('deals')
@Controller('deals')
export class DealsController {
  constructor(private readonly dealsService: DealsService) {}

  @Get()
  findAll() {
    return this.dealsService.findAll();
  }

  @Get('allowed-transitions')
  allowedTransitions(@CurrentUser() user: shared.AuthUser) {
    return this.dealsService.getAllowedTransitions(user);
  }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.dealsService.findOne(id);
  }

  @Post()
  @Roles(...shared.DEAL_PERMISSIONS.DEALS_CREATE)
  create(@Body() dto: CreateDealDto) {
    return this.dealsService.create(dto);
  }

  @Post('import')
  @Roles(...shared.DEAL_PERMISSIONS.DEALS_IMPORT)
  import(@Body() dto: ImportDealDto) {
    return this.dealsService.import(dto);
  }

  @Patch(':id/stage')
  changeStage(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ChangeDealStageDto,
    @CurrentUser() user: shared.AuthUser,
  ) {
    return this.dealsService.changeStage(id, dto, user);
  }

  @Patch(':id')
  @Roles(...shared.DEAL_PERMISSIONS.DEALS_UPDATE)
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateDealDto) {
    return this.dealsService.update(id, dto);
  }

  @Patch(':id/main-comment')
  @Roles(Role.ADMIN, Role.MANAGER)
  updateMainComment(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateMainCommentDto,
  ) {
    return this.dealsService.updateMainComment(id, dto);
  }

  @Delete(':id')
  @Roles(...shared.DEAL_PERMISSIONS.DEALS_DELETE)
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Param('id', ParseUUIDPipe) id: string) {
    await this.dealsService.remove(id);
  }
}

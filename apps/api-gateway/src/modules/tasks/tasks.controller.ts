import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { ApiTags } from '@nestjs/swagger';
import * as shared from '@app/shared';
import { CreateTaskDto } from './dto/create-task.dto';
import { UpdateTaskDto } from './dto/update-task.dto';
import { QueryTaskDto } from './dto/query-task.dto';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

@ApiTags('tasks')
@Controller('tasks')
export class TasksController {
  constructor(
    @Inject('TASKS_SERVICE') private readonly tasksClient: ClientProxy,
  ) {}

  @Post()
  create(@Body() dto: CreateTaskDto, @CurrentUser('id') authorId: string) {
    return shared.sendRpc(this.tasksClient, shared.TASK_PATTERNS.CREATE, {
      ...dto,
      authorId,
    });
  }

  @Get()
  findAll(@Query() query: QueryTaskDto) {
    return shared.sendRpc(
      this.tasksClient,
      shared.TASK_PATTERNS.FIND_ALL,
      query,
    );
  }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return shared.sendRpc(this.tasksClient, shared.TASK_PATTERNS.FIND_ONE, id);
  }

  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateTaskDto,
    @CurrentUser() requester: shared.AuthUser,
  ) {
    return shared.sendRpc(this.tasksClient, shared.TASK_PATTERNS.UPDATE, {
      id,
      data: dto,
      requester,
    });
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() requester: shared.AuthUser,
  ) {
    return shared.sendRpc(this.tasksClient, shared.TASK_PATTERNS.REMOVE, {
      id,
      requester,
    });
  }
}

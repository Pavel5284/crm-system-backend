import { Controller, Get, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Role } from '@prisma/client';
import { Public } from '@app/shared';
import { Roles } from '../auth/decorators/roles.decorator';
import { DemoService } from './demo.service';

@ApiTags('demo')
@Controller('demo')
export class DemoController {
  constructor(private readonly demoService: DemoService) {}

  // Публичный статус: фронт по нему решает, показывать ли demo-вход.
  // Данных для перебора нет — только наличие трёх фиксированных аккаунтов.
  @Public()
  @Get('status')
  status() {
    return this.demoService.getStatus();
  }

  // Полный ресид демо-скоупа (боевые данные не трогает, юзеров не удаляет).
  // Только ADMIN + жёсткий троттлинг: операция тяжёлая.
  @Roles(Role.ADMIN)
  @Throttle({ default: { limit: 3, ttl: 3_600_000, blockDuration: 600_000 } })
  @HttpCode(HttpStatus.OK)
  @Post('reset')
  reset() {
    return this.demoService.resetDemo();
  }
}

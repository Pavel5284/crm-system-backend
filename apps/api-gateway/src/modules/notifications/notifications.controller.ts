import {
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpException,
  HttpStatus,
  Inject,
  Param,
  ParseUUIDPipe,
  Patch,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ClientProxy } from '@nestjs/microservices';
import { ApiTags } from '@nestjs/swagger';
import { Logger } from '@nestjs/common';
import { NOTIFICATION_PATTERNS, sendRpc } from '@app/shared';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

@ApiTags('notifications')
@Controller('notifications')
export class NotificationsController {
  private readonly logger = new Logger(NotificationsController.name);

  constructor(
    @Inject('NOTIFICATIONS_SERVICE')
    private readonly notificationsClient: ClientProxy,
    private readonly configService: ConfigService,
  ) {}

  // Free-план Render усыпляет notifications-service (очередь RMQ не будит).
  // При таймауте RPC пинаем его публичный /health по HTTP — это будит
  // контейнер — и отдаём 503, чтобы фронт автоматически повторил запрос.
  private async sendNotificationsRpc<TResult>(
    pattern: string,
    payload: unknown,
  ): Promise<TResult> {
    try {
      return await sendRpc<TResult>(this.notificationsClient, pattern, payload);
    } catch (error) {
      const status = error instanceof HttpException ? error.getStatus() : null;
      if (status !== HttpStatus.GATEWAY_TIMEOUT) throw error;
      this.wakeNotificationsService();
      throw new HttpException(
        'Сервис уведомлений просыпается, запрос повторится автоматически',
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
  }

  private wakeNotificationsService(): void {
    const baseUrl = this.configService.get<string>(
      'NOTIFICATIONS_SERVICE_HEALTH_URL',
    );
    if (!baseUrl) {
      this.logger.warn(
        'NOTIFICATIONS_SERVICE_HEALTH_URL не задан — автопробуждение пропущено',
      );
      return;
    }
    const url = `${baseUrl.replace(/\/$/, '')}/health`;
    const startedAt = Date.now();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    fetch(url, { signal: controller.signal })
      .then((res) => {
        this.logger.log(
          `Wake ping ${url} -> ${res.status} за ${Date.now() - startedAt}мс`,
        );
      })
      .catch((e) => {
        this.logger.warn(
          `Wake ping ${url} не удался за ${Date.now() - startedAt}мс: ${String((e as Error)?.message ?? e)}`,
        );
      })
      .finally(() => clearTimeout(timer));
  }

  @Get()
  findMine(@CurrentUser('id') userId: string) {
    return this.sendNotificationsRpc(NOTIFICATION_PATTERNS.FIND_MINE, {
      userId,
    });
  }

  @Patch('read-all')
  markAllRead(@CurrentUser('id') userId: string) {
    return this.sendNotificationsRpc(NOTIFICATION_PATTERNS.MARK_ALL_READ, {
      userId,
    });
  }

  @Patch(':id/read')
  markRead(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.sendNotificationsRpc(NOTIFICATION_PATTERNS.MARK_READ, {
      id,
      userId,
    });
  }

  @Delete('read')
  @HttpCode(HttpStatus.OK)
  deleteRead(@CurrentUser('id') userId: string) {
    return this.sendNotificationsRpc(NOTIFICATION_PATTERNS.DELETE_READ, {
      userId,
    });
  }
}

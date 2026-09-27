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

// Free-план Render усыпляет notifications-service (очередь RMQ не будит),
// холодный старт занимает 30–60с. Поэтому: будим сервис проактивно при
// каждом запросе (пинг /health стартует контейнер уже в t=0, а не после
// 15с RPC-таймаута), а при таймауте ждём пробуждения (poll /health)
// и повторяем RPC — один запрос возвращает данные вместо 503.
// Если сервис так и не проснулся — отдаём 503, фронт повторит запрос.
const HEALTH_POLL_INTERVAL_MS = 5_000;
const HEALTH_WAIT_BUDGET_MS = 60_000;
const HEALTH_FETCH_TIMEOUT_MS = 8_000;

// Принимаем и `https://xxx.onrender.com`, и `.../health` целиком.
function resolveHealthUrl(raw: string | undefined): string | null {
  if (!raw) return null;
  const trimmed = raw.trim().replace(/\/+$/, '');
  if (!trimmed) return null;
  return trimmed.endsWith('/health') ? trimmed : `${trimmed}/health`;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

@ApiTags('notifications')
@Controller('notifications')
export class NotificationsController {
  private readonly logger = new Logger(NotificationsController.name);
  private wakeMisconfiguredWarned = false;

  constructor(
    @Inject('NOTIFICATIONS_SERVICE')
    private readonly notificationsClient: ClientProxy,
    private readonly configService: ConfigService,
  ) {}

  private async sendNotificationsRpc<TResult>(
    pattern: string,
    payload: unknown,
  ): Promise<TResult> {
    // Проактивно: холодный старт начинается сразу, fire-and-forget.
    this.wakeNotificationsService();
    try {
      return await sendRpc<TResult>(this.notificationsClient, pattern, payload);
    } catch (error) {
      const status = error instanceof HttpException ? error.getStatus() : null;
      if (status !== HttpStatus.GATEWAY_TIMEOUT) throw error;
      this.logger.log(
        'notifications-service не ответил за 15с — ждём пробуждения и повторяем RPC',
      );
      this.wakeNotificationsService();
      const healthy = await this.waitForHealthy();
      if (healthy) {
        try {
          return await sendRpc<TResult>(
            this.notificationsClient,
            pattern,
            payload,
          );
        } catch (retryError) {
          this.logger.warn(
            `Повторный RPC к notifications-service не удался: ${String(
              (retryError as Error)?.message ?? retryError,
            )}`,
          );
        }
      }
      throw new HttpException(
        'Сервис уведомлений просыпается, запрос повторится автоматически',
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
  }

  private resolveNotificationsHealthUrl(): string | null {
    return resolveHealthUrl(
      this.configService.get<string>('NOTIFICATIONS_SERVICE_HEALTH_URL'),
    );
  }

  private wakeNotificationsService(): void {
    const url = this.resolveNotificationsHealthUrl();
    if (!url) {
      if (!this.wakeMisconfiguredWarned) {
        this.wakeMisconfiguredWarned = true;
        this.logger.warn(
          'NOTIFICATIONS_SERVICE_HEALTH_URL не задан — автопробуждение пропущено',
        );
      }
      return;
    }
    const startedAt = Date.now();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), HEALTH_FETCH_TIMEOUT_MS);
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

  // Ждём, пока /health начнёт отвечать 2xx (контейнер проснулся).
  private async waitForHealthy(
    budgetMs: number = HEALTH_WAIT_BUDGET_MS,
  ): Promise<boolean> {
    const url = this.resolveNotificationsHealthUrl();
    if (!url) return false;
    const startedAt = Date.now();
    while (Date.now() - startedAt < budgetMs) {
      if (await this.pingHealth(url)) return true;
      await sleep(HEALTH_POLL_INTERVAL_MS);
    }
    return false;
  }

  private async pingHealth(url: string): Promise<boolean> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), HEALTH_FETCH_TIMEOUT_MS);
    try {
      const res = await fetch(url, { signal: controller.signal });
      return res.ok;
    } catch {
      return false;
    } finally {
      clearTimeout(timer);
    }
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

import {
  Inject,
  Logger,
  Module,
  OnModuleDestroy,
  Optional,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

export const REDIS_CLIENT = 'REDIS_CLIENT';

/**
 * Shared Redis/Valkey клиент.
 * Без VALKEY_URL провайдит null — throttling откатывается на in-memory,
 * BullMQ отключается (как раньше), приложение стартует.
 */
@Module({
  providers: [
    {
      provide: REDIS_CLIENT,
      useFactory: (config: ConfigService): Redis | null => {
        const url = config.get<string>('VALKEY_URL') || process.env.VALKEY_URL;
        if (!url) return null;
        const client = new Redis(url, {
          maxRetriesPerRequest: 1,
          enableReadyCheck: true,
          lazyConnect: false,
        });
        client.on('error', (err: Error) => {
          new Logger('Redis').warn(`Redis error: ${err.message}`);
        });
        return client;
      },
      inject: [ConfigService],
    },
  ],
  exports: [REDIS_CLIENT],
})
export class RedisModule implements OnModuleDestroy {
  constructor(
    @Optional() @Inject(REDIS_CLIENT) private readonly client: Redis | null,
  ) {}

  async onModuleDestroy() {
    if (this.client) {
      await this.client.quit().catch(() => undefined);
    }
  }
}

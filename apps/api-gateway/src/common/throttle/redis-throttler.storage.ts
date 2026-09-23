import {
  Inject,
  Injectable,
  Logger,
  OnModuleDestroy,
  Optional,
} from '@nestjs/common';
import type { ThrottlerStorage } from '@nestjs/throttler';
import type { ThrottlerStorageRecord } from '@nestjs/throttler/dist/throttler-storage-record.interface';
import Redis from 'ioredis';
import { REDIS_CLIENT } from '../redis/redis.module';

/**
 * Распределенное хранилище счетчиков @nestjs/throttler на Redis/Valkey.
 * Без VALKEY_URL клиент null — фабрика в app.module подменяет storage
 * на штатное in-memory хранилище.
 *
 * Семантика сверена с ThrottlerStorageService (in-memory):
 * блокировка включается когда totalHits > limit.
 */
@Injectable()
export class RedisThrottlerStorage
  implements ThrottlerStorage, OnModuleDestroy
{
  private readonly logger = new Logger(RedisThrottlerStorage.name);

  constructor(
    @Optional() @Inject(REDIS_CLIENT) private readonly redis: Redis | null,
  ) {}

  get isEnabled(): boolean {
    return this.redis !== null && this.redis !== undefined;
  }

  async onModuleDestroy() {
    // Клиент принадлежит RedisModule и закрывается там.
    // Здесь ничего не делаем, чтобы не рвать shared-соединение.
  }

  async increment(
    key: string,
    ttl: number,
    limit: number,
    blockDuration: number,
    throttlerName: string,
  ): Promise<ThrottlerStorageRecord> {
    if (!this.redis) {
      return {
        totalHits: 0,
        timeToExpire: Math.ceil(ttl / 1000),
        isBlocked: false,
        timeToBlockExpire: 0,
      };
    }

    const counterKey = `throttle:${throttlerName}:${key}`;
    const blockKey = `throttle:${throttlerName}:${key}:blocked`;

    try {
      const blockedTtl = await this.redis.pttl(blockKey);
      if (blockedTtl > 0) {
        const ttlMs = await this.redis.pttl(counterKey);
        return {
          totalHits: limit + 1,
          timeToExpire: ttlMs > 0 ? Math.ceil(ttlMs / 1000) : 0,
          isBlocked: true,
          timeToBlockExpire: Math.ceil(blockedTtl / 1000),
        };
      }

      // Fixed window: INCR + PEXPIRE на первом хите.
      const totalHits = await this.redis.incr(counterKey);
      if (totalHits === 1) {
        await this.redis.pexpire(counterKey, ttl);
      }
      const pttl = await this.redis.pttl(counterKey);
      // Ключ мог протухнуть между INCR и PTTL при крошечных ttl —
      // считаем окно заново, не блокируем.
      if (pttl < 0) {
        return {
          totalHits,
          timeToExpire: 0,
          isBlocked: false,
          timeToBlockExpire: 0,
        };
      }

      if (totalHits > limit) {
        await this.redis.psetex(blockKey, blockDuration, '1');
        return {
          totalHits,
          timeToExpire: Math.ceil(pttl / 1000),
          isBlocked: true,
          timeToBlockExpire: Math.ceil(blockDuration / 1000),
        };
      }

      return {
        totalHits,
        timeToExpire: Math.ceil(pttl / 1000),
        isBlocked: false,
        timeToBlockExpire: 0,
      };
    } catch (err) {
      // Redis недоступен — fail-open для доступности,
      // перебор при этом душит блокировка аккаунта в БД.
      this.logger.warn(
        `Redis increment failed, fail-open: ${(err as Error).message}`,
      );
      return {
        totalHits: 0,
        timeToExpire: Math.ceil(ttl / 1000),
        isBlocked: false,
        timeToBlockExpire: 0,
      };
    }
  }
}

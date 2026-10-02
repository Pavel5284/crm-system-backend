import {
  ForbiddenException,
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  DEFAULT_DEMO_PASSWORD,
  DemoSeedStats,
  PrismaService,
  clearDemoData,
  seedDemoData,
} from '@app/database';
import {
  DEMO_DELETE_FORBIDDEN_MESSAGE,
  DEMO_USER_EMAILS,
  DEMO_USER_ROLES,
  isDemoEmail,
} from '@app/shared';

export const DEFAULT_DEMO_RESET_TZ = 'Europe/Moscow';

// Смещение зоны от UTC в мс на момент dateMs (через wall-clock трюк с Intl).
function tzOffsetMs(dateMs: number, timeZone: string): number {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone,
      hour12: false,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    })
      .formatToParts(new Date(dateMs))
      .map((p) => [p.type, p.value]),
  );
  const asUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour) % 24,
    Number(parts.minute),
    Number(parts.second),
  );
  return asUtc - dateMs;
}

// Мс от nowMs до ближайшей следующей полуночи в timeZone.
// Ровно в полночь вернёт 24ч (сброс раз в сутки, а не два подряд).
export function msUntilNextMidnight(nowMs: number, timeZone: string): number {
  const wallNow = new Date(nowMs + tzOffsetMs(nowMs, timeZone));
  const nextMidnightWall = Date.UTC(
    wallNow.getUTCFullYear(),
    wallNow.getUTCMonth(),
    wallNow.getUTCDate() + 1,
  );
  // Уточняем offset на момент цели — для зон с DST.
  const targetUtc =
    nextMidnightWall -
    tzOffsetMs(nextMidnightWall - tzOffsetMs(nowMs, timeZone), timeZone);
  const diff = targetUtc - nowMs;
  return diff > 0 ? diff : diff + 24 * 60 * 60 * 1000;
}

@Injectable()
export class DemoService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DemoService.name);
  private resetTimer: NodeJS.Timeout | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {}

  onModuleInit(): void {
    if (!this.isAutoResetEnabled()) {
      this.logger.log('Demo auto-reset отключён');
      return;
    }
    this.scheduleNextReset();
  }

  onModuleDestroy(): void {
    if (this.resetTimer) {
      clearTimeout(this.resetTimer);
      this.resetTimer = null;
    }
  }

  // Демо-стенд включается через DEMO_ENABLED. Дефолт — включён:
  // сброс дёргают только ADMIN-ы, боевые данные clearDemoData не трогает.
  isEnabled(): boolean {
    const raw =
      this.configService.get<string>('DEMO_ENABLED') ??
      process.env.DEMO_ENABLED;
    return raw !== 'false';
  }

  private assertEnabled(): void {
    if (!this.isEnabled()) {
      throw new ForbiddenException('Демо-режим отключён (DEMO_ENABLED=false)');
    }
  }

  // Ночной автосброс: раз в сутки в 00:00 по Москве (дефолт).
  // Отдельный рубильник DEMO_AUTO_RESET — чтобы можно было держать
  // POST /demo/reset включённым, но без ночного расписания.
  isAutoResetEnabled(): boolean {
    if (!this.isEnabled()) return false;
    const raw =
      this.configService.get<string>('DEMO_AUTO_RESET') ??
      process.env.DEMO_AUTO_RESET;
    return raw !== 'false';
  }

  getResetTimeZone(): string {
    return (
      this.configService.get<string>('DEMO_RESET_TZ') ??
      process.env.DEMO_RESET_TZ ??
      DEFAULT_DEMO_RESET_TZ
    );
  }

  getNextResetAt(): string | null {
    if (!this.isAutoResetEnabled()) return null;
    const timeZone = this.getResetTimeZone();
    return new Date(
      Date.now() + msUntilNextMidnight(Date.now(), timeZone),
    ).toISOString();
  }

  private scheduleNextReset(): void {
    const timeZone = this.getResetTimeZone();
    const delay = msUntilNextMidnight(Date.now(), timeZone);
    const nextAt = new Date(Date.now() + delay);
    this.logger.log(
      `Demo auto-reset запланирован на ${nextAt.toISOString()} (${timeZone})`,
    );
    this.resetTimer = setTimeout(() => void this.runScheduledReset(), delay);
  }

  private async runScheduledReset(): Promise<void> {
    this.resetTimer = null;
    try {
      const stats = await this.resetDemo();
      this.logger.log(`Demo auto-reset выполнен: ${JSON.stringify(stats)}`);
    } catch (e) {
      // Ночной сброс не должен ронять процесс — только лог, следующий
      // запуск всё равно запланируем ниже.
      this.logger.error(
        `Demo auto-reset не удался: ${(e as Error)?.message ?? e}`,
      );
    }
    if (this.isAutoResetEnabled()) this.scheduleNextReset();
  }

  // Демо-пользователей удалять нельзя — ни руками, ни сбросом.
  // Отдельный метод, чтобы будущий DELETE /users/:id переиспользовал его.
  assertCanDeleteUserByEmail(email: unknown): true {
    if (isDemoEmail(email)) {
      throw new ForbiddenException(DEMO_DELETE_FORBIDDEN_MESSAGE);
    }
    return true;
  }

  async getStatus() {
    const users = await this.prisma.user.findMany({
      where: { email: { in: [...DEMO_USER_EMAILS] } },
      select: { id: true, email: true, name: true, role: true },
    });
    const byEmail = new Map(users.map((u) => [u.email, u]));
    const demoUserIds = users.map((u) => u.id);
    const [customers, deals, tasks, orders] = await Promise.all([
      this.prisma.customer.count({
        where: { fromSource: 'demo' },
      }),
      this.prisma.deal.count({
        where: { customer: { fromSource: 'demo' } },
      }),
      this.prisma.task.count({
        where: { authorId: { in: demoUserIds } },
      }),
      this.prisma.order.count({
        where: { customer: { fromSource: 'demo' } },
      }),
    ]);
    return {
      enabled: this.isEnabled(),
      autoReset: this.isAutoResetEnabled(),
      nextResetAt: this.getNextResetAt(),
      users: DEMO_USER_EMAILS.map((email) => ({
        email,
        role: DEMO_USER_ROLES[email],
        name: byEmail.get(email)?.name ?? null,
        exists: byEmail.has(email),
      })),
      counts: { customers, deals, tasks, orders },
    };
  }

  async resetDemo(): Promise<DemoSeedStats> {
    this.assertEnabled();
    const password =
      this.configService.get<string>('DEMO_PASSWORD') ??
      process.env.DEMO_PASSWORD ??
      DEFAULT_DEMO_PASSWORD;
    // Пользователи сохраняются (upsert внутри seed), контент пересоздаётся.
    const cleared = await clearDemoData(this.prisma);
    const stats = await seedDemoData(this.prisma, { password });
    this.logger.log(
      `Demo reset: cleared customers=${cleared.customers ?? 0} deals=${cleared.deals ?? 0} orders=${cleared.orders ?? 0}, seeded ${JSON.stringify(stats)}`,
    );
    return stats;
  }
}

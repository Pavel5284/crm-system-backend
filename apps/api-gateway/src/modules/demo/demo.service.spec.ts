import { ForbiddenException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '@app/database';
import { DEMO_DELETE_FORBIDDEN_MESSAGE } from '@app/shared';
import { DemoService, msUntilNextMidnight } from './demo.service';

// Сквозной мок Prisma: любая модель отдаёт jest.fn с дефолтами
// (findMany -> [], create/upsert -> { id, ...data }, остальное -> null).
// seedDemoData дёргает десятки методов — перечислять их руками хрупко.
function createPrismaMock(): PrismaService {
  const models = new Map<string, Record<string, jest.Mock>>();
  return new Proxy({} as PrismaService, {
    get(_target, model: string | symbol) {
      if (typeof model !== 'string') return undefined;
      if (!models.has(model)) {
        const methods = new Map<string, jest.Mock>();
        models.set(
          model,
          new Proxy({} as Record<string, jest.Mock>, {
            get(_t, method: string | symbol) {
              if (typeof method !== 'string') return undefined;
              if (!methods.has(method)) {
                methods.set(
                  method,
                  jest.fn((args?: { create?: unknown; data?: unknown }) => {
                    if (method === 'findMany') return Promise.resolve([]);
                    if (method === 'count') return Promise.resolve(0);
                    if (method === 'deleteMany')
                      return Promise.resolve({ count: 0 });
                    if (method === 'upsert' || method === 'create') {
                      const data = (args?.create ?? args?.data ?? {}) as Record<
                        string,
                        unknown
                      >;
                      return Promise.resolve({
                        id: `mock-${model}-${method}`,
                        ...data,
                      });
                    }
                    return Promise.resolve(null);
                  }),
                );
              }
              return methods.get(method);
            },
          }),
        );
      }
      return models.get(model);
    },
  });
}

function createConfigMock(
  env: Record<string, string | undefined> = {},
): ConfigService {
  return {
    get: jest.fn((key: string) => env[key]),
  } as unknown as ConfigService;
}

describe('DemoService', () => {
  it('resetDemo кидает 403, когда DEMO_ENABLED=false', async () => {
    const service = new DemoService(
      createPrismaMock(),
      createConfigMock({ DEMO_ENABLED: 'false' }),
    );
    await expect(service.resetDemo()).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(service.isEnabled()).toBe(false);
  });

  it('isEnabled по умолчанию true (env не задан)', () => {
    const service = new DemoService(createPrismaMock(), createConfigMock());
    expect(service.isEnabled()).toBe(true);
  });

  it('resetDemo сидирует полный набор и сохраняет трёх юзеров', async () => {
    const service = new DemoService(
      createPrismaMock(),
      createConfigMock({ DEMO_ENABLED: 'true' }),
    );
    const stats = await service.resetDemo();
    expect(stats.users).toBe(3);
    expect(stats.customers).toBe(6);
    expect(stats.deals).toBe(8);
    expect(stats.tasks).toBe(8);
    expect(stats.orders).toBe(4);
    expect(stats.payments).toBe(4);
    expect(stats.messages).toBe(5);
    expect(stats.notifications).toBe(6);
  });

  it('assertCanDeleteUserByEmail запрещает удалять demo-юзеров', () => {
    const service = new DemoService(
      createPrismaMock(),
      createConfigMock({ DEMO_ENABLED: 'true' }),
    );
    for (const email of [
      'demo1@example.com',
      'demo2@example.com',
      'DEMO3@EXAMPLE.COM',
    ]) {
      try {
        service.assertCanDeleteUserByEmail(email);
        fail(`ожидался ForbiddenException для ${email}`);
      } catch (e) {
        expect(e).toBeInstanceOf(ForbiddenException);
        expect((e as Error).message).toBe(DEMO_DELETE_FORBIDDEN_MESSAGE);
      }
    }
    expect(service.assertCanDeleteUserByEmail('alice@example.com')).toBe(true);
  });

  it('isAutoResetEnabled: дефолт true, гасится флагами', () => {
    expect(
      new DemoService(
        createPrismaMock(),
        createConfigMock(),
      ).isAutoResetEnabled(),
    ).toBe(true);
    expect(
      new DemoService(
        createPrismaMock(),
        createConfigMock({ DEMO_AUTO_RESET: 'false' }),
      ).isAutoResetEnabled(),
    ).toBe(false);
    expect(
      new DemoService(
        createPrismaMock(),
        createConfigMock({ DEMO_ENABLED: 'false' }),
      ).isAutoResetEnabled(),
    ).toBe(false);
  });

  it('getNextResetAt: null когда выключено, ISO-дата когда включено', () => {
    const off = new DemoService(
      createPrismaMock(),
      createConfigMock({ DEMO_AUTO_RESET: 'false' }),
    );
    expect(off.getNextResetAt()).toBeNull();
    const on = new DemoService(
      createPrismaMock(),
      createConfigMock({ DEMO_ENABLED: 'true' }),
    );
    expect(on.getNextResetAt()).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  describe('msUntilNextMidnight (Europe/Moscow = UTC+3, без DST)', () => {
    const tz = 'Europe/Moscow';
    it('23:00 МСК -> через час', () => {
      expect(msUntilNextMidnight(Date.parse('2026-10-02T20:00:00Z'), tz)).toBe(
        60 * 60 * 1000,
      );
    });
    it('12:00 МСК -> через 12 часов', () => {
      expect(msUntilNextMidnight(Date.parse('2026-10-02T09:00:00Z'), tz)).toBe(
        12 * 60 * 60 * 1000,
      );
    });
    it('ровно полночь -> через сутки, а не 0', () => {
      expect(msUntilNextMidnight(Date.parse('2026-10-02T21:00:00Z'), tz)).toBe(
        24 * 60 * 60 * 1000,
      );
    });
  });

  it('onModuleInit планирует сброс, onModuleDestroy снимает таймер', () => {
    const setSpy = jest.spyOn(global, 'setTimeout');
    const clearSpy = jest.spyOn(global, 'clearTimeout');
    try {
      const service = new DemoService(
        createPrismaMock(),
        createConfigMock({ DEMO_ENABLED: 'true' }),
      );
      service.onModuleInit();
      expect(setSpy).toHaveBeenCalledTimes(1);
      const delay = setSpy.mock.calls[0][1] as number;
      expect(delay).toBeGreaterThan(0);
      expect(delay).toBeLessThanOrEqual(24 * 60 * 60 * 1000);
      service.onModuleDestroy();
      expect(clearSpy).toHaveBeenCalledTimes(1);
    } finally {
      setSpy.mockRestore();
      clearSpy.mockRestore();
    }
  });

  it('onModuleInit ничего не планирует, когда автосброс выключен', () => {
    const setSpy = jest.spyOn(global, 'setTimeout');
    try {
      const service = new DemoService(
        createPrismaMock(),
        createConfigMock({ DEMO_AUTO_RESET: 'false' }),
      );
      service.onModuleInit();
      expect(setSpy).not.toHaveBeenCalled();
    } finally {
      setSpy.mockRestore();
    }
  });
});

import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { CaptchaService } from './captcha.service';

describe('CaptchaService', () => {
  let service: CaptchaService;
  let configService: { get: jest.Mock };
  const OLD_ENV = process.env.NODE_ENV;

  const okResponse = (success: boolean) =>
    ({
      ok: true,
      json: () => Promise.resolve({ success }),
    }) as unknown as Response;

  beforeEach(async () => {
    configService = { get: jest.fn() };
    const module = await Test.createTestingModule({
      providers: [
        CaptchaService,
        { provide: ConfigService, useValue: configService },
      ],
    }).compile();

    service = module.get(CaptchaService);
  });

  afterEach(() => {
    process.env.NODE_ENV = OLD_ENV;
    jest.restoreAllMocks();
  });

  it('пропускает проверку без секрета', async () => {
    process.env.NODE_ENV = 'production';
    configService.get.mockReturnValue(undefined);
    await expect(service.verify('anything')).resolves.toBe(true);
  });

  it('пропускает проверку в test-окружении даже с секретом', async () => {
    process.env.NODE_ENV = 'test';
    configService.get.mockReturnValue('secret');
    await expect(service.verify(undefined)).resolves.toBe(true);
  });

  it('false без токена при включенном секрете', async () => {
    process.env.NODE_ENV = 'production';
    configService.get.mockReturnValue('secret');
    await expect(service.verify(undefined)).resolves.toBe(false);
  });

  it('true при success от Cloudflare', async () => {
    process.env.NODE_ENV = 'production';
    configService.get.mockReturnValue('secret');
    jest.spyOn(globalThis, 'fetch').mockResolvedValue(okResponse(true));
    await expect(service.verify('tok', '1.2.3.4')).resolves.toBe(true);
  });

  it('false при сетевой ошибке (fail-closed)', async () => {
    process.env.NODE_ENV = 'production';
    configService.get.mockReturnValue('secret');
    jest.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('boom'));
    await expect(service.verify('tok')).resolves.toBe(false);
  });
});

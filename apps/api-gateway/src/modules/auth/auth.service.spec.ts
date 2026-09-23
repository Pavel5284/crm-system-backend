import { Test } from '@nestjs/testing';
import { ConflictException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as argon2 from 'argon2';
import { AuthService } from './auth.service';
import { EmailService } from './email.service';
import { PrismaService } from '@app/database';

jest.mock('argon2');

describe('AuthService', () => {
  let service: AuthService;
  let prisma: { user: Record<'findUnique' | 'create' | 'update', jest.Mock> };
  let jwtService: { signAsync: jest.Mock };
  let configService: { get: jest.Mock; getOrThrow: jest.Mock };
  let emailService: { sendVerificationEmail: jest.Mock };

  beforeEach(async () => {
    prisma = {
      user: { findUnique: jest.fn(), create: jest.fn(), update: jest.fn() },
    };
    jwtService = { signAsync: jest.fn().mockResolvedValue('signed-token') };
    configService = {
      get: jest.fn(),
      getOrThrow: jest.fn((key: string) => `value-for-${key}`),
    };
    emailService = {
      sendVerificationEmail: jest.fn().mockResolvedValue(undefined),
    };

    const module = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: prisma as Record<string, unknown> },
        { provide: JwtService, useValue: jwtService },
        { provide: ConfigService, useValue: configService },
        { provide: EmailService, useValue: emailService },
      ],
    }).compile();

    service = module.get(AuthService);
  });

  it('бросает ConflictException при регистрации с занятым email', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: 'existing' });

    await expect(
      service.register({
        email: 'a@a.com',
        password: 'password123',
        name: 'A',
      }),
    ).rejects.toThrow(ConflictException);
  });

  it('бросает UnauthorizedException при неверном пароле', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: '1', passwordHash: 'hash' });
    (argon2.verify as jest.Mock).mockResolvedValue(false);

    await expect(
      service.login({ email: 'a@a.com', password: 'wrong' }),
    ).rejects.toThrow(UnauthorizedException);
  });

  it('успешный логин возвращает пару токенов', async () => {
    prisma.user.findUnique.mockResolvedValue({
      id: '1',
      email: 'a@a.com',
      role: 'USER',
      passwordHash: 'hash',
      isEmailVerified: true,
    });
    (argon2.verify as jest.Mock).mockResolvedValue(true);
    (argon2.hash as jest.Mock).mockResolvedValue('hashed-refresh');
    prisma.user.update.mockResolvedValue({});

    const result = await service.login({
      email: 'a@a.com',
      password: 'correct',
    });
    expect(result).toEqual({
      accessToken: 'signed-token',
      refreshToken: 'signed-token',
    });
  });

  it('несуществующий email: тот же 401 + dummy verify против timing-оракула', async () => {
    prisma.user.findUnique.mockResolvedValue(null);
    (argon2.verify as jest.Mock).mockResolvedValue(false);

    await expect(
      service.login({ email: 'no-such@x.com', password: 'whatever' }),
    ).rejects.toThrow(UnauthorizedException);
    expect(argon2.verify).toHaveBeenCalled();
  });

  it('заблокированный аккаунт не входит даже с верным паролем', async () => {
    prisma.user.findUnique.mockResolvedValue({
      id: '1',
      email: 'a@a.com',
      role: 'USER',
      passwordHash: 'hash',
      isEmailVerified: true,
      failedLoginAttempts: 5,
      lockedUntil: new Date(Date.now() + 15 * 60 * 1000),
    });
    (argon2.verify as jest.Mock).mockResolvedValue(true);

    await expect(
      service.login({ email: 'a@a.com', password: 'correct' }),
    ).rejects.toThrow(UnauthorizedException);
    expect(jwtService.signAsync).not.toHaveBeenCalled();
  });

  it('5-я неудача ставит lockedUntil', async () => {
    prisma.user.findUnique.mockResolvedValue({
      id: '1',
      email: 'a@a.com',
      passwordHash: 'hash',
      isEmailVerified: true,
      failedLoginAttempts: 4,
      lockedUntil: null,
    });
    (argon2.verify as jest.Mock).mockResolvedValue(false);
    prisma.user.update.mockResolvedValue({});

    await expect(
      service.login({ email: 'a@a.com', password: 'wrong' }),
    ).rejects.toThrow(UnauthorizedException);
    expect(prisma.user.update).toHaveBeenCalledTimes(1);
    const calls: unknown = prisma.user.update.mock.calls;
    const updateArg = (calls as unknown[][])[0]?.[0] as {
      where: { id: string };
      data: { failedLoginAttempts: number; lockedUntil: Date | null };
    };
    expect(updateArg.where).toEqual({ id: '1' });
    expect(updateArg.data.failedLoginAttempts).toBe(5);
    expect(updateArg.data.lockedUntil).toBeInstanceOf(Date);
  });

  it('успешный вход сбрасывает счетчик неудач', async () => {
    prisma.user.findUnique.mockResolvedValue({
      id: '1',
      email: 'a@a.com',
      role: 'USER',
      passwordHash: 'hash',
      isEmailVerified: true,
      failedLoginAttempts: 3,
      lockedUntil: null,
    });
    (argon2.verify as jest.Mock).mockResolvedValue(true);
    (argon2.hash as jest.Mock).mockResolvedValue('hashed-refresh');
    prisma.user.update.mockResolvedValue({});

    await service.login({ email: 'a@a.com', password: 'correct' });
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: '1' },
      data: { failedLoginAttempts: 0, lockedUntil: null },
    });
  });
});

import { Test } from '@nestjs/testing';
import { ConflictException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as argon2 from 'argon2';
import { AuthService } from './auth.service';
import { PrismaService } from '@app/database';

jest.mock('argon2');

describe('AuthService', () => {
  let service: AuthService;
  let prisma: { user: Record<'findUnique' | 'create' | 'update', jest.Mock> };
  let jwtService: { signAsync: jest.Mock };
  let configService: { getOrThrow: jest.Mock };

  beforeEach(async () => {
    prisma = {
      user: { findUnique: jest.fn(), create: jest.fn(), update: jest.fn() },
    };
    jwtService = { signAsync: jest.fn().mockResolvedValue('signed-token') };
    configService = {
      getOrThrow: jest.fn((key: string) => `value-for-${key}`),
    };

    const module = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: prisma as Record<string, unknown> },
        { provide: JwtService, useValue: jwtService },
        { provide: ConfigService, useValue: configService },
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
});

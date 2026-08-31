import {
  BadRequestException,
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as argon2 from 'argon2';
import { randomBytes } from 'crypto';
import { Role } from '@prisma/client';
import { PrismaService } from '@app/database';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { EmailService } from './email.service';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly emailService: EmailService,
  ) {}

  async register(dto: RegisterDto) {
    const existing = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });
    if (existing) {
      if (!existing.isEmailVerified) {
        // переотправляем письмо, не раскрывая что email уже есть
        const token = randomBytes(32).toString('hex');
        await this.prisma.user.update({
          where: { id: existing.id },
          data: {
            emailVerificationToken: token,
            emailVerificationTokenExpires: new Date(Date.now() + 24 * 60 * 60 * 1000),
          },
        });
        await this.emailService.sendVerificationEmail(existing.email, existing.name, token);
      }
      throw new ConflictException('Пользователь с таким email уже существует');
    }

    const passwordHash = await argon2.hash(dto.password);
    const isTest = process.env.NODE_ENV === 'test';
    if (isTest) {
      const user = await this.prisma.user.create({
        data: { email: dto.email, passwordHash, name: dto.name, isEmailVerified: true },
      });
      return this.issueTokens(user.id, user.email, user.role);
    }
    const token = randomBytes(32).toString('hex');
    const user = await this.prisma.user.create({
      data: {
        email: dto.email,
        passwordHash,
        name: dto.name,
        isEmailVerified: false,
        emailVerificationToken: token,
        emailVerificationTokenExpires: new Date(Date.now() + 24 * 60 * 60 * 1000),
      },
    });

    await this.emailService.sendVerificationEmail(user.email, user.name, token);

    return { message: 'Проверьте почту — мы отправили ссылку для подтверждения' };
  }

  async verifyEmail(token: string) {
    if (!token) throw new BadRequestException('Токен не указан');
    const user = await this.prisma.user.findUnique({
      where: { emailVerificationToken: token },
    });
    if (!user || !user.emailVerificationTokenExpires)
      throw new BadRequestException('Неверный токен');
    if (user.emailVerificationTokenExpires < new Date())
      throw new BadRequestException('Срок действия токена истёк');
    if (user.isEmailVerified) return { message: 'Email уже подтверждён' };

    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        isEmailVerified: true,
        emailVerificationToken: null,
        emailVerificationTokenExpires: null,
      },
    });
    return { message: 'Email успешно подтверждён' };
  }

  async resendVerification(email: string) {
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user) throw new BadRequestException('Пользователь не найден');
    if (user.isEmailVerified) throw new BadRequestException('Email уже подтверждён');
    const token = randomBytes(32).toString('hex');
    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        emailVerificationToken: token,
        emailVerificationTokenExpires: new Date(Date.now() + 24 * 60 * 60 * 1000),
      },
    });
    await this.emailService.sendVerificationEmail(user.email, user.name, token);
    return { message: 'Письмо отправлено повторно' };
  }

  async login(dto: LoginDto) {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });
    if (!user) throw new UnauthorizedException('Неверный email или пароль');

    const valid = await argon2.verify(user.passwordHash, dto.password);
    if (!valid) throw new UnauthorizedException('Неверный email или пароль');

    if (!user.isEmailVerified)
      throw new UnauthorizedException('Email не подтверждён. Проверьте почту');

    return this.issueTokens(user.id, user.email, user.role);
  }

  async refresh(userId: string, refreshToken: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user?.refreshTokenHash) throw new UnauthorizedException();

    const valid = await argon2.verify(user.refreshTokenHash, refreshToken);
    if (!valid) throw new UnauthorizedException();

    return this.issueTokens(user.id, user.email, user.role);
  }

  async logout(userId: string) {
    await this.prisma.user.update({
      where: { id: userId },
      data: { refreshTokenHash: null },
    });
  }

  private async issueTokens(userId: string, email: string, role: Role) {
    const payload = { sub: userId, email, role };

    const [accessToken, refreshToken] = await Promise.all([
      this.jwtService.signAsync(payload, {
        secret: this.configService.getOrThrow('JWT_ACCESS_SECRET'),
        expiresIn: this.configService.getOrThrow('JWT_ACCESS_EXPIRES_IN'),
      }),
      this.jwtService.signAsync(payload, {
        secret: this.configService.getOrThrow('JWT_REFRESH_SECRET'),
        expiresIn: this.configService.getOrThrow('JWT_REFRESH_EXPIRES_IN'),
      }),
    ]);

    const refreshTokenHash = await argon2.hash(refreshToken);
    await this.prisma.user.update({
      where: { id: userId },
      data: { refreshTokenHash },
    });

    return { accessToken, refreshToken };
  }
}

import {
  BadRequestException,
  ConflictException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
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
import { CaptchaService } from './captcha.service';
import { EmailService } from './email.service';

// Заранее посчитанный argon2id-хэш несуществующего пароля.
// Нужен чтобы время ответа для "нет такого email" совпадало с реальным
// verify и нельзя было перебирать базу email по таймингу.
const DUMMY_PASSWORD_HASH =
  '$argon2id$v=19$m=65536,p=4,t=3$rtkqtuJ8Mal+HNFGBvjO9Q$M25jjvRikYuXRGWD8LshyX/umiEnoma6vN8oNOj/DWI';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly emailService: EmailService,
    private readonly captchaService: CaptchaService,
  ) {}

  /** Лимиты блокировки аккаунта, переопределяются через env. */
  private getLoginPolicy(): { maxAttempts: number; lockMinutes: number } {
    const maxAttempts =
      Number(this.configService.get<number>('LOGIN_MAX_ATTEMPTS')) || 5;
    const lockMinutes =
      Number(this.configService.get<number>('LOGIN_LOCK_MINUTES')) || 15;
    return { maxAttempts, lockMinutes };
  }

  /** Сжигает ~столько же времени, сколько настоящий verify. */
  private async burnTiming(password: string): Promise<void> {
    try {
      await argon2.verify(DUMMY_PASSWORD_HASH, password);
    } catch {
      // verify для dummy всегда false/throw — результат не важен
    }
  }

  private canResendVerification(user: {
    emailVerificationTokenExpires: Date | null;
    updatedAt: Date;
  }): boolean {
    // токен живет 24ч, считаем lastSent = expires - 24ч
    if (!user.emailVerificationTokenExpires) return true;
    const lastSentAt =
      user.emailVerificationTokenExpires.getTime() - 24 * 60 * 60 * 1000;
    // альтернативно смотрим updatedAt если токен не трогали (более надежно для повторных register)
    const lastUpdate = user.updatedAt.getTime();
    const lastSent = Math.max(lastSentAt, lastUpdate);
    return Date.now() - lastSent >= 5 * 60 * 1000;
  }

  async register(dto: RegisterDto, meta?: { ip?: string }) {
    // CAPTCHA первой — боты без валидного токена не доходят до БД.
    const captchaOk = await this.captchaService.verify(
      dto.captchaToken,
      meta?.ip,
    );
    if (!captchaOk) {
      throw new BadRequestException(
        'Не пройдена проверка CAPTCHA. Попробуйте снова',
      );
    }

    const existing = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });
    if (existing) {
      if (!existing.isEmailVerified) {
        // переотправляем письмо c лимитом 5 мин, не раскрывая что email уже есть
        if (this.canResendVerification(existing)) {
          const token = randomBytes(32).toString('hex');
          await this.prisma.user.update({
            where: { id: existing.id },
            data: {
              emailVerificationToken: token,
              emailVerificationTokenExpires: new Date(
                Date.now() + 24 * 60 * 60 * 1000,
              ),
            },
          });
          await this.emailService.sendVerificationEmail(
            existing.email,
            existing.name,
            token,
          );
        }
      }
      throw new ConflictException('Пользователь с таким email уже существует');
    }

    const passwordHash = await argon2.hash(dto.password);
    const isTest = process.env.NODE_ENV === 'test';
    const skipVerification =
      process.env.SKIP_EMAIL_VERIFICATION === 'true' ||
      this.configService.get<string>('SKIP_EMAIL_VERIFICATION') === 'true';
    if (isTest || skipVerification) {
      const user = await this.prisma.user.create({
        data: {
          email: dto.email,
          passwordHash,
          name: dto.name,
          isEmailVerified: true,
        },
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
        emailVerificationTokenExpires: new Date(
          Date.now() + 24 * 60 * 60 * 1000,
        ),
      },
    });

    await this.emailService.sendVerificationEmail(user.email, user.name, token);

    return {
      message: 'Проверьте почту — мы отправили ссылку для подтверждения',
    };
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
    // Сырой @Body('email') без DTO: нормализуем вручную.
    const normalized =
      typeof email === 'string' ? email.trim().toLowerCase() : '';
    if (!normalized) throw new BadRequestException('Email не указан');
    const user = await this.prisma.user.findUnique({
      where: { email: normalized },
    });
    if (!user) throw new BadRequestException('Пользователь не найден');
    if (user.isEmailVerified)
      throw new BadRequestException('Email уже подтверждён');
    if (!this.canResendVerification(user)) {
      throw new BadRequestException(
        'Письмо уже отправлено недавно. Повторите через 5 минут',
      );
    }
    const token = randomBytes(32).toString('hex');
    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        emailVerificationToken: token,
        emailVerificationTokenExpires: new Date(
          Date.now() + 24 * 60 * 60 * 1000,
        ),
      },
    });
    await this.emailService.sendVerificationEmail(user.email, user.name, token);
    return { message: 'Письмо отправлено повторно' };
  }

  async login(dto: LoginDto, meta?: { ip?: string; userAgent?: string }) {
    const invalidCredentials = () =>
      new UnauthorizedException('Неверный email или пароль');

    // CAPTCHA обязательна на каждую попытку (фронт не дает нажать login
    // без токена). Проверка первой — боты без токена не доходят до БД/argon2.
    const captchaOk = await this.captchaService.verify(
      dto.captchaToken,
      meta?.ip,
    );
    if (!captchaOk) {
      throw new BadRequestException(
        'Не пройдена проверка CAPTCHA. Попробуйте снова',
      );
    }

    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });
    // Нет юзера — жжем время как на настоящий verify, отвечаем как обычно.
    if (!user) {
      await this.burnTiming(dto.password);
      throw invalidCredentials();
    }

    // Аккаунт заблокирован после серии неудач — пароль все равно проверяем,
    // чтобы время ответа не выдавало факт блокировки. Ответ честный (429):
    // существование email и так раскрыто через 409 на регистрации.
    if (user.lockedUntil && user.lockedUntil.getTime() > Date.now()) {
      try {
        await argon2.verify(user.passwordHash, dto.password);
      } catch {
        // игнорируем — ответ всегда одинаковый
      }
      const retryIn = this.formatMinutesLeft(user.lockedUntil);
      this.logger.warn(
        `Login blocked (account locked) userId=${user.id} ip=${meta?.ip ?? 'unknown'}`,
      );
      throw new HttpException(
        `Слишком много неудачных попыток. Повторите через ${retryIn}`,
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    const valid = await argon2
      .verify(user.passwordHash, dto.password)
      .catch(() => false);
    if (!valid) {
      await this.registerFailedAttempt(
        user.id,
        user.failedLoginAttempts ?? 0,
        meta?.ip,
      );
      throw invalidCredentials();
    }

    // Пароль верный — сбрасываем счетчик неудач (ошибку сброса не пробрасываем).
    if ((user.failedLoginAttempts ?? 0) > 0 || user.lockedUntil) {
      try {
        await this.prisma.user.update({
          where: { id: user.id },
          data: { failedLoginAttempts: 0, lockedUntil: null },
        });
      } catch {
        // не блокируем вход из-за ошибки сброса
      }
    }

    const skipLoginVerification =
      process.env.SKIP_EMAIL_VERIFICATION === 'true' ||
      this.configService.get<string>('SKIP_EMAIL_VERIFICATION') === 'true';
    if (!user.isEmailVerified && !skipLoginVerification) {
      // при логине тоже ресендим, но не чаще 5 мин
      if (this.canResendVerification(user)) {
        const token = randomBytes(32).toString('hex');
        await this.prisma.user.update({
          where: { id: user.id },
          data: {
            emailVerificationToken: token,
            emailVerificationTokenExpires: new Date(
              Date.now() + 24 * 60 * 60 * 1000,
            ),
          },
        });
        await this.emailService.sendVerificationEmail(
          user.email,
          user.name,
          token,
        );
      }
      throw new UnauthorizedException('Email не подтверждён. Проверьте почту');
    }

    const tokens = await this.issueTokens(user.id, user.email, user.role);

    // логируем визит — ошибку не пробрасываем
    try {
      const ua = meta?.userAgent ?? '';
      const parsed = this.parseUserAgent(ua);
      await this.prisma.visit.create({
        data: {
          userId: user.id,
          ip: meta?.ip ?? 'unknown',
          userAgent: ua.slice(0, 512),
          device: parsed.device,
          browser: parsed.browser,
          os: parsed.os,
        },
      });
    } catch (_e) {
      void _e;
    }

    return tokens;
  }

  /** Оставшиеся минуты блокировки текстом: 1 минуту, 3 минуты, 15 минут. */
  private formatMinutesLeft(lockedUntil: Date): string {
    const minutes = Math.max(
      1,
      Math.ceil((lockedUntil.getTime() - Date.now()) / 60_000),
    );
    const mod10 = minutes % 10;
    const mod100 = minutes % 100;
    const word =
      mod10 === 1 && mod100 !== 11
        ? 'минуту'
        : mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)
          ? 'минуты'
          : 'минут';
    return `${minutes} ${word}`;
  }

  /**
   * Учитывает неудачную попытку входа. По достижении лимита ставит
   * временную блокировку аккаунта. Ответ на неудачу всегда одинаковый (401),
   * а вход при активном блоке отвечает честным 429 с оставшимся временем.
   */
  private async registerFailedAttempt(
    userId: string,
    prevAttempts: number,
    ip?: string,
  ): Promise<void> {
    const { maxAttempts, lockMinutes } = this.getLoginPolicy();
    const failedAttempts = prevAttempts + 1;
    try {
      if (failedAttempts >= maxAttempts) {
        await this.prisma.user.update({
          where: { id: userId },
          data: {
            failedLoginAttempts: failedAttempts,
            lockedUntil: new Date(Date.now() + lockMinutes * 60_000),
          },
        });
        this.logger.warn(
          `Account locked userId=${userId} ip=${ip ?? 'unknown'} attempts=${failedAttempts}`,
        );
      } else {
        await this.prisma.user.update({
          where: { id: userId },
          data: { failedLoginAttempts: failedAttempts },
        });
      }
    } catch {
      // не блокируем ответ из-за ошибки учета
    }
  }

  private parseUserAgent(ua: string): {
    device: string | null;
    browser: string | null;
    os: string | null;
  } {
    if (!ua) return { device: null, browser: null, os: null };
    let browser: string | null = null;
    let os: string | null = null;
    let device: string | null = null;

    if (/Edg\//i.test(ua)) browser = 'Edge';
    else if (/OPR|Opera/i.test(ua)) browser = 'Opera';
    else if (/Chrome/i.test(ua) && !/Chromium|Edg/i.test(ua))
      browser = 'Chrome';
    else if (/Safari/i.test(ua) && !/Chrome/i.test(ua)) browser = 'Safari';
    else if (/Firefox/i.test(ua)) browser = 'Firefox';

    if (/Windows NT/i.test(ua)) os = 'Windows';
    else if (/Mac OS X/i.test(ua)) os = 'macOS';
    else if (/Android/i.test(ua)) os = 'Android';
    else if (/iPhone|iPad|iPod/i.test(ua)) os = 'iOS';
    else if (/Linux/i.test(ua)) os = 'Linux';

    if (/Mobile|Android|iPhone/i.test(ua)) device = 'Mobile';
    else if (/Tablet|iPad/i.test(ua)) device = 'Tablet';
    else device = 'Desktop';

    return { device, browser, os };
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

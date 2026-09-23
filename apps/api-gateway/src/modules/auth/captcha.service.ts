import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

const SITEVERIFY_URL =
  'https://challenges.cloudflare.com/turnstile/v0/siteverify';

/**
 * Проверка Cloudflare Turnstile.
 * Без TURNSTILE_SECRET_KEY (dev/test) — пропускает, чтобы не требовать
 * ключи локально и не ломать e2e. В проде с секретом — fail-closed:
 * ошибка сети = отказ, иначе сеть роняла бы всю регистрацию.
 */
@Injectable()
export class CaptchaService {
  private readonly logger = new Logger(CaptchaService.name);

  constructor(private readonly configService: ConfigService) {}

  isEnabled(): boolean {
    if (process.env.NODE_ENV === 'test') return false;
    return !!this.configService.get<string>('TURNSTILE_SECRET_KEY');
  }

  async verify(token: string | undefined, ip?: string): Promise<boolean> {
    const secret = this.configService.get<string>('TURNSTILE_SECRET_KEY');
    if (!secret || process.env.NODE_ENV === 'test') return true;
    if (!token) return false;
    try {
      const res = await fetch(SITEVERIFY_URL, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          secret,
          response: token,
          ...(ip ? { remoteip: ip } : {}),
        }),
        signal: AbortSignal.timeout(5000),
      });
      if (!res.ok) {
        this.logger.warn(`Turnstile siteverify HTTP ${res.status}`);
        return false;
      }
      const data = (await res.json()) as { success?: boolean };
      return data.success === true;
    } catch (err) {
      this.logger.warn(`Turnstile verify failed: ${(err as Error).message}`);
      return false;
    }
  }
}

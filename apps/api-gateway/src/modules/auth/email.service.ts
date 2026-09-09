import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private transporter: nodemailer.Transporter | null = null;

  constructor(private readonly configService: ConfigService) {
    const host = this.configService.get<string>('SMTP_HOST');
    const port = this.configService.get<number>('SMTP_PORT');
    const user = this.configService.get<string>('SMTP_USER');
    const pass = this.configService.get<string>('SMTP_PASS');

    if (host && port) {
      this.transporter = nodemailer.createTransport({
        host,
        port,
        secure: port === 465,
        auth: user && pass ? { user, pass } : undefined,
      });
    }
  }

  async sendVerificationEmail(email: string, name: string, token: string) {
    const frontendUrl =
      this.configService.get<string>('FRONTEND_URL') ?? 'http://localhost:3001';
    const verifyUrl = `${frontendUrl.replace(/\/$/, '')}/verify-email?token=${token}`;

    const from =
      this.configService.get<string>('SMTP_FROM') ?? 'noreply@crm.local';
    const subject = 'Подтвердите email — Noname CRM';
    const html = `
      <p>Привет, ${name}!</p>
      <p>Для завершения регистрации перейдите по ссылке:</p>
      <p><a href="${verifyUrl}">${verifyUrl}</a></p>
      <p>Ссылка действует 24 часа.</p>
      <p>Если вы не регистрировались — проигнорируйте письмо.</p>
    `;
    const text = `Привет, ${name}! Подтвердите email: ${verifyUrl} (действует 24 часа)`;

    if (!this.transporter) {
      this.logger.log(`[DEV] verification link for ${email}: ${verifyUrl}`);
      return;
    }

    try {
      await this.transporter.sendMail({ from, to: email, subject, html, text });
      this.logger.log(`Verification email sent to ${email}`);
    } catch (err) {
      const e = err as Error & { code?: string; response?: string; responseCode?: number };
      this.logger.error(
        `Failed to send verification email to ${email}: ${e.message} code=${e.code} response=${e.response}`,
        e.stack,
      );
      // не пробрасываем — регистрация уже создана, ссылку всё равно видно в логах
      this.logger.log(
        `[FALLBACK] verification link for ${email}: ${verifyUrl}`,
      );
    }
  }
}

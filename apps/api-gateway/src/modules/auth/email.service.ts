import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private transporter: nodemailer.Transporter | null = null;
  private readonly brevoApiKey: string | undefined;
  private readonly brevoSenderEmail: string | undefined;
  private readonly brevoSenderName: string | undefined;

  constructor(private readonly configService: ConfigService) {
    const host = this.configService.get<string>('SMTP_HOST');
    const port = this.configService.get<number>('SMTP_PORT');
    const user = this.configService.get<string>('SMTP_USER');
    const pass = this.configService.get<string>('SMTP_PASS');
    this.brevoApiKey = this.configService.get<string>('BREVO_API_KEY');
    this.brevoSenderEmail =
      this.configService.get<string>('BREVO_SENDER_EMAIL') ??
      this.configService.get<string>('SMTP_FROM');
    this.brevoSenderName = this.configService.get<string>('BREVO_SENDER_NAME');

    // Brevo HTTP API (порт 443) работает на Render free, в отличие от SMTP 587/465 (ENETUNREACH/ETIMEDOUT)
    if (this.brevoApiKey) {
      this.logger.log('Email via Brevo HTTP API enabled');
    } else if (host && port) {
      const isGmail = host === 'smtp.gmail.com';
      const smtpHost = isGmail ? '142.250.110.108' : host;
      const tls = isGmail ? { servername: 'smtp.gmail.com' } : undefined;
      this.transporter = nodemailer.createTransport({
        host: smtpHost,
        port,
        secure: port === 465,
        auth: user && pass ? { user, pass } : undefined,
        family: 4,
        tls,
        connectionTimeout: 10000,
        greetingTimeout: 10000,
        socketTimeout: 10000,
      } as any);
      if (isGmail) {
        this.logger.log(`SMTP Gmail forced to IPv4 ${smtpHost}: ${port}`);
      }
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

    // Приоритет: Brevo HTTP API (работает на Render), затем SMTP, затем DEV лог
    if (this.brevoApiKey) {
      try {
        const res = await fetch('https://api.brevo.com/v3/smtp/email', {
          method: 'POST',
          headers: {
            'api-key': this.brevoApiKey,
            'content-type': 'application/json',
            accept: 'application/json',
          },
          body: JSON.stringify({
            sender: {
              email: this.brevoSenderEmail ?? from,
              name: this.brevoSenderName ?? 'Noname CRM',
            },
            to: [{ email, name }],
            subject,
            htmlContent: html,
            textContent: text,
          }),
        });
        if (!res.ok) {
          const body = await res.text();
          throw new Error(`Brevo ${res.status}: ${body}`);
        }
        this.logger.log(`Verification email sent via Brevo to ${email}`);
        return;
      } catch (err) {
        const e = err as Error;
        this.logger.error(`Brevo send failed to ${email}: ${e.message}`, e.stack);
        this.logger.log(`[FALLBACK] verification link for ${email}: ${verifyUrl}`);
        return;
      }
    }

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
      this.logger.log(`[FALLBACK] verification link for ${email}: ${verifyUrl}`);
    }
  }
}

import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiTags } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { Public } from './decorators/public.decorator';
import { CurrentUser } from './decorators/current-user.decorator';
import { AuthUser } from './types/auth-user.interface';
import { Throttle } from '@nestjs/throttler';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  private getCookieOpts(isAccess = true) {
    const isProd = process.env.NODE_ENV === 'production';
    // http://localhost:3001 -> https://crm-api-gateway... - кросс-сайт, нужен SameSite=None+Secure
    // локально http + lax тоже работает, для прод ставим none+secure
    return {
      httpOnly: true,
      secure: isProd,
      sameSite: (isProd ? 'none' : 'lax') as 'none' | 'lax',
      path: '/',
      maxAge: isAccess ? 15 * 60 * 1000 : 7 * 24 * 60 * 60 * 1000,
    } as const;
  }

  private setAuthCookies(
    res: Response,
    accessToken: string,
    refreshToken: string,
  ) {
    res.cookie('accessToken', accessToken, this.getCookieOpts(true));
    res.cookie('refreshToken', refreshToken, this.getCookieOpts(false));
  }

  private setRefreshCookie(res: Response, token: string) {
    res.cookie('refreshToken', token, this.getCookieOpts(false));
  }

  private clearAuthCookies(res: Response) {
    res.clearCookie('accessToken', this.getCookieOpts(true));
    res.clearCookie('refreshToken', this.getCookieOpts(false));
  }

  private clearRefreshCookie(res: Response) {
    res.clearCookie('refreshToken', this.getCookieOpts(false));
  }

  @Public()
  @Post('register')
  async register(
    @Body() dto: RegisterDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.authService.register(dto);
    if ('refreshToken' in result) {
      const r = result;
      this.setAuthCookies(res, r.accessToken, r.refreshToken);
      return { accessToken: r.accessToken };
    }
    return result;
  }

  @Public()
  @Get('verify-email')
  verifyEmail(@Query('token') token: string) {
    return this.authService.verifyEmail(token);
  }

  @Public()
  @Post('resend-verification')
  @HttpCode(HttpStatus.OK)
  resendVerification(@Body('email') email: string) {
    return this.authService.resendVerification(email);
  }

  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Public()
  @HttpCode(HttpStatus.OK)
  @Post('login')
  async login(
    @Body() dto: LoginDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const ip =
      (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
      req.ip ||
      req.socket.remoteAddress ||
      'unknown';
    const userAgent = (req.headers['user-agent'] as string) || '';
    const tokens = await this.authService.login(dto, { ip, userAgent });
    this.setAuthCookies(res, tokens.accessToken, tokens.refreshToken);
    return { accessToken: tokens.accessToken };
  }

  @Public()
  @UseGuards(AuthGuard('jwt-refresh'))
  @HttpCode(HttpStatus.OK)
  @Post('refresh')
  async refresh(
    @CurrentUser() user: AuthUser & { refreshToken: string },
    @Res({ passthrough: true }) res: Response,
  ) {
    const tokens = await this.authService.refresh(user.id, user.refreshToken);
    this.setAuthCookies(res, tokens.accessToken, tokens.refreshToken);
    return { accessToken: tokens.accessToken };
  }

  @HttpCode(HttpStatus.NO_CONTENT)
  @Post('logout')
  async logout(
    @CurrentUser('id') userId: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    this.clearAuthCookies(res);
    return this.authService.logout(userId);
  }
}

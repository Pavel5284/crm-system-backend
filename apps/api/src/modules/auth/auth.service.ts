import { ConflictException, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as argon2 from 'argon2';
import { Role } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';

@Injectable()
export class AuthService {
    constructor(
        private readonly prisma: PrismaService,
        private readonly jwtService: JwtService,
        private readonly configService: ConfigService,
    ) {}

    async register(dto: RegisterDto) {
        const existing = await this.prisma.user.findUnique({ where: { email: dto.email } });
        if (existing) throw new ConflictException('Пользователь с таким email уже существует');

        const passwordHash = await argon2.hash(dto.password);
        const user = await this.prisma.user.create({
            data: { email: dto.email, passwordHash, name: dto.name },
        });

        return this.issueTokens(user.id, user.email, user.role);
    }

    async login(dto: LoginDto) {
        const user = await this.prisma.user.findUnique({ where: { email: dto.email } });
        if (!user) throw new UnauthorizedException('Неверный email или пароль');

        const valid = await argon2.verify(user.passwordHash, dto.password);
        if (!valid) throw new UnauthorizedException('Неверный email или пароль');

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
        await this.prisma.user.update({ where: { id: userId }, data: { refreshTokenHash: null } });
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
        await this.prisma.user.update({ where: { id: userId }, data: { refreshTokenHash } });

        return { accessToken, refreshToken };
    }
}
import {
  Body,
  Controller,
  Delete,
  Get,
  Patch,
  Post,
  Req,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { PrismaService } from '@app/database';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserEntity } from './entities/user.entity';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { UpdateAvatarDto } from './dto/update-avatar.dto';

@ApiTags('users')
@Controller('users')
export class UsersController {
  constructor(private readonly prisma: PrismaService) {}

  @Get('me')
  async me(@CurrentUser('id') userId: string) {
    // лёгкая проверка авторизации — без данных пользователя
    const exists = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true },
    });
    if (!exists) return { authenticated: false };
    return { authenticated: true };
  }

  @Get('profile')
  async profile(@CurrentUser('id') userId: string) {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
    });
    // полный профиль для settings
    return new UserEntity(user);
  }

  @Patch('me')
  async updateProfile(
    @CurrentUser('id') userId: string,
    @Body() dto: UpdateProfileDto,
  ) {
    return this.handleUpdate(userId, dto);
  }

  @Patch('updateUserData')
  async updateUserData(
    @CurrentUser('id') userId: string,
    @Body() dto: UpdateProfileDto,
  ) {
    return this.handleUpdate(userId, dto);
  }

  private async handleUpdate(userId: string, dto: UpdateProfileDto) {
    const data: Record<string, unknown> = {};
    if (dto.name !== undefined) data.name = dto.name.trim();
    if (dto.position !== undefined)
      data.position = dto.position?.trim() || null;
    if (dto.phone !== undefined) data.phone = dto.phone?.trim() || null;
    if (dto.telegram !== undefined) {
      if (dto.telegram === null) data.telegram = null;
      else {
        let tg = dto.telegram.trim();
        if (tg && !tg.startsWith('@')) tg = '@' + tg;
        data.telegram = tg || null;
      }
    }
    const user = await this.prisma.user.update({
      where: { id: userId },
      data,
    });
    return new UserEntity(user);
  }

  // отдельный эндпоинт для загрузки фото: POST /users/profile/avatar — возвращает только success
  @Post('profile/avatar')
  async uploadAvatar(
    @CurrentUser('id') userId: string,
    @Body() dto: UpdateAvatarDto,
  ) {
    if (!dto.avatarUrl || !dto.avatarUrl.trim())
      throw new Error('avatarUrl required');
    await this.prisma.user.update({
      where: { id: userId },
      data: { avatarUrl: dto.avatarUrl.trim() },
    });
    return { success: true };
  }

  // отдельный эндпоинт для удаления фото: DELETE /users/profile/avatar — возвращает только success
  @Delete('profile/avatar')
  async deleteAvatar(@CurrentUser('id') userId: string) {
    await this.prisma.user.update({
      where: { id: userId },
      data: { avatarUrl: null },
    });
    return { success: true };
  }

  // совместимость: PATCH /profile/avatar (фото или null) и PATCH /profile/avatar/remove — тоже только success
  @Patch('profile/avatar')
  async updateAvatar(
    @CurrentUser('id') userId: string,
    @Body() dto: UpdateAvatarDto,
  ) {
    const avatarUrl = dto.avatarUrl?.trim() || null;
    await this.prisma.user.update({
      where: { id: userId },
      data: { avatarUrl },
    });
    return { success: true };
  }

  @Patch('profile/avatar/remove')
  async removeAvatarLegacy(@CurrentUser('id') userId: string) {
    await this.prisma.user.update({
      where: { id: userId },
      data: { avatarUrl: null },
    });
    return { success: true };
  }

  @Get('me/visits')
  async visits(
    @CurrentUser('id') userId: string,
    @Req() req: import('express').Request,
  ) {
    const page = Math.max(
      1,
      parseInt((req.query.page as string) || '1', 10) || 1,
    );
    const rawLimit = parseInt((req.query.limit as string) || '10', 10) || 10;
    const limit = [10, 25, 50].includes(rawLimit) ? rawLimit : 10;
    const skip = (page - 1) * limit;

    const [visits, total] = await Promise.all([
      this.prisma.visit.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.visit.count({ where: { userId } }),
    ]);

    return {
      data: visits,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  @Roles(Role.ADMIN)
  @Get()
  async findAll() {
    const users = await this.prisma.user.findMany({
      orderBy: { createdAt: 'desc' },
    });
    return users.map((u) => new UserEntity(u));
  }
}

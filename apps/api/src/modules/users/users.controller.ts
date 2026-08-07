import { Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserEntity } from './entities/user.entity';

@ApiTags('users')
@Controller('users')
export class UsersController {
    constructor(private readonly prisma: PrismaService) {}

    @Get('me')
    async me(@CurrentUser('id') userId: string) {
        const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
        return new UserEntity(user);
    }

    @Roles(Role.ADMIN)
    @Get()
    async findAll() {
        const users = await this.prisma.user.findMany({ orderBy: { createdAt: 'desc' } });
        return users.map((u) => new UserEntity(u));
    }
}
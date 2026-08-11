import { Controller, Get, NotFoundException, Param, ParseUUIDPipe, Patch } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { PrismaService } from '../../prisma/prisma.service';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

@ApiTags('notifications')
@Controller('notifications')
export class NotificationsController {
    constructor(private readonly prisma: PrismaService) {}

    @Get()
    findMine(@CurrentUser('id') userId: string) {
        return this.prisma.notification.findMany({
            where: { userId },
            orderBy: { createdAt: 'desc' },
            take: 50,
        });
    }

    @Patch(':id/read')
    async markRead(@Param('id', ParseUUIDPipe) id: string, @CurrentUser('id') userId: string) {
        const notification = await this.prisma.notification.findUnique({ where: { id } });
        if (!notification || notification.userId !== userId) {
            throw new NotFoundException('Уведомление не найдено');
        }
        return this.prisma.notification.update({ where: { id }, data: { read: true } });
    }
}
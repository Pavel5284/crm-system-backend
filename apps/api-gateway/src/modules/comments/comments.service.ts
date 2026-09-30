import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '@app/database';
import { AuthUser } from '@app/shared';
import { Role } from '@prisma/client';
import { CreateCommentDto } from './dto/create-comment.dto';

@Injectable()
export class CommentsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(dealId: string) {
    return this.prisma.comment.findMany({
      where: { dealId },
      orderBy: { createdAt: 'asc' },
    });
  }

  async create(dto: CreateCommentDto, user: AuthUser) {
    const deal = await this.prisma.deal.findUnique({
      where: { id: dto.dealId },
      select: { id: true },
    });
    if (!deal) {
      throw new NotFoundException(`Сделка ${dto.dealId} не найдена`);
    }

    const author = await this.prisma.user.findUnique({
      where: { id: user.id },
      select: { name: true, email: true },
    });

    return this.prisma.comment.create({
      data: {
        text: dto.text,
        dealId: dto.dealId,
        userId: user.id,
        userName: author?.name ?? '',
        userEmail: author?.email ?? user.email,
      },
    });
  }

  async remove(id: string, requester: AuthUser) {
    const comment = await this.prisma.comment.findUnique({
      where: { id },
      select: { id: true, userId: true },
    });
    if (!comment) {
      throw new NotFoundException(`Комментарий ${id} не найден`);
    }
    // Чужой комментарий может удалить только ADMIN: без проверки любой
    // аутентифицированный пользователь (включая TECHNOLOGIST/LOGIST)
    // мог стереть чужое сообщение.
    if (comment.userId !== requester.id && requester.role !== Role.ADMIN) {
      throw new ForbiddenException(
        'Недостаточно прав для удаления комментария',
      );
    }
    await this.prisma.comment.delete({ where: { id } });
  }
}

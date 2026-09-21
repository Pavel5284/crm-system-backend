import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ClientProxy } from '@nestjs/microservices';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { PrismaService } from '@app/database';
import {
  AuthUser,
  DEAL_EVENTS,
  DealStageChangedEventPayload,
} from '@app/shared';
import { DealPriority } from '@prisma/client';
import { ChangeDealStageDto } from './dto/change-deal-stage.dto';
import { CreateDealDto } from './dto/create-deal.dto';
import { ImportDealDto } from './dto/import-deal.dto';
import { UpdateDealDto } from './dto/update-deal.dto';
import { UpdateMainCommentDto } from './dto/update-main-comment.dto';

export const DEFAULT_DEAL_STAGE = 'todo';

function isFilled(value: unknown): boolean {
  if (value === null || value === undefined) return false;
  if (typeof value === 'string') return value.trim().length > 0;
  return true;
}

type DealWithCustomer = {
  id: string;
  name: string;
  company: string;
  description: string;
  // Опциональное — чтобы добавление полей в схему не роняло сборку,
  // если клиент/mocks ещё без нового поля; в DTO всегда нормализуем в null.
  mainComment?: string | null;
  price: unknown;
  status: string;
  customerId: string;
  responsibleUserId: string | null;
  contactName: string | null;
  contactPhone: string | null;
  deadline: Date | null;
  priority: DealPriority;
  source: string | null;
  isImported: boolean;
  importedBy: string | null;
  createdAt: Date;
  updatedAt: Date;
  customer: { id: string; name: string; email: string };
  responsible?: { name: string } | null;
};

@Injectable()
export class DealsService {
  // За сколько предупреждать о дедлайне — как у задач (TasksService).
  private static readonly DEAL_DUE_SOON_THRESHOLD_MS = 24 * 60 * 60 * 1000;

  constructor(
    private readonly prisma: PrismaService,
    @Inject('NOTIFICATIONS_SERVICE')
    private readonly notificationsClient: ClientProxy,
    @Optional()
    @InjectQueue('deal-reminders')
    private readonly remindersQueue: Queue | undefined,
    // @Inject обязателен: у union-типа metadata нет, без него будет undefined.
    @Optional()
    @Inject(ConfigService)
    private readonly configService: ConfigService | undefined,
  ) {}

  private async scheduleDeadlineReminder(deal: {
    id: string;
    deadline: Date | null;
  }) {
    if (!deal.deadline) return;
    if (!this.configService?.get<string>('VALKEY_URL')) return;
    if (!this.remindersQueue) return;
    const delay =
      deal.deadline.getTime() -
      Date.now() -
      DealsService.DEAL_DUE_SOON_THRESHOLD_MS;
    if (delay <= 0) return;
    try {
      // В jobId нельзя ':' (ограничение BullMQ).
      await this.remindersQueue.add(
        'due-soon',
        { dealId: deal.id },
        { delay, jobId: `deal-due-soon-${deal.id}` },
      );
    } catch {
      // очередь недоступна — игнорируем (напоминания не критичны)
    }
  }

  private async removeDeadlineReminder(id: string) {
    try {
      await this.remindersQueue?.remove(`deal-due-soon-${id}`);
    } catch {
      // ignore — очередь может отсутствовать (нет VALKEY_URL / тесты)
    }
  }

  private toDto(deal: DealWithCustomer) {
    return {
      id: deal.id,
      name: deal.name,
      company: deal.company,
      description: deal.description,
      mainComment: deal.mainComment ?? null,
      price: Number(deal.price),
      status: deal.status,
      customerId: deal.customerId,
      customerName: deal.customer.name,
      customerEmail: deal.customer.email,
      responsibleUserId: deal.responsibleUserId,
      contactName: deal.contactName,
      contactPhone: deal.contactPhone,
      deadline: deal.deadline,
      priority: deal.priority,
      source: deal.source,
      isImported: deal.isImported,
      importedBy: deal.importedBy,
      responsibleName: deal.responsible?.name ?? null,
      createdAt: deal.createdAt,
      updatedAt: deal.updatedAt,
    };
  }

  private async ensureUserExists(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true },
    });
    if (!user) {
      throw new NotFoundException(`Пользователь ${userId} не найден`);
    }
  }

  private async findRule(fromStage: string, toStage: string) {
    return this.prisma.stageTransitionRule.findUnique({
      where: { fromStage_toStage: { fromStage, toStage } },
    });
  }

  async findAll() {
    const deals = await this.prisma.deal.findMany({
      orderBy: { createdAt: 'asc' },
      include: {
        customer: { select: { id: true, name: true, email: true } },
        responsible: { select: { name: true } },
      },
    });
    return deals.map((deal) => this.toDto(deal));
  }

  async findOne(id: string) {
    const deal = await this.prisma.deal.findUnique({
      where: { id },
      include: {
        customer: { select: { id: true, name: true, email: true } },
        responsible: { select: { id: true, name: true, email: true } },
        items: { orderBy: { createdAt: 'asc' } },
        stageHistory: {
          orderBy: { createdAt: 'asc' },
          include: {
            changedBy: { select: { id: true, name: true, email: true } },
          },
        },
        attachments: {
          orderBy: { createdAt: 'asc' },
          include: {
            uploader: { select: { id: true, name: true, email: true } },
          },
        },
      },
    });
    if (!deal) {
      throw new NotFoundException(`Сделка ${id} не найдена`);
    }
    return {
      ...this.toDto(deal),
      responsible: deal.responsible,
      items: deal.items.map((item) => ({
        ...item,
        quantity: Number(item.quantity),
      })),
      stageHistory: deal.stageHistory,
      attachments: deal.attachments,
    };
  }

  async create(dto: CreateDealDto) {
    const email = dto.customerEmail.trim().toLowerCase();
    let customer = await this.prisma.customer.findUnique({ where: { email } });
    if (!customer) {
      customer = await this.prisma.customer.create({
        data: { email, name: dto.customerName },
      });
    }

    // responsibleUserId обязателен при создании (Этап 5): 404 на неизвестный id.
    await this.ensureUserExists(dto.responsibleUserId);

    // Единая точка входа: обычное создание — только stage по умолчанию.
    const deal = await this.prisma.deal.create({
      data: {
        name: dto.name,
        company: dto.company,
        description: dto.description,
        price: dto.price,
        status: DEFAULT_DEAL_STAGE,
        customerId: customer.id,
        responsibleUserId: dto.responsibleUserId,
        contactName: dto.contactName,
        contactPhone: dto.contactPhone,
        deadline: dto.deadline ? new Date(dto.deadline) : undefined,
        priority: dto.priority ?? DealPriority.MEDIUM,
        source: dto.source,
        isImported: false,
      },
      include: { customer: { select: { id: true, name: true, email: true } } },
    });
    await this.scheduleDeadlineReminder(deal);
    return this.toDto(deal);
  }

  async import(dto: ImportDealDto) {
    const email = dto.customerEmail.trim().toLowerCase();
    let customer = await this.prisma.customer.findUnique({ where: { email } });
    if (!customer) {
      customer = await this.prisma.customer.create({
        data: { email, name: dto.customerName },
      });
    }

    await this.ensureUserExists(dto.responsibleUserId);
    await this.ensureUserExists(dto.importedBy);

    const deal = await this.prisma.deal.create({
      data: {
        name: dto.name,
        company: dto.company,
        description: dto.description,
        price: dto.price,
        status: dto.status,
        customerId: customer.id,
        responsibleUserId: dto.responsibleUserId,
        contactName: dto.contactName,
        contactPhone: dto.contactPhone,
        deadline: dto.deadline ? new Date(dto.deadline) : undefined,
        priority: dto.priority ?? DealPriority.MEDIUM,
        source: dto.source,
        isImported: true,
        importedBy: dto.importedBy,
      },
      include: { customer: { select: { id: true, name: true, email: true } } },
    });
    await this.scheduleDeadlineReminder(deal);
    return this.toDto(deal);
  }

  async update(id: string, dto: UpdateDealDto) {
    const existing = await this.prisma.deal.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException(`Сделка ${id} не найдена`);
    }
    if (dto.responsibleUserId) {
      await this.ensureUserExists(dto.responsibleUserId);
    }
    // Stage меняется только через changeStage (state machine).
    const deal = await this.prisma.deal.update({
      where: { id },
      data: {
        company: dto.company,
        description: dto.description,
        responsibleUserId: dto.responsibleUserId,
        contactName: dto.contactName,
        contactPhone: dto.contactPhone,
        deadline: dto.deadline ? new Date(dto.deadline) : undefined,
        priority: dto.priority,
        source: dto.source,
      },
      include: { customer: { select: { id: true, name: true, email: true } } },
    });
    if (
      dto.deadline &&
      deal.deadline?.getTime() !== existing.deadline?.getTime()
    ) {
      await this.removeDeadlineReminder(id);
      await this.scheduleDeadlineReminder(deal);
    }
    return this.toDto(deal);
  }

  // Главный комментарий сделки. Доступ — только ADMIN/MANAGER
  // (проверяется `@Roles` на контроллере). Пустая строка очищает комментарий.
  async updateMainComment(id: string, dto: UpdateMainCommentDto) {
    const existing = await this.prisma.deal.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException(`Сделка ${id} не найдена`);
    }
    const mainComment = dto.comment.trim() ? dto.comment.trim() : null;
    const deal = await this.prisma.deal.update({
      where: { id },
      data: { mainComment },
      include: { customer: { select: { id: true, name: true, email: true } } },
    });
    return this.toDto(deal);
  }

  async changeStage(id: string, dto: ChangeDealStageDto, actor: AuthUser) {
    const existing = await this.prisma.deal.findUnique({
      where: { id },
      include: { customer: { select: { id: true, name: true, email: true } } },
    });
    if (!existing) {
      throw new NotFoundException(`Сделка ${id} не найдена`);
    }

    const fromStage = existing.status;
    const toStage = dto.targetStage;

    // Идемпотентность: переход в текущий stage — no-op без записи в историю.
    if (fromStage === toStage) {
      return this.toDto(existing);
    }

    const rule = await this.findRule(fromStage, toStage);
    if (!rule) {
      throw new BadRequestException(
        `Переход сделки из стадии "${fromStage}" в стадию "${toStage}" запрещён: правило не найдено`,
      );
    }

    if (!rule.allowedRoles.includes(actor.role)) {
      const allowed =
        rule.allowedRoles.length > 0 ? rule.allowedRoles.join(', ') : '—';
      throw new BadRequestException(
        `Переход сделки из стадии "${fromStage}" в стадию "${toStage}" запрещён для роли "${actor.role}". Разрешённые роли: ${allowed}`,
      );
    }

    const record = existing as unknown as Record<string, unknown>;
    const missing = rule.requiredFields.filter((f) => !isFilled(record[f]));
    if (missing.length > 0) {
      throw new BadRequestException(
        `Для перехода сделки из стадии "${fromStage}" в стадию "${toStage}" заполните обязательные поля: ${missing.join(', ')}`,
      );
    }

    await this.ensureUserExists(actor.id);

    const [updated] = await this.prisma.$transaction([
      this.prisma.deal.update({
        where: { id },
        data: { status: toStage },
        include: {
          customer: { select: { id: true, name: true, email: true } },
        },
      }),
      this.prisma.dealStageHistory.create({
        data: {
          dealId: id,
          fromStage,
          toStage,
          changedByUserId: actor.id,
          comment: dto.comment ?? null,
        },
      }),
    ]);

    // Этап 8: уведомляем ответственного за следующий этап (кроме смены
    // собственным ответственным). Fire-and-forget, как события задач.
    if (updated.responsibleUserId && updated.responsibleUserId !== actor.id) {
      const payload: DealStageChangedEventPayload = {
        deal: {
          id: updated.id,
          name: updated.name,
          company: updated.company,
          status: updated.status,
          responsibleUserId: updated.responsibleUserId,
          deadline: updated.deadline ? updated.deadline.toISOString() : null,
        },
        fromStage,
        toStage,
        comment: dto.comment ?? null,
        actorId: actor.id,
      };
      this.notificationsClient.emit(DEAL_EVENTS.STAGE_CHANGED, payload);
    }

    return this.toDto(updated);
  }

  // Разрешённые ТЕКУЩЕМУ пользователю переходы (для UX: скрытие недоступных
  // действий на фронтенде). Проверки только по правилу и роли — без
  // requiredFields: их бэкенд всё равно проверит при попытке перехода.
  async getAllowedTransitions(actor: AuthUser) {
    const rules = await this.prisma.stageTransitionRule.findMany({
      orderBy: [{ fromStage: 'asc' }, { toStage: 'asc' }],
      select: { fromStage: true, toStage: true, allowedRoles: true },
    });
    return rules
      .filter((rule) => rule.allowedRoles.includes(actor.role))
      .map(({ fromStage, toStage }) => ({ fromStage, toStage }));
  }

  async remove(id: string) {
    const existing = await this.prisma.deal.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!existing) {
      throw new NotFoundException(`Сделка ${id} не найдена`);
    }
    // Позиции, история стадий, вложения и комментарии удаляются каскадом (FK).
    await this.prisma.deal.delete({ where: { id } });
    await this.removeDeadlineReminder(id);
  }
}

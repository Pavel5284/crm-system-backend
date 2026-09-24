import {
  BadRequestException,
  ConflictException,
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
import { CreateDealDto, NewCustomerDto } from './dto/create-deal.dto';
import { ImportDealDto } from './dto/import-deal.dto';
import { UpdateDealDto } from './dto/update-deal.dto';
import { UpdateMainCommentDto } from './dto/update-main-comment.dto';
import { UpdateResponsiblesDto } from './dto/update-responsibles.dto';

export const DEFAULT_DEAL_STAGE = 'todo';

// Компания/контакты/телефон/источник берутся из связанного клиента
// джойном по customerId (client_id) — в самой сделке не хранятся.
const CUSTOMER_SELECT = {
  id: true,
  name: true,
  email: true,
  phone: true,
  contactPerson: true,
  fromSource: true,
} as const;

type DealCustomer = {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  contactPerson: string | null;
  fromSource: string | null;
};

function isFilled(value: unknown): boolean {
  if (value === null || value === undefined) return false;
  if (typeof value === 'string') return value.trim().length > 0;
  return true;
}

type DealWithCustomer = {
  id: string;
  name: string;
  description: string;
  // Опциональное — чтобы добавление полей в схему не роняло сборку,
  // если клиент/mocks ещё без нового поля; в DTO всегда нормализуем в null.
  mainComment?: string | null;
  price: unknown;
  status: string;
  customerId: string;
  responsibleUserId: string | null;
  responsibleUserIds?: string[];
  deadline: Date | null;
  priority: DealPriority;
  isImported: boolean;
  importedBy: string | null;
  createdAt: Date;
  updatedAt: Date;
  customer: DealCustomer;
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
      description: deal.description,
      mainComment: deal.mainComment ?? null,
      price: Number(deal.price),
      status: deal.status,
      customerId: deal.customerId,
      customer: deal.customer,
      responsibleUserId: deal.responsibleUserId,
      deadline: deal.deadline,
      priority: deal.priority,
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

  // Клиент сделки: либо выбор существующего (customerId),
  // либо создание нового (newCustomer). Ровно один вариант.
  private async resolveCustomer(dto: {
    customerId?: string;
    newCustomer?: NewCustomerDto;
  }) {
    if (dto.customerId && dto.newCustomer) {
      throw new BadRequestException(
        'Укажите либо customerId, либо newCustomer, но не оба сразу',
      );
    }
    if (dto.customerId) {
      const customer = await this.prisma.customer.findUnique({
        where: { id: dto.customerId },
      });
      if (!customer) {
        throw new NotFoundException(`Клиент ${dto.customerId} не найден`);
      }
      return customer;
    }
    if (dto.newCustomer) {
      const email = dto.newCustomer.email.trim().toLowerCase();
      const duplicate = await this.prisma.customer.findUnique({
        where: { email },
        select: { id: true },
      });
      if (duplicate) {
        throw new ConflictException(
          `Клиент с email ${email} уже существует — выберите его из списка`,
        );
      }
      return this.prisma.customer.create({
        data: {
          name: dto.newCustomer.name,
          email,
          phone: dto.newCustomer.phone,
          contactPerson: dto.newCustomer.contactPerson,
          fromSource: dto.newCustomer.fromSource,
        },
      });
    }
    throw new BadRequestException(
      'Укажите клиента сделки: customerId или newCustomer',
    );
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
        customer: { select: CUSTOMER_SELECT },
        responsible: { select: { name: true } },
      },
    });
    return deals.map((deal) => this.toDto(deal));
  }

  async findOne(id: string) {
    const deal = await this.prisma.deal.findUnique({
      where: { id },
      include: {
        customer: { select: CUSTOMER_SELECT },
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
    // Ответственные в порядке массива (первый = главный).
    // Fallback на одиночный responsibleUserId — для строк до бэкфилла.
    const responsibleIds = deal.responsibleUserIds?.length
      ? deal.responsibleUserIds
      : deal.responsibleUserId
        ? [deal.responsibleUserId]
        : [];
    const responsibleUsers = responsibleIds.length
      ? await this.prisma.user.findMany({
          where: { id: { in: responsibleIds } },
          select: { id: true, name: true, email: true },
        })
      : [];
    const usersById = new Map(responsibleUsers.map((u) => [u.id, u]));
    return {
      ...this.toDto(deal),
      responsible: deal.responsible,
      responsibles: responsibleIds
        .map((userId) => usersById.get(userId))
        .filter((u): u is { id: string; name: string; email: string } => !!u),
      items: deal.items.map((item) => ({
        ...item,
        quantity: Number(item.quantity),
      })),
      stageHistory: deal.stageHistory,
      attachments: deal.attachments,
    };
  }

  async create(dto: CreateDealDto) {
    const customer = await this.resolveCustomer(dto);

    // responsibleUserId обязателен при создании (Этап 5): 404 на неизвестный id.
    await this.ensureUserExists(dto.responsibleUserId);

    // Единая точка входа: обычное создание — только stage по умолчанию.
    const deal = await this.prisma.deal.create({
      data: {
        name: dto.name,
        description: dto.description,
        price: dto.price,
        status: DEFAULT_DEAL_STAGE,
        customerId: customer.id,
        responsibleUserId: dto.responsibleUserId,
        responsibleUserIds: [dto.responsibleUserId],
        deadline: dto.deadline ? new Date(dto.deadline) : undefined,
        priority: dto.priority ?? DealPriority.MEDIUM,
        isImported: false,
      },
      include: { customer: { select: CUSTOMER_SELECT } },
    });
    await this.scheduleDeadlineReminder(deal);
    return this.toDto(deal);
  }

  async import(dto: ImportDealDto) {
    const customer = await this.resolveCustomer(dto);

    await this.ensureUserExists(dto.responsibleUserId);
    await this.ensureUserExists(dto.importedBy);

    const deal = await this.prisma.deal.create({
      data: {
        name: dto.name,
        description: dto.description,
        price: dto.price,
        status: dto.status,
        customerId: customer.id,
        responsibleUserId: dto.responsibleUserId,
        responsibleUserIds: [dto.responsibleUserId],
        deadline: dto.deadline ? new Date(dto.deadline) : undefined,
        priority: dto.priority ?? DealPriority.MEDIUM,
        isImported: true,
        importedBy: dto.importedBy,
      },
      include: { customer: { select: CUSTOMER_SELECT } },
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
    // Инвариант: responsibleUserIds[0] = главный = responsibleUserId,
    // поэтому смена главного через старый эндпоинт двигает его в начало списка.
    const deal = await this.prisma.deal.update({
      where: { id },
      data: {
        description: dto.description,
        responsibleUserId: dto.responsibleUserId,
        ...(dto.responsibleUserId !== undefined
          ? {
              responsibleUserIds: [
                dto.responsibleUserId,
                ...(existing.responsibleUserIds ?? []).filter(
                  (userId) => userId !== dto.responsibleUserId,
                ),
              ],
            }
          : {}),
        deadline: dto.deadline ? new Date(dto.deadline) : undefined,
        priority: dto.priority,
      },
      include: { customer: { select: CUSTOMER_SELECT } },
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

  // Полная замена состава ответственных. Первый id = главный
  // (пишется и в responsibleUserId для совместимости уведомлений/фильтров).
  // Пустой массив снимает всех. Доступ — как у PATCH /deals/:id.
  async updateResponsibles(id: string, dto: UpdateResponsiblesDto) {
    const existing = await this.prisma.deal.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException(`Сделка ${id} не найдена`);
    }
    const ids = [...new Set((dto.userIds ?? []).filter(Boolean))];
    if (ids.length > 0) {
      const found = await this.prisma.user.findMany({
        where: { id: { in: ids } },
        select: { id: true },
      });
      const missing = ids.find((userId) => !found.some((u) => u.id === userId));
      if (missing) {
        throw new NotFoundException(`Пользователь ${missing} не найден`);
      }
    }
    const deal = await this.prisma.deal.update({
      where: { id },
      data: { responsibleUserIds: ids, responsibleUserId: ids[0] ?? null },
      include: { customer: { select: CUSTOMER_SELECT } },
    });
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
      include: { customer: { select: CUSTOMER_SELECT } },
    });
    return this.toDto(deal);
  }

  async changeStage(id: string, dto: ChangeDealStageDto, actor: AuthUser) {
    const existing = await this.prisma.deal.findUnique({
      where: { id },
      include: { customer: { select: CUSTOMER_SELECT } },
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
          customer: { select: CUSTOMER_SELECT },
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
          customerName: updated.customer.name,
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

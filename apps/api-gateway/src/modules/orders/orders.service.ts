import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '@app/database';
import {
  AuthUser,
  ORDER_ADMIN_ONLY_STATUSES,
  ORDER_STATUS_TRANSITIONS,
} from '@app/shared';
import { OrderStatus, Role } from '@prisma/client';
import { CreateOrderDto } from './dto/create-order.dto';
import { UpdateOrderDto } from './dto/update-order.dto';
import { ChangeOrderStatusDto } from './dto/change-order-status.dto';

const CUSTOMER_SELECT = {
  id: true,
  name: true,
  email: true,
  phone: true,
  contactPerson: true,
} as const;

const DEAL_SELECT = {
  id: true,
  name: true,
  price: true,
  status: true,
  customerId: true,
} as const;

function itemsTotal(items: Array<{ price: number; quantity: number }>): number {
  return items.reduce(
    (sum, item) => sum + Number(item.price) * Number(item.quantity),
    0,
  );
}

function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

type OrderItemInput = {
  name: string;
  quantity: number;
  unit?: string | null;
  price: number;
  spec?: string | null;
};

@Injectable()
export class OrdersService {
  constructor(private readonly prisma: PrismaService) {}

  private toListDto(order: {
    id: string;
    number: number;
    dealId: string | null;
    customerId: string;
    total: unknown;
    status: OrderStatus;
    comment: string | null;
    createdAt: Date;
    updatedAt: Date;
    customer: { id: string; name: string };
    deal: { id: string; name: string } | null;
    payments: Array<{ amount: unknown; status: string }>;
  }) {
    const total = Number(order.total);
    const paid = round2(
      order.payments
        .filter((p) => p.status === 'SUCCEEDED')
        .reduce((sum, p) => sum + Number(p.amount), 0),
    );
    return {
      id: order.id,
      number: order.number,
      dealId: order.dealId,
      dealName: order.deal?.name ?? null,
      customerId: order.customerId,
      customerName: order.customer.name,
      total,
      paid,
      remaining: round2(total - paid),
      status: order.status,
      comment: order.comment,
      createdAt: order.createdAt,
      updatedAt: order.updatedAt,
    };
  }

  async findAll(query: {
    status?: OrderStatus;
    customerId?: string;
    dealId?: string;
  }) {
    const orders = await this.prisma.order.findMany({
      where: {
        status: query.status,
        customerId: query.customerId,
        dealId: query.dealId,
      },
      orderBy: { number: 'desc' },
      include: {
        customer: { select: { id: true, name: true } },
        deal: { select: { id: true, name: true } },
        payments: { select: { amount: true, status: true } },
      },
    });
    return orders.map((order) => this.toListDto(order));
  }

  async findOne(id: string) {
    const order = await this.prisma.order.findUnique({
      where: { id },
      include: {
        customer: { select: CUSTOMER_SELECT },
        deal: { select: DEAL_SELECT },
        createdBy: { select: { id: true, name: true, email: true } },
        items: { orderBy: { createdAt: 'asc' } },
        payments: { orderBy: { createdAt: 'desc' } },
        statusHistory: {
          orderBy: { createdAt: 'asc' },
          include: {
            changedBy: { select: { id: true, name: true, email: true } },
          },
        },
      },
    });
    if (!order) {
      throw new NotFoundException(`Заказ ${id} не найден`);
    }
    const total = Number(order.total);
    const paid = round2(
      order.payments
        .filter((p) => p.status === 'SUCCEEDED')
        .reduce((sum, p) => sum + Number(p.amount), 0),
    );
    return {
      id: order.id,
      number: order.number,
      dealId: order.dealId,
      deal: order.deal,
      customerId: order.customerId,
      customer: order.customer,
      createdBy: order.createdBy,
      total,
      paid,
      remaining: round2(total - paid),
      status: order.status,
      comment: order.comment,
      items: order.items.map((item) => ({
        ...item,
        quantity: Number(item.quantity),
        price: Number(item.price),
        lineTotal: round2(Number(item.price) * Number(item.quantity)),
      })),
      payments: order.payments.map((p) => ({
        ...p,
        amount: Number(p.amount),
      })),
      statusHistory: order.statusHistory,
      createdAt: order.createdAt,
      updatedAt: order.updatedAt,
    };
  }

  async create(dto: CreateOrderDto, actorId?: string) {
    if (dto.dealId && dto.customerId) {
      throw new BadRequestException(
        'Укажите либо dealId, либо customerId, но не оба сразу',
      );
    }
    if (!dto.dealId && !dto.customerId) {
      throw new BadRequestException(
        'Укажите источник заказа: dealId (из сделки) или customerId (вручную)',
      );
    }

    let customerId = dto.customerId ?? '';
    let dealPrice: number | null = null;
    let dealItems: Array<{
      name: string;
      quantity: number;
      unit: string | null;
      spec: string | null;
    }> = [];

    if (dto.dealId) {
      const deal = await this.prisma.deal.findUnique({
        where: { id: dto.dealId },
        include: {
          items: { orderBy: { createdAt: 'asc' } },
        },
      });
      if (!deal) {
        throw new NotFoundException(`Сделка ${dto.dealId} не найдена`);
      }
      customerId = deal.customerId;
      dealPrice = Number(deal.price);
      dealItems = deal.items.map((item) => ({
        name: item.name,
        quantity: Number(item.quantity),
        unit: item.unit,
        spec: item.spec,
      }));
    } else {
      const customer = await this.prisma.customer.findUnique({
        where: { id: customerId },
        select: { id: true },
      });
      if (!customer) {
        throw new NotFoundException(`Клиент ${customerId} не найден`);
      }
    }

    // Позиции: явные из запроса, иначе — слепок позиций сделки (цена 0,
    // итог берётся из цены сделки). Слепок фиксирует состав на момент счёта.
    const explicitItems: OrderItemInput[] = dto.items ?? [];
    const items: OrderItemInput[] =
      explicitItems.length > 0
        ? explicitItems
        : dealItems.map((item) => ({ ...item, price: 0 }));

    let total: number;
    if (dto.total !== undefined) {
      total = dto.total;
    } else if (items.length > 0 && explicitItems.length > 0) {
      total = round2(itemsTotal(items));
    } else if (dealPrice !== null) {
      total = dealPrice;
    } else {
      throw new BadRequestException(
        'Укажите total или позиции заказа (items) для расчёта суммы',
      );
    }
    if (total < 0) {
      throw new BadRequestException('Сумма заказа не может быть отрицательной');
    }

    const order = await this.prisma.order.create({
      data: {
        dealId: dto.dealId,
        customerId,
        createdById: actorId,
        total,
        status: OrderStatus.DRAFT,
        comment: dto.comment,
        items: {
          create: items.map((item) => ({
            name: item.name,
            quantity: item.quantity,
            unit: item.unit ?? undefined,
            price: item.price,
            spec: item.spec ?? undefined,
          })),
        },
        statusHistory: {
          create: {
            fromStatus: null,
            toStatus: OrderStatus.DRAFT,
            changedByUserId: actorId,
            comment: 'Заказ создан',
          },
        },
      },
      include: {
        customer: { select: { id: true, name: true } },
        deal: { select: { id: true, name: true } },
        payments: { select: { amount: true, status: true } },
      },
    });
    return this.toListDto(order);
  }

  async update(id: string, dto: UpdateOrderDto) {
    const existing = await this.prisma.order.findUnique({
      where: { id },
      include: { payments: { select: { amount: true, status: true } } },
    });
    if (!existing) {
      throw new NotFoundException(`Заказ ${id} не найден`);
    }
    if (
      existing.status !== OrderStatus.DRAFT &&
      existing.status !== OrderStatus.CONFIRMED
    ) {
      throw new BadRequestException(
        `Заказ в статусе "${existing.status}" нельзя редактировать (только DRAFT/CONFIRMED)`,
      );
    }
    const paid = existing.payments
      .filter((p) => p.status === 'SUCCEEDED')
      .reduce((sum, p) => sum + Number(p.amount), 0);
    const nextTotal =
      dto.total !== undefined
        ? dto.total
        : dto.items
          ? round2(itemsTotal(dto.items))
          : Number(existing.total);
    if (nextTotal < 0) {
      throw new BadRequestException('Сумма заказа не может быть отрицательной');
    }
    if (round2(nextTotal - paid) < 0) {
      throw new BadRequestException(
        `Сумма заказа (${nextTotal}) меньше уже оплаченного (${paid})`,
      );
    }

    const updated = await this.prisma.order.update({
      where: { id },
      data: {
        comment: dto.comment,
        total: dto.total !== undefined || dto.items ? nextTotal : undefined,
        ...(dto.items
          ? {
              items: {
                deleteMany: {},
                create: dto.items.map((item) => ({
                  name: item.name,
                  quantity: item.quantity,
                  unit: item.unit ?? undefined,
                  price: item.price,
                  spec: item.spec ?? undefined,
                })),
              },
            }
          : {}),
      },
      include: {
        customer: { select: { id: true, name: true } },
        deal: { select: { id: true, name: true } },
        payments: { select: { amount: true, status: true } },
      },
    });
    return this.toListDto(updated);
  }

  async changeStatus(id: string, dto: ChangeOrderStatusDto, actor: AuthUser) {
    const existing = await this.prisma.order.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException(`Заказ ${id} не найден`);
    }
    if (existing.status === dto.status) {
      return this.findOne(id);
    }
    const allowed = ORDER_STATUS_TRANSITIONS[existing.status] ?? [];
    if (!allowed.includes(dto.status)) {
      throw new BadRequestException(
        `Переход заказа из "${existing.status}" в "${dto.status}" запрещён`,
      );
    }
    if (
      ORDER_ADMIN_ONLY_STATUSES.includes(dto.status) &&
      actor.role !== Role.ADMIN
    ) {
      throw new BadRequestException(
        `Переход в "${dto.status}" доступен только администратору`,
      );
    }
    await this.prisma.$transaction([
      this.prisma.order.update({
        where: { id },
        data: { status: dto.status },
      }),
      this.prisma.orderStatusHistory.create({
        data: {
          orderId: id,
          fromStatus: existing.status,
          toStatus: dto.status,
          changedByUserId: actor.id,
          comment: dto.comment ?? null,
        },
      }),
    ]);
    return this.findOne(id);
  }

  // Автопересчёт статуса по успешным платежам. Вызывается из PaymentsService
  // после каждой смены статуса платежа. Терминальные CANCELLED/REFUNDED
  // автоматикой не трогаем — только ручные переходы.
  async recalcStatus(orderId: string, actorId?: string) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { payments: { select: { amount: true, status: true } } },
    });
    if (!order) return;
    if (
      order.status === OrderStatus.CANCELLED ||
      order.status === OrderStatus.REFUNDED
    ) {
      return;
    }
    const total = Number(order.total);
    const paid = round2(
      order.payments
        .filter((p) => p.status === 'SUCCEEDED')
        .reduce((sum, p) => sum + Number(p.amount), 0),
    );
    let next: OrderStatus | null = null;
    if (total > 0 && paid >= total) {
      next = OrderStatus.PAID;
    } else if (paid > 0) {
      next = OrderStatus.PARTIALLY_PAID;
    } else if (
      order.status === OrderStatus.PARTIALLY_PAID ||
      order.status === OrderStatus.PAID
    ) {
      // Все оплаты возвращены/отменены — откатываемся на CONFIRMED.
      next = OrderStatus.CONFIRMED;
    }
    if (!next || next === order.status) return;
    // Статус оплаты — производное от суммы SUCCEEDED-платежей, поэтому
    // автоматика не связана матрицей ручных переходов: возвраты обязаны
    // понижать статус (PAID → PARTIALLY_PAID → CONFIRMED), иначе карточка
    // врёт. Матрица действует только на ручной PATCH /orders/:id/status.
    // Исключение — DRAFT: сначала фиксируем CONFIRMED отдельным шагом,
    // чтобы история не теряла подтверждение первой оплатой.
    const viaConfirm =
      order.status === OrderStatus.DRAFT &&
      (next === OrderStatus.PARTIALLY_PAID || next === OrderStatus.PAID);
    await this.prisma.$transaction(async (tx) => {
      if (viaConfirm) {
        await tx.order.update({
          where: { id: orderId },
          data: { status: OrderStatus.CONFIRMED },
        });
        await tx.orderStatusHistory.create({
          data: {
            orderId,
            fromStatus: OrderStatus.DRAFT,
            toStatus: OrderStatus.CONFIRMED,
            changedByUserId: actorId,
            comment: 'Автоподтверждение первой оплатой',
          },
        });
      }
      const from: OrderStatus = viaConfirm
        ? OrderStatus.CONFIRMED
        : order.status;
      await tx.order.update({
        where: { id: orderId },
        data: { status: next },
      });
      await tx.orderStatusHistory.create({
        data: {
          orderId,
          fromStatus: from,
          toStatus: next,
          changedByUserId: actorId,
          comment: `Автопересчёт: оплачено ${paid} из ${total}`,
        },
      });
    });
  }

  async remove(id: string) {
    const existing = await this.prisma.order.findUnique({
      where: { id },
      include: { payments: { select: { status: true } } },
    });
    if (!existing) {
      throw new NotFoundException(`Заказ ${id} не найден`);
    }
    const hasMoney = existing.payments.some(
      (p) => p.status === 'SUCCEEDED' || p.status === 'REFUNDED',
    );
    if (hasMoney) {
      throw new BadRequestException(
        'Заказ с движением денег нельзя удалить — отмените или верните его',
      );
    }
    // Позиции, платежи (pending/failed) и история удаляются каскадом (FK).
    await this.prisma.order.delete({ where: { id } });
  }
}

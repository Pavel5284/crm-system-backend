import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '@app/database';
import { PAYMENT_STATUS_TRANSITIONS } from '@app/shared';
import { OrderStatus, PaymentStatus, Prisma } from '@prisma/client';
import { CreatePaymentDto } from './dto/create-payment.dto';
import { ChangePaymentStatusDto } from './dto/change-payment-status.dto';
import { OrdersService } from '../orders/orders.service';

function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

@Injectable()
export class PaymentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ordersService: OrdersService,
  ) {}

  private toDto(payment: {
    id: string;
    orderId: string;
    amount: unknown;
    method: string;
    status: PaymentStatus;
    comment: string | null;
    paidAt: Date | null;
    createdById: string | null;
    createdAt: Date;
    updatedAt: Date;
  }) {
    return {
      ...payment,
      amount: Number(payment.amount),
    };
  }

  async findAll(query: { orderId?: string; status?: PaymentStatus }) {
    const payments = await this.prisma.payment.findMany({
      where: { orderId: query.orderId, status: query.status },
      orderBy: { createdAt: 'desc' },
      include: {
        order: {
          select: {
            id: true,
            number: true,
            total: true,
            status: true,
            customer: { select: { id: true, name: true } },
          },
        },
      },
    });
    return payments.map((p) => ({
      ...this.toDto(p),
      orderNumber: p.order.number,
      orderTotal: Number(p.order.total),
      orderStatus: p.order.status,
      customerName: p.order.customer.name,
    }));
  }

  async findOne(id: string) {
    const payment = await this.prisma.payment.findUnique({
      where: { id },
      include: {
        order: {
          select: {
            id: true,
            number: true,
            total: true,
            status: true,
            customer: { select: { id: true, name: true } },
          },
        },
        createdBy: { select: { id: true, name: true, email: true } },
        statusHistory: {
          orderBy: { createdAt: 'asc' },
          include: {
            changedBy: { select: { id: true, name: true, email: true } },
          },
        },
      },
    });
    if (!payment) {
      throw new NotFoundException(`Платёж ${id} не найден`);
    }
    return { ...this.toDto(payment), statusHistory: payment.statusHistory };
  }

  private async orderPaidSumInTransaction(
    transaction: Prisma.TransactionClient,
    orderId: string,
    excludePaymentId?: string,
  ) {
    const payments = await transaction.payment.findMany({
      where: {
        orderId,
        status: PaymentStatus.SUCCEEDED,
        ...(excludePaymentId ? { id: { not: excludePaymentId } } : {}),
      },
      select: { amount: true },
    });
    return round2(payments.reduce((sum, p) => sum + Number(p.amount), 0));
  }

  // Блокировка строки заказа на время проверки остатка и проводки.
  // Без неё два параллельных SUCCEEDED-платежа проходят проверку остатка
  // одновременно и суммарно переплачивают (классический double-spend).
  private lockOrder(transaction: Prisma.TransactionClient, orderId: string) {
    return transaction.$queryRaw`SELECT "id" FROM "orders" WHERE "id" = ${orderId} FOR UPDATE`;
  }

  private overpayError(amount: number, total: number, paid: number) {
    return new BadRequestException(
      `Платёж ${amount} превышает остаток ${round2(total - paid)} по заказу`,
    );
  }

  async create(dto: CreatePaymentDto, actorId?: string) {
    const order = await this.prisma.order.findUnique({
      where: { id: dto.orderId },
    });
    if (!order) {
      throw new NotFoundException(`Заказ ${dto.orderId} не найден`);
    }
    if (
      order.status === OrderStatus.CANCELLED ||
      order.status === OrderStatus.REFUNDED
    ) {
      throw new BadRequestException(
        `Нельзя принимать оплату по заказу в статусе "${order.status}"`,
      );
    }
    const initialStatus = dto.status ?? PaymentStatus.PENDING;
    if (
      initialStatus !== PaymentStatus.PENDING &&
      initialStatus !== PaymentStatus.SUCCEEDED
    ) {
      throw new BadRequestException(
        'При создании допустимы только статусы PENDING или SUCCEEDED',
      );
    }
    if (initialStatus === PaymentStatus.SUCCEEDED) {
      const payment = await this.prisma.$transaction(async (transaction) => {
        await this.lockOrder(transaction, dto.orderId);
        const total = Number(order.total);
        const paid = await this.orderPaidSumInTransaction(
          transaction,
          dto.orderId,
        );
        if (round2(paid + dto.amount - total) > 0) {
          throw this.overpayError(dto.amount, total, paid);
        }
        const created = await transaction.payment.create({
          data: {
            orderId: dto.orderId,
            amount: dto.amount,
            method: dto.method ?? 'TRANSFER',
            status: PaymentStatus.SUCCEEDED,
            comment: dto.comment,
            paidAt: new Date(),
            createdById: actorId,
          },
        });
        await transaction.paymentStatusHistory.create({
          data: {
            paymentId: created.id,
            fromStatus: null,
            toStatus: PaymentStatus.SUCCEEDED,
            changedByUserId: actorId,
            comment: dto.comment ?? 'Платёж создан и подтверждён',
          },
        });
        return created;
      });
      await this.ordersService.recalcStatus(dto.orderId, actorId);
      return this.toDto(payment);
    }

    // Дальше — только PENDING: ветка SUCCEEDED вернулась выше.
    // Создание платежа и первая запись аудита — атомарно.
    const payment = await this.prisma.$transaction(async (transaction) => {
      const created = await transaction.payment.create({
        data: {
          orderId: dto.orderId,
          amount: dto.amount,
          method: dto.method ?? 'TRANSFER',
          status: PaymentStatus.PENDING,
          comment: dto.comment,
          paidAt: null,
          createdById: actorId,
        },
      });
      await transaction.paymentStatusHistory.create({
        data: {
          paymentId: created.id,
          fromStatus: null,
          toStatus: PaymentStatus.PENDING,
          changedByUserId: actorId,
          comment: dto.comment ?? 'Платёж создан',
        },
      });
      return created;
    });
    return this.toDto(payment);
  }

  async changeStatus(
    id: string,
    dto: ChangePaymentStatusDto,
    actorId?: string,
  ) {
    const existing = await this.prisma.payment.findUnique({
      where: { id },
      include: { order: true },
    });
    if (!existing) {
      throw new NotFoundException(`Платёж ${id} не найден`);
    }
    if (existing.status === dto.status) {
      return this.toDto(existing);
    }
    const allowed = PAYMENT_STATUS_TRANSITIONS[existing.status] ?? [];
    if (!allowed.includes(dto.status)) {
      throw new BadRequestException(
        `Переход платежа из "${existing.status}" в "${dto.status}" запрещён`,
      );
    }
    if (dto.status === PaymentStatus.SUCCEEDED) {
      const updated = await this.prisma.$transaction(async (transaction) => {
        await this.lockOrder(transaction, existing.orderId);
        const current = await transaction.payment.findUnique({
          where: { id },
          include: { order: true },
        });
        if (!current) {
          throw new NotFoundException(`Платёж ${id} не найден`);
        }
        // Платёж могли подтвердить/вернуть параллельным запросом —
        // перепроверяем переход уже под блокировкой.
        const freshAllowed = PAYMENT_STATUS_TRANSITIONS[current.status] ?? [];
        if (!freshAllowed.includes(PaymentStatus.SUCCEEDED)) {
          throw new BadRequestException(
            `Переход платежа из "${current.status}" в "${PaymentStatus.SUCCEEDED}" запрещён`,
          );
        }
        if (
          current.order.status === OrderStatus.CANCELLED ||
          current.order.status === OrderStatus.REFUNDED
        ) {
          throw new BadRequestException(
            `Нельзя подтверждать оплату по заказу в статусе "${current.order.status}"`,
          );
        }
        const total = Number(current.order.total);
        const paid = await this.orderPaidSumInTransaction(
          transaction,
          current.orderId,
          current.id,
        );
        const amount = Number(current.amount);
        if (round2(paid + amount - total) > 0) {
          throw this.overpayError(amount, total, paid);
        }
        const updated = await transaction.payment.update({
          where: { id },
          data: {
            status: PaymentStatus.SUCCEEDED,
            comment: dto.comment ?? current.comment,
            paidAt: current.paidAt ?? new Date(),
          },
        });
        await transaction.paymentStatusHistory.create({
          data: {
            paymentId: id,
            fromStatus: current.status,
            toStatus: PaymentStatus.SUCCEEDED,
            changedByUserId: actorId,
            comment: dto.comment ?? null,
          },
        });
        return updated;
      });
      await this.ordersService.recalcStatus(existing.orderId, actorId);
      return this.toDto(updated);
    }

    // Остальные переходы денег не добавляют — блокировка строки не нужна,
    // но запись платежа и запись аудита пишем атомарно.
    const updated = await this.prisma.$transaction(async (transaction) => {
      const updatedPayment = await transaction.payment.update({
        where: { id },
        data: {
          status: dto.status,
          comment: dto.comment ?? existing.comment,
          paidAt: dto.status === PaymentStatus.PENDING ? null : existing.paidAt,
        },
      });
      await transaction.paymentStatusHistory.create({
        data: {
          paymentId: id,
          fromStatus: existing.status,
          toStatus: dto.status,
          changedByUserId: actorId,
          comment: dto.comment ?? null,
        },
      });
      return updatedPayment;
    });
    await this.ordersService.recalcStatus(existing.orderId, actorId);
    return this.toDto(updated);
  }

  async refund(id: string, actorId?: string, comment?: string) {
    return this.changeStatus(
      id,
      { status: PaymentStatus.REFUNDED, comment },
      actorId,
    );
  }

  async remove(id: string) {
    const existing = await this.prisma.payment.findUnique({
      where: { id },
      select: { id: true, status: true, orderId: true },
    });
    if (!existing) {
      throw new NotFoundException(`Платёж ${id} не найден`);
    }
    if (
      existing.status !== PaymentStatus.PENDING &&
      existing.status !== PaymentStatus.FAILED &&
      existing.status !== PaymentStatus.CANCELLED
    ) {
      throw new BadRequestException(
        `Платёж в статусе "${existing.status}" нельзя удалить — используйте возврат`,
      );
    }
    await this.prisma.payment.delete({ where: { id } });
  }
}

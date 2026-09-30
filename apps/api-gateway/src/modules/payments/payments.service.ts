import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '@app/database';
import { PAYMENT_STATUS_TRANSITIONS } from '@app/shared';
import { OrderStatus, PaymentStatus } from '@prisma/client';
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
      },
    });
    if (!payment) {
      throw new NotFoundException(`Платёж ${id} не найден`);
    }
    return this.toDto(payment);
  }

  private async orderPaidSum(orderId: string, excludePaymentId?: string) {
    const payments = await this.prisma.payment.findMany({
      where: {
        orderId,
        status: PaymentStatus.SUCCEEDED,
        ...(excludePaymentId ? { id: { not: excludePaymentId } } : {}),
      },
      select: { amount: true },
    });
    return round2(payments.reduce((sum, p) => sum + Number(p.amount), 0));
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
      const paid = await this.orderPaidSum(dto.orderId);
      if (round2(paid + dto.amount - Number(order.total)) > 0) {
        throw new BadRequestException(
          `Платёж ${dto.amount} превышает остаток ${round2(Number(order.total) - paid)} по заказу`,
        );
      }
    }

    const payment = await this.prisma.payment.create({
      data: {
        orderId: dto.orderId,
        amount: dto.amount,
        method: dto.method ?? 'TRANSFER',
        status: initialStatus,
        comment: dto.comment,
        paidAt: initialStatus === PaymentStatus.SUCCEEDED ? new Date() : null,
        createdById: actorId,
      },
    });
    if (initialStatus === PaymentStatus.SUCCEEDED) {
      await this.ordersService.recalcStatus(dto.orderId, actorId);
    }
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
      if (
        existing.order.status === OrderStatus.CANCELLED ||
        existing.order.status === OrderStatus.REFUNDED
      ) {
        throw new BadRequestException(
          `Нельзя подтверждать оплату по заказу в статусе "${existing.order.status}"`,
        );
      }
      const paid = await this.orderPaidSum(existing.orderId, existing.id);
      if (
        round2(paid + Number(existing.amount) - Number(existing.order.total)) >
        0
      ) {
        throw new BadRequestException(
          `Платёж ${Number(existing.amount)} превышает остаток ${round2(Number(existing.order.total) - paid)} по заказу`,
        );
      }
    }

    const updated = await this.prisma.payment.update({
      where: { id },
      data: {
        status: dto.status,
        comment: dto.comment ?? existing.comment,
        paidAt:
          dto.status === PaymentStatus.SUCCEEDED
            ? (existing.paidAt ?? new Date())
            : dto.status === PaymentStatus.PENDING
              ? null
              : existing.paidAt,
      },
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

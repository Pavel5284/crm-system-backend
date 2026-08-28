import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '@app/database';
import { CreateDealDto } from './dto/create-deal.dto';
import { UpdateDealDto } from './dto/update-deal.dto';

@Injectable()
export class DealsService {
  constructor(private readonly prisma: PrismaService) {}

  private toDto(deal: {
    id: string;
    name: string;
    price: unknown;
    status: string;
    customerId: string;
    createdAt: Date;
    updatedAt: Date;
    customer: { id: string; name: string; email: string };
  }) {
    return {
      id: deal.id,
      name: deal.name,
      price: Number(deal.price),
      status: deal.status,
      customerId: deal.customerId,
      customerName: deal.customer.name,
      customerEmail: deal.customer.email,
      createdAt: deal.createdAt,
      updatedAt: deal.updatedAt,
    };
  }

  async findAll() {
    const deals = await this.prisma.deal.findMany({
      orderBy: { createdAt: 'asc' },
      include: { customer: { select: { id: true, name: true, email: true } } },
    });
    return deals.map((deal) => this.toDto(deal));
  }

  async create(dto: CreateDealDto) {
    const email = dto.customerEmail.trim().toLowerCase();
    let customer = await this.prisma.customer.findUnique({ where: { email } });
    if (!customer) {
      customer = await this.prisma.customer.create({
        data: { email, name: dto.customerName },
      });
    }

    const deal = await this.prisma.deal.create({
      data: {
        name: dto.name,
        price: dto.price,
        status: dto.status ?? 'todo',
        customerId: customer.id,
      },
      include: { customer: { select: { id: true, name: true, email: true } } },
    });
    return this.toDto(deal);
  }

  async update(id: string, dto: UpdateDealDto) {
    const existing = await this.prisma.deal.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException(`Сделка ${id} не найдена`);
    }
    const deal = await this.prisma.deal.update({
      where: { id },
      data: { status: dto.status },
      include: { customer: { select: { id: true, name: true, email: true } } },
    });
    return this.toDto(deal);
  }
}

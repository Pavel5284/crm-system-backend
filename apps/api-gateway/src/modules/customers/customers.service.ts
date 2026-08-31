import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '@app/database';
import { UpdateCustomerDto } from './dto/update-customer.dto';

const CUSTOMER_SELECT = {
  id: true,
  name: true,
  email: true,
  avatarUrl: true,
  fromSource: true,
  createdAt: true,
  updatedAt: true,
} as const;

@Injectable()
export class CustomersService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll() {
    return this.prisma.customer.findMany({
      orderBy: { createdAt: 'asc' },
      select: CUSTOMER_SELECT,
    });
  }

  async findOne(id: string) {
    const customer = await this.prisma.customer.findUnique({
      where: { id },
      select: CUSTOMER_SELECT,
    });
    if (!customer) {
      throw new NotFoundException(`Клиент ${id} не найден`);
    }
    return customer;
  }

  async update(id: string, dto: UpdateCustomerDto) {
    const existing = await this.prisma.customer.findUnique({
      where: { id },
      select: { id: true, email: true },
    });
    if (!existing) {
      throw new NotFoundException(`Клиент ${id} не найден`);
    }

    const email = dto.email?.trim().toLowerCase();
    if (email && email !== existing.email) {
      const duplicate = await this.prisma.customer.findUnique({
        where: { email },
        select: { id: true },
      });
      if (duplicate) {
        throw new ConflictException(`Клиент с email ${email} уже существует`);
      }
    }

    return this.prisma.customer.update({
      where: { id },
      data: {
        name: dto.name,
        email,
        avatarUrl: dto.avatarUrl,
        fromSource: dto.fromSource,
      },
      select: CUSTOMER_SELECT,
    });
  }
}

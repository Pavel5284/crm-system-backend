import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { OrderStatus } from '@prisma/client';
import * as shared from '@app/shared';
import { OrdersService } from './orders.service';
import { CreateOrderDto } from './dto/create-order.dto';
import { UpdateOrderDto } from './dto/update-order.dto';
import { ChangeOrderStatusDto } from './dto/change-order-status.dto';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

@ApiTags('orders')
@Controller('orders')
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @Get()
  findAll(
    @Query('status') status?: OrderStatus,
    @Query('customerId') customerId?: string,
    @Query('dealId') dealId?: string,
  ) {
    return this.ordersService.findAll({ status, customerId, dealId });
  }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.ordersService.findOne(id);
  }

  @Post()
  @Roles(...shared.ORDER_PERMISSIONS.ORDERS_CREATE)
  create(@Body() dto: CreateOrderDto, @CurrentUser() user: shared.AuthUser) {
    return this.ordersService.create(dto, user.id);
  }

  @Patch(':id')
  @Roles(...shared.ORDER_PERMISSIONS.ORDERS_UPDATE)
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateOrderDto) {
    return this.ordersService.update(id, dto);
  }

  @Patch(':id/status')
  @Roles(...shared.ORDER_PERMISSIONS.ORDERS_UPDATE)
  changeStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ChangeOrderStatusDto,
    @CurrentUser() user: shared.AuthUser,
  ) {
    return this.ordersService.changeStatus(id, dto, user);
  }

  @Delete(':id')
  @Roles(...shared.ORDER_PERMISSIONS.ORDERS_DELETE)
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Param('id', ParseUUIDPipe) id: string) {
    await this.ordersService.remove(id);
  }
}
